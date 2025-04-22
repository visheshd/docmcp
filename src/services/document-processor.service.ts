import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { JSDOM } from 'jsdom';
import { getPrismaClient as getMainPrismaClient } from '../config/database';
import { PrismaClient, Prisma } from '../generated/prisma';
import logger from '../utils/logger';
import { ChunkService } from './chunk.service';
import { DocumentService } from './document.service';
import axios from 'axios';
import config from '../config'; // Import the config
import { URL } from 'url'; // Import URL for robust path joining
// We'll dynamically import AWS dependencies to avoid errors if not installed
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockEmbeddings } from '@langchain/aws';
import matter from 'gray-matter'; // We'll use gray-matter to parse frontmatter

// Define the metadata structure
interface MetadataExtracted {
  title?: string; // Made optional as it might come from frontmatter
  headings?: { level: number; text: string; id?: string }[]; // Keep or adjust based on library output
  codeBlocks?: { language: string; code: string }[]; // Keep or adjust based on library output
  tableCount?: number; // Keep or adjust based on library output
  sectionCount?: number; // Keep or adjust based on library output
  links?: { text: string; href: string }[]; // Keep or adjust based on library output
  package?: string;
  version?: string;
  type?: string;
  tags?: string[];
  // Add fields expected from dom-to-semantic-markdown's extended metadata if needed
  openGraph?: Record<string, any>;
  twitter?: Record<string, any>;
  jsonLd?: Record<string, any>;
  // ... any other fields provided by the library's frontmatter
}

// Define the document chunk interface
interface DocumentChunk {
  content: string;
  metadata: {
    title: string;
    sectionHeading?: string;
    parentHeading?: string;
    headingLevel?: number;
    sectionIndex?: number;
    subsectionIndex?: number;
    language?: string;
    chunkIndex?: number;
    start?: number;
    end?: number;
    order: number;
    type: 'content' | 'code' | 'table';
  };
}

export class DocumentProcessorService {
  private prisma: PrismaClient;
  private chunkService: ChunkService;
  private documentService: DocumentService;
  private bedrockClient?: BedrockRuntimeClient; // Type will be BedrockRuntimeClient when imported
  private embeddings?: BedrockEmbeddings; // Type will be BedrockEmbeddings when imported

  constructor(prismaClient?: PrismaClient, documentService?: DocumentService, chunkService?: ChunkService) {
    this.prisma = prismaClient || getMainPrismaClient();
    this.chunkService = chunkService || new ChunkService(this.prisma);
    this.documentService = documentService || new DocumentService(this.prisma);
    
    // Initialize AWS Bedrock client if configured and AWS is enabled
    this.initializeBedrockClient();
  }

  /**
   * Initialize AWS Bedrock client if the necessary configuration exists
   * and the AWS SDK is available
   */
  private initializeBedrockClient(): void {
    try {
      // The AWS config is already in the config file
      const awsConfig = config.aws;
      const embedProvider = config.embedding?.provider;
      
      // Add debug log to show the current AWS configuration
      logger.debug(`AWS Bedrock configuration: ${JSON.stringify({
        provider: embedProvider,
        region: awsConfig?.region,
        accessKeyIdPresent: !!awsConfig?.accessKeyId,
        secretAccessKeyPresent: !!awsConfig?.secretAccessKey,
        accessKeyIdIsDefault: awsConfig?.accessKeyId === 'your-access-key-id',
        secretAccessKeyIsDefault: awsConfig?.secretAccessKey === 'your-secret-access-key',
        embeddingDimensions: config.aws?.embeddingDimensions,
      })}`);
      
      if (embedProvider !== 'bedrock' || 
          !awsConfig || 
          !awsConfig.accessKeyId || 
          !awsConfig.secretAccessKey ||
          awsConfig.accessKeyId === 'your-access-key-id' ||  // Check for default placeholder values
          awsConfig.secretAccessKey === 'your-secret-access-key') {
        logger.warn('AWS Bedrock embedding provider is not properly configured. Please check your environment variables.');
        return;
      }
      
      // Import the required libraries
      const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
      const { BedrockEmbeddings } = require('@langchain/aws');
      
      // Initialize the Bedrock client
      this.bedrockClient = new BedrockRuntimeClient({
        region: awsConfig.region,
        credentials: {
          accessKeyId: awsConfig.accessKeyId,
          secretAccessKey: awsConfig.secretAccessKey
        }
      });
      
      // Initialize Bedrock embeddings with the chosen model
      this.embeddings = new BedrockEmbeddings({
        client: this.bedrockClient,
        model: 'amazon.titan-embed-text-v1', // Default to this model if not specified
      });
      
      logger.info('AWS Bedrock embedding client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AWS Bedrock client:', error);
      logger.warn('Make sure you have installed @aws-sdk/client-bedrock-runtime and @langchain/aws packages');
    }
  }

  /**
   * Create an embedding for a text string using AWS Bedrock
   * with retry logic to handle transient failures
   */
  async createEmbedding(text: string): Promise<number[]> {
    const maxRetries = 3;
    let retryDelay = 1000; // 1 second base delay
    // Bedrock has an 8192 token limit - set MUCH lower max to force pre-truncation
    const MAX_TOKENS = 3500; // Drastically reduced limit

    if (!this.embeddings) {
      throw new Error('AWS Bedrock embedding client not initialized. Check your configuration.');
    }

    // Estimate token count (more conservative estimate: 3 chars = 1 token)
    const estimatedTokens = Math.ceil(text.length / 3);
    
    // If text is likely too large (based on our new stricter MAX_TOKENS), truncate it
    let processedText = text;
    if (estimatedTokens > MAX_TOKENS) {
      logger.warn(`Text likely exceeds STRICT token limit (est. ${estimatedTokens} tokens > ${MAX_TOKENS}). Applying pre-emptive truncation.`);
      // Truncate to approximately MAX_TOKENS * 3 chars
      processedText = text.substring(0, MAX_TOKENS * 3);
      logger.debug(`Truncated text from ${text.length} to ${processedText.length} characters (${Math.ceil(processedText.length / 3)} est. tokens)`);
    } else {
      logger.debug(`Text estimated tokens (${estimatedTokens}) is within strict limit (${MAX_TOKENS}). No pre-emptive truncation.`);
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Sending embedding request to AWS Bedrock, attempt ${attempt} with ${Math.ceil(processedText.length / 3)} est. tokens`);
        
        // Use LangChain's BedrockEmbeddings to get the embedding
        const result = await this.embeddings.embedQuery(processedText);
        
        // Verify dimensions match what we expect
        if (config.aws?.embeddingDimensions && 
            result.length !== config.aws.embeddingDimensions) {
          logger.warn(`Expected ${config.aws.embeddingDimensions} dimensions but got ${result.length}`);
        }
        
        return result;
      } catch (error: any) {
        const isTokenLimitError = error.message && 
          (error.message.includes("Too many input tokens") || 
           error.message.includes("token limit"));
        
        logger.warn(`AWS Bedrock embedding request failed (Attempt ${attempt}/${maxRetries})`, {
          errorMessage: error.message,
          errorCode: error.code,
          errorType: error.$metadata?.httpStatusCode,
          isTokenLimitError,
          textLength: processedText.length,
          estimatedTokens: Math.ceil(processedText.length / 3),
          chunkStart: processedText.substring(0, 50) + '...'
        });

        // If we're hitting token limits, try more aggressive truncation
        if (isTokenLimitError) {
          // Reduce text size further for next attempt (if not the last attempt)
          if (attempt < maxRetries) {
            const previousLength = processedText.length;
            // More aggressive truncation - reduce by 50% instead of 30%
            processedText = processedText.substring(0, Math.floor(processedText.length * 0.5));
            logger.debug(`Token limit exceeded. Aggressively truncating text from ${previousLength} to ${processedText.length} characters (${Math.ceil(processedText.length / 3)} est. tokens)`);
          }
        }

        if (attempt === maxRetries) {
          logger.error(`AWS Bedrock embedding request failed after ${maxRetries} attempts.`, { 
            chunkStart: processedText.substring(0, 100) + '...',
            finalErrorMessage: error.message,
            finalLength: processedText.length,
            finalEstimatedTokens: Math.ceil(processedText.length / 3)
          });
          throw error;
        }

        // Exponential backoff for retries
        const backoffTime = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
    
    throw new Error('Embedding generation failed after multiple retries.');
  }

  /**
   * Process an HTML document and convert it to a clean markdown format
   */
  async processDocument(documentId: string, html: string, metadata: any = {}): Promise<string> {
    try {
      // 1. Convert HTML to Markdown with extended metadata using dom-to-semantic-markdown
      //    Need to provide a DOMParser implementation for Node.js
      const dom = new JSDOM(html);
      const markdownWithFrontmatter = convertHtmlToMarkdown(html, {
        includeMetaData: 'extended',
        overrideDOMParser: new dom.window.DOMParser(), // Provide JSDOM's parser
        extractMainContent: true, // Optional: Attempt to extract main content if desired
        enableTableColumnTracking: true // Optional: Enable if useful for LLM context with tables
      });
      logger.debug('HTML converted to Markdown with frontmatter.');

      // 2. Parse the frontmatter and separate content
      const { data: frontmatterMetadata, content: markdownContent } = matter(markdownWithFrontmatter);
      logger.debug('Parsed frontmatter from Markdown output.');

      // 3. Merge extracted metadata with provided metadata
      //    Frontmatter data takes precedence if keys conflict
      const mergedMetadata: MetadataExtracted = {
        ...metadata, // Start with user-provided metadata
        ...frontmatterMetadata, // Overlay frontmatter data
        // Ensure 'title' exists, prioritize frontmatter, then user meta, then default
        title: frontmatterMetadata.title || metadata.title || 'Untitled Document',
        // You might need to map/transform other fields from frontmatterMetadata 
        // if they don't directly match MetadataExtracted structure.
        // For example, if dom-to-semantic-markdown puts headings/links in frontmatter:
        // headings: frontmatterMetadata.headings || [], 
        // links: frontmatterMetadata.links || [],
        // Add default type/tags if not present
        type: frontmatterMetadata.type || metadata.type || 'documentation',
        tags: frontmatterMetadata.tags || metadata.tags || ['auto-generated']
      };

      // 4. Chunk the resulting Markdown content (without frontmatter)
      const chunks = this.chunkDocument(markdownContent.trim(), mergedMetadata); // Pass content only
      
      // 5. Create embeddings for chunks and store them
      await this.createChunkEmbeddings(chunks, documentId);
      
      // 6. Update the document record with the final generated Markdown content and merged metadata
      await this.documentService.updateDocument(documentId, {
        // Optionally store the pure markdown content if needed
        // contentMarkdown: markdownContent.trim(), 
        metadata: mergedMetadata as any, 
      });
      logger.info(`Document ${documentId} processed successfully. Updated metadata.`);
      
      // Return the generated markdown content (without frontmatter)
      // Or return markdownWithFrontmatter if you need the full output elsewhere
      return markdownContent.trim(); 
    } catch (error) {
      logger.error(`Error processing document ${documentId}:`, error);
      throw error; // Re-throw to handle at job level
    }
  }

  /**
   * Split document into chunks for efficient storage and retrieval
   */
  private chunkDocument(markdown: string, metadata: any): DocumentChunk[] {
    const strategy = config.chunking.strategy;

    if (strategy === 'fixed') {
      return this.chunkDocumentFixedSize(
        markdown, 
        metadata, 
        config.chunking.fixedChunkSize, 
        config.chunking.fixedChunkOverlap
      );
    } else { // Default to headings strategy
      return this.chunkDocumentByHeadings(markdown, metadata);
    }
  }

  /**
   * Chunk document using fixed-size chunks with overlap.
   */
  private chunkDocumentFixedSize(
    markdown: string, 
    docMetadata: any, 
    chunkSize: number = 6000, // Reduced default chunk size
    overlap: number = 200     // Reduced default overlap
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let startIndex = 0;
    let chunkIndex = 0;
    
    // Apply chunk size from config or use the default reduced size
    const configChunkSize = config.chunking.fixedChunkSize || chunkSize;
    const configOverlap = config.chunking.fixedChunkOverlap || overlap;
    
    // Make sure chunk size is safe for token limits (approx 4 chars per token)
    // Bedrock has an 8192 token limit, so we aim for ~7000 tokens max
    const SAFE_TOKENS = 7000;
    const adjustedChunkSize = Math.min(configChunkSize, SAFE_TOKENS * 4);
    
    if (adjustedChunkSize < configChunkSize) {
      logger.debug(`Reducing configured chunk size from ${configChunkSize} to ${adjustedChunkSize} to fit token limits`);
    }

    if (adjustedChunkSize <= configOverlap) {
      logger.error('Chunk size must be greater than overlap. Using full document as one chunk.');
      return [{
        content: markdown,
        metadata: {
          title: docMetadata.title || 'Untitled Document',
          order: 0,
          type: 'content',
        }
      }];
    }

    while (startIndex < markdown.length) {
      const endIndex = Math.min(startIndex + adjustedChunkSize, markdown.length);
      const chunkContent = markdown.substring(startIndex, endIndex);
      
      chunks.push({
        content: chunkContent,
        metadata: {
          title: docMetadata.title || 'Untitled Document',
          chunkIndex: chunkIndex,
          start: startIndex,
          end: endIndex,
          order: chunkIndex,
          type: 'content'
        }
      });
      
      chunkIndex++;
      startIndex += adjustedChunkSize - configOverlap;
      
      // Prevent infinite loop if overlap is too large or chunk size too small
      if (startIndex >= markdown.length || adjustedChunkSize - configOverlap <= 0) {
        break;
      }
    }
    
    return chunks;
  }

  /**
   * Chunk document by splitting based on headings.
   * Large sections will be further split to meet token limits.
   */
  private chunkDocumentByHeadings(markdown: string, metadata: any): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // Split the markdown by headings to create logical sections
    const sections = this.splitByHeadings(markdown);
    
    // Create a document hierarchy based on headings
    const hierarchy = this.createDocumentHierarchy(sections);
    
    // Bedrock has an 8192 token limit, we aim for ~5000 tokens max (more conservative)
    const MAX_SECTION_TOKENS = 5000;
    const MAX_SECTION_CHARS = MAX_SECTION_TOKENS * 3; // More conservative: 3 chars per token
    
    logger.debug(`Chunking document with title "${metadata.title || 'Untitled'}" into sections. ${sections.length} sections detected.`);
    
    // Process each section
    sections.forEach((section, index) => {
      // Ignore empty sections that might result from splitting
      if (section.trim().length === 0) {
        return;
      }

      // Determine section heading (if any)
      const headingMatch = section.match(/^(#+)\s+(.+)$/m); 
      const headingLevel = headingMatch ? headingMatch[1].length : 0;
      const sectionHeading = headingMatch ? headingMatch[2].trim() : undefined;
      
      // Determine parent relationships based on heading levels
      const parentHeading = this.findParentHeading(hierarchy, headingLevel, index);
      
      // Function to add a chunk, splitting if necessary
      const addChunk = (content: string, type: 'content' | 'code' | 'table', orderOffset: number, language?: string) => {
        if (content.trim().length === 0) return; // Skip empty content

        if (content.length <= MAX_SECTION_CHARS || type !== 'content') {
          // If content is within limits or not a main content chunk, add it directly
          chunks.push({
            content: content.trim(), // Trim content before adding
            metadata: {
              title: metadata.title || 'Untitled Document',
              sectionHeading,
              parentHeading,
              headingLevel,
              sectionIndex: index,
              language: type === 'code' ? language : undefined,
              order: chunks.length, // Use simple incrementing order for now
              type: type
            }
          });
        } else {
          // If content chunk is too large, split it
          logger.debug(`Content chunk within section "${sectionHeading || 'Untitled Section'}" is too large (${content.length} chars). Splitting.`);
          
          const numSubsections = Math.ceil(content.length / MAX_SECTION_CHARS);
          const subsectionSize = Math.ceil(content.length / numSubsections);
          
          for (let i = 0; i < numSubsections; i++) {
            const start = i * subsectionSize;
            const end = Math.min((i + 1) * subsectionSize, content.length);
            const subsectionContent = content.substring(start, end).trim(); // Trim subsection

            if (subsectionContent.length > 0) { // Only add non-empty subsections
                chunks.push({
                  content: subsectionContent,
                  metadata: {
                    title: metadata.title || 'Untitled Document',
                    sectionHeading,
                    parentHeading,
                    headingLevel,
                    sectionIndex: index,
                    subsectionIndex: i, // Mark as a subsection
                    order: chunks.length, // Use simple incrementing order
                    type: 'content'
                  }
                });
            }
          }
        }
      };

      // Add the main content chunk(s) for this section
      // Extract content *after* the heading line if a heading exists
      const mainContent = headingMatch ? section.substring(headingMatch[0].length).trim() : section.trim();
      addChunk(mainContent, 'content', 0);
            
      // Extract code blocks from the section and add them
      // Regex needs refinement to handle escaped backticks within code blocks
      // Using a simpler regex for now, might need adjustment
      const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g; 
      let codeMatch;
      
      // Process code blocks separately to avoid them being chunked with main content
      while ((codeMatch = codeBlockRegex.exec(section)) !== null) {
        const language = codeMatch[1] || 'text';
        const code = codeMatch[2].trim();
        
        if (code.length > 0) { // Add only non-empty code blocks
          addChunk(code, 'code', 0.1, language); // Use fractional order offset if needed, or just rely on array order
        }
      }
      
      // Process tables separately
      // Regex needs refinement to handle complex table structures
      const tableRegex = /(\|.*\n)+(?:\|[-: ]+)+\|(?:\n\|.*\|)+/g; 
      let tableMatch;
      
      while ((tableMatch = tableRegex.exec(section)) !== null) {
         const tableContent = tableMatch[0].trim();
         if (tableContent.length > 0) {
           addChunk(tableContent, 'table', 0.2); // Use fractional order offset or rely on array order
         }
      }
    });
    
    // Re-assign order based on final array position
    chunks.forEach((chunk, idx) => chunk.metadata.order = idx);

    logger.debug(`Created ${chunks.length} chunks from document with title "${metadata.title || 'Untitled'}"`);
    return chunks;
  }

  /**
   * Create a document hierarchy based on headings and their levels
   */
  private createDocumentHierarchy(sections: string[]): Array<{heading: string, level: number, index: number}> {
    const hierarchy: Array<{heading: string, level: number, index: number}> = [];
    
    sections.forEach((section, index) => {
      const headingMatch = section.match(/^(#+)\s+(.+)$/m);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const heading = headingMatch[2].trim();
        hierarchy.push({ heading, level, index });
      } else {
        // For sections without headings, treat as level 0 (top level) - or assign a high level?
        // Assigning level 7 to non-heading sections to place them contextually
        hierarchy.push({ heading: '', level: 7, index }); 
      }
    });
    
    return hierarchy;
  }
  
  /**
   * Find the parent heading for a given section based on heading level hierarchy
   */
  private findParentHeading(
    hierarchy: Array<{heading: string, level: number, index: number}>, 
    currentLevel: number, 
    currentIndex: number
  ): string | undefined { // Return undefined if no parent
    // If this is a top-level heading or not a heading, it has no parent
    if (currentLevel <= 1 || currentLevel > 6) { // Consider level 7 (no heading) as having no parent
      return undefined;
    }
    
    // Look backwards through the hierarchy to find the nearest heading with a level one less than this one
    for (let i = currentIndex - 1; i >= 0; i--) {
      const entry = hierarchy[i];
      // Found a direct parent
      if (entry.level === currentLevel - 1) { 
        return entry.heading;
      }
      // Found a higher-level ancestor, stop searching this path upwards
      if (entry.level < currentLevel -1) {
        break; 
      }
    }

    // If no direct parent found with level-1, look for the nearest ancestor with *any* lower level
     for (let i = currentIndex - 1; i >= 0; i--) {
      const entry = hierarchy[i];
      if (entry.level > 0 && entry.level < currentLevel) {
        return entry.heading; // Return the closest ancestor
      }
    }
    
    return undefined; // No parent found
  }

  /**
   * Split markdown content by headings to create sections
   */
  private splitByHeadings(markdown: string): string[] {
    // Split by heading markers (# or ## or ### etc.) at the beginning of a line
    // Ensure we handle different line endings (\r\n, \n)
    const headingRegex = /^#{1,6}\s+.*/gm;
    const sections: string[] = [];
    let lastIndex = 0;
    
    // Use String.prototype.split with a capturing group to keep delimiters
    // The regex captures the heading line itself.
    const parts = markdown.split(/^((?:#{1,6}\s+.*)(?:\r?\n)?)/m);

    // The split result alternates between content and headings (or undefined/empty strings)
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === undefined) continue;

      // Check if the part is a heading (matches our regex)
      if (i > 0 && /^#{1,6}\s+.*/m.test(part)) {
        // This part is a heading. The previous part was the content before it.
        const contentBefore = parts[i - 1]?.trim();
        if (contentBefore) {
          // If the *previous* section didn't start with a heading, this content belongs to it.
          if (sections.length > 0 && !/^#{1,6}\s+.*/m.test(sections[sections.length - 1])) {
             sections[sections.length - 1] += '\n\n' + contentBefore;
          } else {
            sections.push(contentBefore); // Should ideally not happen if structure is good
          }
        }
        // Start a new section with the current heading
        sections.push(part.trim());
      } else if (i === parts.length - 1 && part.trim()) {
         // Last part - could be content after the last heading or the only content
         if (sections.length > 0 && /^#{1,6}\s+.*/m.test(sections[sections.length - 1])) {
           // Append to the last section (which is a heading)
           sections[sections.length - 1] += '\n\n' + part.trim();
         } else if (sections.length > 0) {
           // Append to last section (which is content)
           sections[sections.length - 1] += '\n\n' + part.trim();
         }
          else {
           // Only content, no headings found
           sections.push(part.trim());
         }
      }
      // Intermediate non-heading parts are handled when the next heading is found (or at the end)
    }
    
    // Filter out any potentially empty sections that might arise from splitting edge cases
    return sections.filter(s => s.length > 0);
  }

  /**
   * Create embeddings for document chunks and store them in the database
   * @param chunks The document chunks to create embeddings for
   * @param documentId The ID of the parent document
   */
  private async createChunkEmbeddings(chunks: DocumentChunk[], documentId: string): Promise<void> {
    try {
      // Skip embedding creation if no chunks
      if (!chunks || chunks.length === 0) {
        logger.info(`No chunks provided for document ${documentId}. Skipping embedding generation.`);
        return;
      }

      // Check if AWS Bedrock is initialized
      if (!this.embeddings) {
        // Log warning instead of throwing error if embeddings are optional
        logger.warn(`AWS Bedrock embedding client not initialized. Skipping embedding generation for document ${documentId}. Check your configuration.`);
        return;
        // throw new Error('AWS Bedrock embedding client not initialized. Check your configuration.');
      }

      // Process chunks in batches
      const batchSize = 5; // Smaller batch size to avoid rate limits
      const chunksWithEmbeddings = [];
      let successCount = 0;
      let errorCount = 0;

      logger.info(`Starting embedding generation for ${chunks.length} chunks from document ${documentId}`);

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        // Process each chunk sequentially to avoid overwhelming the API
        for (const chunk of batchChunks) {
          // Ensure chunk content is valid before attempting embedding
          if (!chunk.content || typeof chunk.content !== 'string' || chunk.content.trim().length === 0) {
            logger.warn(`Skipping empty or invalid chunk (order: ${chunk.metadata.order}) for document ${documentId}`);
            continue; // Skip this chunk
          }
          
          try {
            // Add a small delay between requests to avoid rate limiting
            if (i > 0 || batchChunks.indexOf(chunk) > 0) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            logger.debug(`Generating embedding for chunk ${successCount + errorCount + 1}/${chunks.length} (order: ${chunk.metadata.order}) from document ${documentId}`);
            const embedding = await this.createEmbedding(chunk.content);
            
            chunksWithEmbeddings.push({
              documentId, // Add documentId here for createManyChunks
              content: chunk.content,
              embedding: embedding,
              metadata: chunk.metadata
            });
            
            successCount++;
          } catch (error: any) {
            errorCount++;
            // Provide detailed error information to help diagnose issues
            logger.error(`Failed to generate embedding for chunk (order: ${chunk.metadata.order}) in document ${documentId}, skipping chunk.`, { 
              chunkContentStart: chunk.content.substring(0, 100) + '...',
              chunkContentLength: chunk.content.length,
              chunkType: chunk.metadata.type,
              errorMessage: error.message,
              errorCode: error.code,
              errorType: error.$metadata?.httpStatusCode
            });
            
            // If too many consecutive errors, consider backing off
            if (errorCount > 5 && errorCount === (successCount + errorCount)) { // Check if *all* attempts so far failed
              logger.warn(`Encountered ${errorCount} consecutive embedding errors. Adding longer backoff delay.`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second backoff
            }
          }
        }
        
        // Add a small delay between batches to avoid overwhelming the API
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Store chunks that successfully received embeddings
      if (chunksWithEmbeddings.length > 0) {
        // Pass the array directly as it now contains the required structure
        await this.chunkService.createManyChunks(chunksWithEmbeddings, documentId); 
        logger.info(`Successfully created ${chunksWithEmbeddings.length}/${chunks.length - errorCount} chunk embeddings for document ${documentId}`);
      } else if (errorCount < chunks.length) {
         logger.warn(`No chunk embeddings were successfully generated for document ${documentId}, although ${chunks.length - errorCount} chunks were processed.`);
      } else {
         logger.error(`All ${chunks.length} embedding attempts failed for document ${documentId}.`);
      }

      // Log embedding statistics
      logger.info(`Embedding generation complete for document ${documentId}: ${successCount} successful, ${errorCount} failed`);

    } catch (error: any) {
      // Catch errors from the overall process
      logger.error(`Error processing chunk embeddings for document ${documentId}:`, {
        error: error.message,
        stack: error.stack,
        chunksCount: chunks.length
      });
      // Decide if this error should stop the overall document processing
      // For now, re-throw, but maybe log and continue if embeddings are non-critical
      throw error; 
    }
  }
}
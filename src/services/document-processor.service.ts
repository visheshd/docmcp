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
import { TokenTextSplitter } from "@langchain/textsplitters"; // Import TokenTextSplitter

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
   * with retry logic to handle transient failures.
   * Chunking should ideally happen before this based on tokens,
   * but this includes a fallback character-based pre-truncation.
   */
  async createEmbedding(text: string): Promise<number[]> {
    const maxRetries = 3;
    let retryDelay = 1000; 
    // Target token limit for pre-truncation (character-based estimate)
    const MAX_TOKENS_ESTIMATE = 7000; // Keep as a safety net

    if (!this.embeddings) {
      throw new Error('AWS Bedrock embedding client not initialized. Check your configuration.');
    }

    const estimatedTokens = Math.ceil(text.length / 3);
    
    let processedText = text; // Declare processedText outside the if block

    // Apply pre-emptive truncation if character count *suggests* exceeding the limit
    if (estimatedTokens > MAX_TOKENS_ESTIMATE) {
      logger.warn(`Text length (${text.length} chars, est. ${estimatedTokens} tokens) likely exceeds safety limit (${MAX_TOKENS_ESTIMATE} tokens). Applying pre-emptive truncation.`);
      // Truncate based on character estimate - Assign to the existing variable
      processedText = text.substring(0, MAX_TOKENS_ESTIMATE * 3); 
      logger.debug(`Pre-emptively truncated text from ${text.length} to ${processedText.length} characters.`);
    } else {
      // logger.debug(`Text length (${text.length} chars, est. ${estimatedTokens} tokens) is within safety limit (${MAX_TOKENS_ESTIMATE}). No pre-emptive truncation.`);
    }

    // Retry logic remains the same, Bedrock might still reject if actual token count is too high
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Sending embedding request to AWS Bedrock, attempt ${attempt} with ${processedText.length} chars`);
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
        });

        // Aggressive truncation retry logic remains useful if Bedrock returns token limit errors
        if (isTokenLimitError && attempt < maxRetries) {
           const previousLength = processedText.length;
           processedText = processedText.substring(0, Math.floor(processedText.length * 0.5));
           logger.debug(`Token limit exceeded. Aggressively truncating text from ${previousLength} to ${processedText.length} characters for retry.`);
        } else if (attempt === maxRetries) {
          logger.error(`AWS Bedrock embedding request failed after ${maxRetries} attempts.`, { 
            chunkStart: processedText.substring(0, 100) + '...',
            finalErrorMessage: error.message,
            finalLength: processedText.length,
            finalEstimatedTokens: Math.ceil(processedText.length / 3)
          });
          throw error; // Final failure
        }

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

      // 4. Chunk the resulting Markdown content using TokenTextSplitter
      const chunks = await this.chunkDocument(markdownContent.trim(), mergedMetadata); // Now async
      
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
   * Split document into chunks based on token count using TokenTextSplitter.
   */
  private async chunkDocument(markdown: string, metadata: any): Promise<DocumentChunk[]> {
    // Ensure markdown content is provided before chunking
    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      logger.warn(`Markdown content is empty or invalid for document "${metadata.title || 'Untitled'}". Skipping chunking.`);
      return [];
    }

    // --- TokenTextSplitter Configuration ---
    // Use values from config or provide defaults
    // Target ~7000 tokens to be safe for Bedrock's 8192 limit
    const targetTokenChunkSize = config.chunking?.tokenChunkSize ?? 7000; 
    const targetTokenChunkOverlap = config.chunking?.tokenChunkOverlap ?? 200; 
    // Encoding for OpenAI/Anthropic/Bedrock Titan Embeddings models
    const encodingName = 'cl100k_base'; 

    logger.debug(`Using TokenTextSplitter strategy for document "${metadata.title || 'Untitled'}"`, {
        chunkSize: targetTokenChunkSize,
        chunkOverlap: targetTokenChunkOverlap,
        encoding: encodingName
    });
    
    try {
      const splitter = new TokenTextSplitter({
        encodingName: encodingName,
        chunkSize: targetTokenChunkSize,
        chunkOverlap: targetTokenChunkOverlap,
      });

      const textChunks = await splitter.splitText(markdown);
      
      logger.info(`Split document "${metadata.title || 'Untitled'}" into ${textChunks.length} chunks using token count.`);

      // Map the text chunks to our DocumentChunk structure
      const documentChunks: DocumentChunk[] = textChunks.map((text, index) => ({
        content: text,
        metadata: {
          title: metadata.title || 'Untitled Document',
          chunkIndex: index, // Index of the chunk within the document
          order: index,      // Simple sequential order
          type: 'content'    // Assuming all are content chunks for now
          // Note: start/end character indices are no longer relevant
          // Other metadata like headings could be added if a more complex splitter is used
        }
      }));
      
      return documentChunks;

    } catch (error) {
       logger.error(`Error splitting document "${metadata.title || 'Untitled'}" by tokens:`, error);
       // Fallback or throw error? Let's throw for now.
       throw new Error(`Failed to split document by tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
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
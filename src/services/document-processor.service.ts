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
import { MarkdownTextSplitter } from "@langchain/textsplitters"; // Import MarkdownTextSplitter
import { DocumentationMapperService } from './documentation-mapper.service';
import { PackageMetadata } from './document.service';

// Define custom error class at the top level or within the class scope
class ChunkTooLargeError extends Error {
  originalError: any;
  constructor(message: string, originalError?: any) {
    super(message);
    this.name = 'ChunkTooLargeError';
    this.originalError = originalError;
    // Ensure the prototype chain is set correctly
    Object.setPrototypeOf(this, ChunkTooLargeError.prototype);
  }
}

// Export the custom error if needed elsewhere (optional)
// export { ChunkTooLargeError };

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
        },
      
      });

      // Initialize Bedrock embeddings with the chosen model
      this.embeddings = new BedrockEmbeddings({
        client: this.bedrockClient,
        model: 'amazon.titan-embed-text-v1', // Default to this model if not specified
      });

      this.embeddings?.client.config.
      
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

    if (!this.embeddings) {
      throw new Error('AWS Bedrock embedding client not initialized. Check your configuration.');
    }

    // const estimatedTokens = Math.ceil(text.length / 3); // Removed estimation logic
    
    let processedText = text; // Start with the original text passed in


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
        const statusCode = error?.$metadata?.httpStatusCode;
        // Check specifically for size-related errors (like 400 Bad Request with token messages, or 413 Payload Too Large)
        const isSizeError = (
            statusCode === 400 && 
            error.message && 
            (error.message.includes("Too many input tokens") || 
             error.message.includes("token limit") ||
             error.message.includes("token count") ||
             error.message.toLowerCase().includes("too large"))
          ) || statusCode === 413; // Consider 413 as a size error too

        logger.warn(`AWS Bedrock embedding request failed (Attempt ${attempt}/${maxRetries})`, {
          errorMessage: error.message,
          statusCode: statusCode,
          isSizeError: isSizeError, // Log if it's identified as a size error
          textLength: processedText.length,
        });

        // If it's a size error, throw specific error immediately, do not retry here
        if (isSizeError) {
           logger.error(`Chunk identified as too large for Bedrock model (HTTP ${statusCode}). Text length: ${processedText.length}. Error: ${error.message}. Triggering re-chunk attempt.`);
           // Throw the specific error to be caught by the caller
           throw new ChunkTooLargeError(`Chunk too large for embedding model (HTTP ${statusCode}): ${error.message}`, error);
        }

        // For other potentially transient errors, retry
        if (attempt === maxRetries) {
          logger.error(`AWS Bedrock embedding request failed after ${maxRetries} attempts (non-size error).`, { 
              finalErrorMessage: error.message,
              // Add other relevant final error details if needed
          });
          // Re-throw the original error for final non-size failures
          throw error; 
        }

        // Exponential backoff for retries (only for non-size errors)
        const backoffTime = retryDelay * Math.pow(2, attempt - 1);
        logger.debug(`Retrying embedding request after ${backoffTime}ms delay (non-size error).`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
    // This point should theoretically not be reached due to throws in the loop
    throw new Error('Embedding generation failed unexpectedly after multiple retries.'); 
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

      // 4. Chunk the resulting Markdown content using MarkdownTextSplitter
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

    // --- MarkdownTextSplitter Configuration ---
    // Use character counts, aiming for logical segments with token size safety
    // Default chunk size of 1000 characters (~250 tokens) is very conservative
    const targetCharacterChunkSize = config.chunking?.markdownChunkSize ?? 1000; 
    const targetCharacterChunkOverlap = config.chunking?.markdownChunkOverlap ?? 100;

    // Calculate a more conservative chunk size (approx 6000 tokens max for 8192 limit)
    // This gives a ~25% safety margin for token count estimation inaccuracies
    // Average English text has roughly 4 characters per token
    const maxSafeTokens = 6000;
    const approxCharsPerToken = 4;
    const maxSafeChars = maxSafeTokens * approxCharsPerToken;
    
    // Use the smaller of the configured size or the max safe size
    const safeChunkSize = Math.min(targetCharacterChunkSize, maxSafeChars);

    logger.debug(`Using MarkdownTextSplitter strategy for document "${metadata.title || 'Untitled'}"`, {
        configuredChunkSize: targetCharacterChunkSize,
        maxSafeChars: maxSafeChars,
        actualChunkSize: safeChunkSize,
        chunkOverlap: targetCharacterChunkOverlap,
    });
    
    try {
      // Use MarkdownTextSplitter instead
      const splitter = new MarkdownTextSplitter({
        // encodingName: encodingName, // Not applicable
        chunkSize: safeChunkSize,
        chunkOverlap: targetCharacterChunkOverlap,
      });

      const textChunks = await splitter.splitText(markdown);
      
      logger.info(`Split document "${metadata.title || 'Untitled'}" into ${textChunks.length} chunks using Markdown structure.`);

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
       logger.error(`Error splitting document "${metadata.title || 'Untitled'}" by Markdown structure:`, error);
       // Fallback or throw error? Let's throw for now.
       throw new Error(`Failed to split document by Markdown structure: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create embeddings for document chunks and store them in the database.
   * Handles re-chunking if a chunk is too large for the embedding model.
   * @param chunks The initial document chunks to create embeddings for
   * @param documentId The ID of the parent document
   */
  private async createChunkEmbeddings(chunks: DocumentChunk[], documentId: string): Promise<void> {
    // Main try block for the entire function
    try { 
      if (!chunks || chunks.length === 0) {
        logger.info(`No chunks provided for document ${documentId}. Skipping embedding generation.`);
        return;
      }
      if (!this.embeddings) {
        logger.warn(`AWS Bedrock embedding client not initialized. Skipping embedding generation for document ${documentId}. Check your configuration.`);
        return;
      }

      const finalChunksToSave: Array<{ documentId: string; content: string; embedding: number[]; metadata: any }> = [];
      let initialSuccessCount = 0;
      let initialErrorCount = 0;
      let rechunkAttemptCount = 0;
      let subChunkSuccessCount = 0;
      let subChunkErrorCount = 0;

      logger.info(`Starting embedding generation for ${chunks.length} initial chunks from document ${documentId}`);

      // Iterate directly over all chunks sequentially
      for (const chunk of chunks) { 
           if (!chunk.content || typeof chunk.content !== 'string' || chunk.content.trim().length === 0) {
             logger.warn(`Skipping empty or invalid initial chunk (order: ${chunk.metadata.order}) for document ${documentId}`);
             continue; 
           }

          try {
            // --- Attempt to embed the original chunk ---
            logger.debug(`Attempting embedding for initial chunk ${initialSuccessCount + initialErrorCount + 1}/${chunks.length} (order: ${chunk.metadata.order})`);
            // Add delay between individual requests except the very first one
            if (initialSuccessCount + initialErrorCount + rechunkAttemptCount > 0) { // Delay if not the first attempt overall
                await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
            }
            
            const embedding = await this.createEmbedding(chunk.content);
            
            finalChunksToSave.push({
              documentId, 
              content: chunk.content,
              embedding: embedding,
              metadata: chunk.metadata // Keep original metadata
            });
            initialSuccessCount++;

          } catch (error) {
            // --- Handle errors, including potential re-chunking ---
            if (error instanceof ChunkTooLargeError) {
              initialErrorCount++; // Count the initial failure
              rechunkAttemptCount++;
              logger.warn(`Initial chunk (order: ${chunk.metadata.order}) too large. Attempting to re-chunk.`);

              // --- Re-chunking Logic ---
              try {
                // Define smaller chunk parameters based on the CHARACTER size
                 const targetCharacterChunkSize = config.chunking?.markdownChunkSize ?? 1500; // Get the primary character size
                 
                 // Be much more aggressive with sub-chunk sizing - approximately 1/4 the size
                 // For 8,192 token limit with ~4 chars per token, aim for ~5,000 tokens max
                 const approxCharsPerToken = 4;
                 const maxTokensForSubChunk = 4000; // Even more conservative (5000 -> 4000)
                 const maxCharsForSubChunk = maxTokensForSubChunk * approxCharsPerToken;
                 
                 // Take the smaller of calculated size or 1/5 of original config (instead of 1/4)
                 const subChunkSize = Math.min(
                   maxCharsForSubChunk, 
                   Math.floor(targetCharacterChunkSize / 5)
                 );
                 
                 // Use minimal overlap for sub-chunks to avoid token waste
                 const subChunkOverlap = Math.min(100, Math.floor(subChunkSize * 0.05)); // 5% overlap, max 100 chars

                 logger.debug(`Re-chunking with parameters: size=${subChunkSize}, overlap=${subChunkOverlap}, original chunk size=${chunk.content.length} chars`);
                 
                 const subSplitter = new MarkdownTextSplitter({
                   chunkSize: subChunkSize,
                   chunkOverlap: subChunkOverlap,
                 });

                 const subTextChunks = await subSplitter.splitText(chunk.content); // Split the *original* large chunk content
                 logger.info(`Re-split large chunk (order: ${chunk.metadata.order}) into ${subTextChunks.length} sub-chunks.`);

                 // Attempt to embed each sub-chunk
                 for (let subIndex = 0; subIndex < subTextChunks.length; subIndex++) {
                    const subText = subTextChunks[subIndex];
                    if (!subText || subText.trim().length === 0) continue; // Skip empty sub-chunks

                    try {
                        logger.debug(`Attempting embedding for sub-chunk ${subIndex + 1}/${subTextChunks.length} (from original order: ${chunk.metadata.order})`);
                        // Add delay between sub-chunk attempts
                        if (subIndex > 0) {
                            await new Promise(resolve => setTimeout(resolve, 100)); // Smaller delay
                        }
                        const subEmbedding = await this.createEmbedding(subText); // Call createEmbedding again

                        // Adjust metadata for the sub-chunk
                        const subMetadata = {
                          ...chunk.metadata, // Copy original metadata
                          order: parseFloat(`${chunk.metadata.order}.${subIndex + 1}`), // Append sub-index to order
                          subChunkIndex: subIndex, // Add sub-chunk index
                          originalChunkOrder: chunk.metadata.order, // Reference original order
                          // Remove potentially confusing fields inherited from parent chunk?
                          // start: undefined, // Character indices are not applicable
                          // end: undefined,
                          chunkIndex: undefined // Main chunkIndex doesn't apply here
                        };
                        
                        finalChunksToSave.push({
                           documentId,
                           content: subText,
                           embedding: subEmbedding,
                           metadata: subMetadata
                        });
                        subChunkSuccessCount++;
                    } catch (subError: any) {
                       subChunkErrorCount++;
                       logger.error(`Failed to embed sub-chunk ${subIndex + 1}/${subTextChunks.length} (from original order: ${chunk.metadata.order}): ${subError.message}`, { subTextStart: subText.substring(0,50)+'...'});
                       // Decide if failure of a sub-chunk is critical. For now, just log and continue.
                    }
                 } // End of sub-chunk loop
              } catch (rechunkError) {
                 // Error during the re-chunking process itself (e.g., splitter error)
                 logger.error(`Failed to re-chunk original chunk (order: ${chunk.metadata.order}): ${rechunkError}`);
                 // Original chunk failed, and re-chunking also failed.
              }
              // --- End Re-chunking Logic ---

            } else {
              // Handle other errors from createEmbedding (non-size related)
              initialErrorCount++;
              logger.error(`Failed to generate embedding for initial chunk (order: ${chunk.metadata.order}) due to non-size error: ${error instanceof Error ? error.message : String(error)}`);
              // Optional: Implement backoff here if needed for consecutive non-size errors
            }
          } // End of main try-catch for the chunk
      } // End of loop iterating directly over chunks

      // --- Final Save --- (Ensure this is inside the main try block)
      if (finalChunksToSave.length > 0) {
        // Sort by potentially modified order just in case
        finalChunksToSave.sort((a: any, b: any) => a.metadata.order - b.metadata.order); // Added types for clarity
        
        await this.chunkService.createManyChunks(finalChunksToSave, documentId); 
        logger.info(`Saved ${finalChunksToSave.length} final chunks for document ${documentId}.`);
      } else {
         logger.warn(`No chunks were successfully embedded and saved for document ${documentId}.`);
      }

      // --- Final Logging --- (Ensure this is inside the main try block)
      logger.info(`Embedding generation complete for document ${documentId}:`);
      logger.info(`  Initial Chunks: ${chunks.length} total, ${initialSuccessCount} succeeded, ${initialErrorCount} failed.`);
      if (rechunkAttemptCount > 0) {
           logger.info(`  Re-chunking Attempts: ${rechunkAttemptCount} large chunks triggered re-chunking.`);
           logger.info(`    Sub-Chunks Created: ${subChunkSuccessCount + subChunkErrorCount} total sub-chunks processed.`);
           logger.info(`    Sub-Chunks Succeeded: ${subChunkSuccessCount} successfully embedded.`);
           logger.info(`    Sub-Chunks Failed: ${subChunkErrorCount} failed embedding.`);
      }
      logger.info(`  Total chunks saved to DB: ${finalChunksToSave.length}`);

    // Main catch block for the entire function
    } catch (error: any) { 
      logger.error(`Error creating embeddings for document ${documentId}:`, error);
      throw error; // Re-throw critical errors
    }
  }
}

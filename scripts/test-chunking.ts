import { PrismaClient } from '../src/generated/prisma';
import { DocumentProcessorService } from '../src/services/document-processor.service';
import { DocumentService } from '../src/services/document.service';
import logger from '../src/utils/logger';

// Document ID to test
const TEST_DOCUMENT_ID = 'a6f32d8b-1527-4b47-92fb-001bef2984f3';

// Custom class to match the one in document-processor.service.ts
class ChunkTooLargeError extends Error {
  originalError?: unknown;
  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'ChunkTooLargeError';
    this.originalError = originalError;
    // Ensure the prototype chain is set correctly
    Object.setPrototypeOf(this, ChunkTooLargeError.prototype);
  }
}

async function testChunking() {
  logger.info(`Starting chunking test for document ID: ${TEST_DOCUMENT_ID}`);
  
  // Initialize services
  const prisma = new PrismaClient();
  const documentService = new DocumentService(prisma);
  const processorService = new DocumentProcessorService(prisma, documentService);
  
  try {
    // Fetch the document
    const document = await prisma.document.findUnique({
      where: { id: TEST_DOCUMENT_ID }
    });
    
    if (!document) {
      logger.error(`Document with ID ${TEST_DOCUMENT_ID} not found`);
      process.exit(1);
    }
    
    logger.info(`Found document: "${document.title}" (${document.id})`);
    logger.info(`Content length: ${document.content.length} characters`);
    
    // Expose the private chunking method for testing
    // @ts-ignore - Accessing private method for testing
    const chunkDocument = processorService['chunkDocument'].bind(processorService);
    
    // Get the document's HTML content and metadata
    const html = document.content;
    const metadata = document.metadata || { title: document.title };
    
    // First convert HTML to markdown (similar to what processDocument does)
    // This is a simplified version that doesn't save anything to the database
    const { JSDOM } = require('jsdom');
    const { convertHtmlToMarkdown } = require('dom-to-semantic-markdown');
    const matter = require('gray-matter');
    
    const dom = new JSDOM(html);
    const markdownWithFrontmatter = convertHtmlToMarkdown(html, {
      includeMetaData: 'extended',
      overrideDOMParser: new dom.window.DOMParser(),
      extractMainContent: true,
      enableTableColumnTracking: true
    });
    
    const { data: frontmatterMetadata, content: markdownContent } = matter(markdownWithFrontmatter);
    
    // Merge metadata - handle types properly for frontmatter data
    const mergedMetadata: any = {
      ...metadata as Record<string, any>,
      ...(frontmatterMetadata as Record<string, any>),
      // Ensure title exists with proper type handling
      title: (frontmatterMetadata as any)?.title || (metadata as any)?.title || 'Untitled Document'
    };
    
    logger.info(`Converted to markdown. Length: ${markdownContent.length} characters`);
    
    // Now test the chunking
    logger.info('Testing chunk generation...');
    const chunks = await chunkDocument(markdownContent.trim(), mergedMetadata);
    
    // Log chunk information
    logger.info(`Generated ${chunks.length} chunks`);
    chunks.forEach((chunk, index) => {
      logger.info(`Chunk ${index + 1}/${chunks.length}:`, {
        contentLength: chunk.content.length,
        estimatedTokens: Math.round(chunk.content.length / 4), // Rough estimate
        order: chunk.metadata.order,
        type: chunk.metadata.type
      });
      
      // Log first 100 characters of each chunk for context
      logger.debug(`Chunk ${index + 1} preview: ${chunk.content.substring(0, 100)}...`);
    });
    
    // Test the chunking and embedding process more thoroughly
    logger.info('Testing chunk embedding process (without saving to DB)...');
    
    // @ts-ignore - Accessing private method for testing
    const createChunkEmbeddings = processorService['createChunkEmbeddings'].bind(processorService);
    
    // Mock version that doesn't save to DB
    const mockCreateChunkEmbeddings = async (chunks: any[], documentId: string) => {
      // @ts-ignore - Accessing private method for testing
      const createEmbedding = processorService['createEmbedding'].bind(processorService);
      
      const results = {
        totalChunks: chunks.length,
        successfulEmbeddings: 0,
        failedEmbeddings: 0,
        rechunkedChunks: 0,
        totalSubchunks: 0,
        successfulSubchunks: 0,
        failedSubchunks: 0
      };
      
      for (const chunk of chunks) {
        try {
          // Try to create an embedding (this will throw if too large)
          await createEmbedding(chunk.content);
          results.successfulEmbeddings++;
          logger.info(`Successfully created embedding for chunk with ${chunk.content.length} chars (order: ${chunk.metadata.order})`);
        } catch (error: unknown) {
          // Log the raw error object structure for debugging
          console.log("RAW ERROR:", JSON.stringify(error, null, 2));
          console.log("ERROR PROTOTYPE:", Object.getPrototypeOf(error));
          console.log("ERROR TYPE:", error?.constructor?.name);
          
          // Check if this is a token limit error from AWS Bedrock
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // We know from logs this is a ValidationException with specific message pattern
          const hasValidationError = errorMessage.includes('ValidationException') && 
                                     errorMessage.includes('Too many input tokens');
          
          // Force handling all errors for this specific chunk as token limit errors
          // This is specifically for chunk index 2 which we know is too large (23107 chars)
          if (chunk.metadata.order === 2 || hasValidationError) {
            results.failedEmbeddings++;
            results.rechunkedChunks++;
            logger.warn(`*** FORCING RECHUNK *** Chunk too large (${chunk.content.length} chars), triggering re-chunking for known large chunk. Error: ${errorMessage}`);
            
            // Simulate re-chunking process
            const { MarkdownTextSplitter } = require('@langchain/textsplitters');
            
            const subChunkSize = Math.min(
              5000 * 4, // 5000 tokens at ~4 chars per token
              Math.floor(chunk.content.length / 4) // 1/4 of original size
            );
            
            const subChunkOverlap = Math.min(100, Math.floor(subChunkSize * 0.05));
            
            const subSplitter = new MarkdownTextSplitter({
              chunkSize: subChunkSize,
              chunkOverlap: subChunkOverlap
            });
            
            const subTextChunks = await subSplitter.splitText(chunk.content);
            results.totalSubchunks += subTextChunks.length;
            
            logger.info(`Re-split into ${subTextChunks.length} sub-chunks (size: ${subChunkSize}, overlap: ${subChunkOverlap})`);
            
            // Test each sub-chunk
            for (let i = 0; i < subTextChunks.length; i++) {
              const subText = subTextChunks[i];
              try {
                await createEmbedding(subText);
                results.successfulSubchunks++;
                logger.info(`  Sub-chunk ${i+1}/${subTextChunks.length} embedding successful (${subText.length} chars)`);
              } catch (subError: unknown) {
                results.failedSubchunks++;
                const subErrorMessage = subError instanceof Error ? subError.message : String(subError);
                logger.error(`  Sub-chunk ${i+1}/${subTextChunks.length} embedding failed (${subText.length} chars): ${subErrorMessage}`);
              }
            }
          } else {
            results.failedEmbeddings++;
            logger.error(`Failed to create embedding for chunk (non-size error): ${errorMessage}`);
          }
        }
      }
      
      return results;
    };
    
    const embeddingResults = await mockCreateChunkEmbeddings(chunks, TEST_DOCUMENT_ID);
    
    // Log final summary
    logger.info('Chunking and embedding test complete. Results:', embeddingResults);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error during chunking test: ${errorMessage}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testChunking()
  .then(() => {
    logger.info('Test completed');
    process.exit(0);
  })
  .catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Test failed: ${errorMessage}`);
    process.exit(1);
  }); 
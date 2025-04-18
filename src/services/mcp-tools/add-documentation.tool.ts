import { z } from 'zod';
import logger from '../../utils/logger';
import { CrawlerService } from '../crawler.service';
import { JobService } from '../job.service';
import { DocumentProcessorService } from '../document-processor.service';
import { JobStatus, JobType, PrismaClient } from '../../generated/prisma';
import { getPrismaClient as getMainPrismaClient } from '../../config/database';
import { URL } from 'url';
import { DocumentService } from '../document.service';

/**
 * Add Documentation MCP tool implementation
 * This tool allows adding new documentation by crawling a URL and processing it
 */

// Define Zod schema for parameters (ZodRawShape)
export const addDocumentationSchema = {
  url: z.string().url().describe('The URL of the documentation site to crawl and process'),
  maxDepth: z.number().int().positive().optional().describe('Maximum crawl depth'),
  name: z.string().optional().describe('Friendly name for the source'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  rateLimit: z.number().int().nonnegative().optional().describe('Milliseconds between requests'),
  respectRobotsTxt: z.boolean().optional().describe('Respect robots.txt')
};

// Explicitly define the type for the handler parameters
// Mirroring the Zod schema + internal params
type AddDocumentationParams = {
  url: string;
  maxDepth?: number;
  name?: string;
  tags?: string[];
  rateLimit?: number;
  respectRobotsTxt?: boolean;
  // Internal params
  _bypassAsync?: boolean;
  _prisma?: PrismaClient;
};

/**
 * Start the crawling process for a given URL
 * This is separated from the handler for better testability
 */
export async function startCrawlingProcess(jobId: string, params: AddDocumentationParams) {
  try {
    // Use the provided Prisma client or get the main one
    const prisma = params._prisma || getMainPrismaClient();
    
    // Initialize services with the Prisma client
    const jobService = new JobService(prisma);
    const documentService = new DocumentService(prisma);
    const documentProcessorService = new DocumentProcessorService(prisma);
    
    // Update job status to running
    await jobService.updateJobProgress(jobId, 'running', 0);
    await jobService.updateJobMetadata(jobId, { stage: 'crawling' });
    
    // Initialize crawler service with the same Prisma client
    const crawlerService = new CrawlerService(prisma);
    
    // Extract name and tags for potential future use
    const docName = params.name || new URL(params.url).hostname;
    const docTags = params.tags || ['auto-added'];
    
    // Update job with metadata
    await jobService.updateJobMetadata(jobId, {
      name: docName,
      tags: docTags,
      maxDepth: params.maxDepth || 3
    });
    
    logger.info(`Starting crawl process for job ${jobId} at URL ${params.url}`);
    
    // Start crawling with the provided options
    await crawlerService.crawl(jobId, params.url, {
      maxDepth: params.maxDepth || 3,
      rateLimit: params.rateLimit,
      respectRobotsTxt: params.respectRobotsTxt !== false, // Default to true if not specified
    });
    
    // Crawl is complete, now update job status to processing stage
    await jobService.updateJobProgress(jobId, 'running', 0.5);
    await jobService.updateJobMetadata(jobId, { stage: 'processing' });
    logger.info(`Crawling completed for job ${jobId}, starting document processing`);
    
    // Get all documents created by this specific job
    const documents = await prisma.document.findMany({
      where: {
        jobId: jobId // Filter by jobId
      }
    });
    
    logger.info(`Found ${documents.length} documents to process for job ${jobId}`);
    
    // Process each document (convert HTML to markdown, chunk, create embeddings)
    const totalDocs = documents.length;
    let processedDocs = 0;
    
    for (const document of documents) {
      try {
        logger.info(`Processing document ${document.id} (${document.title}) for job ${jobId}`);
        
        // Process the document HTML and generate embeddings
        await documentProcessorService.processDocument(document.id, document.content, document.metadata);
        
        // Update job progress
        processedDocs++;
        const progress = 0.5 + (0.5 * (processedDocs / totalDocs));
        await jobService.updateJobProgress(jobId, 'running', progress);
        
        // Update job stats
        const currentStats = (await jobService.findJobById(jobId))?.stats as Record<string, number>;
        await jobService.updateJobStats(jobId, {
          ...currentStats,
          pagesProcessed: processedDocs,
          pagesSkipped: 0,
          totalChunks: processedDocs, // This will be refined later with actual chunk count
        });
        
        logger.info(`Successfully processed document ${document.id} for job ${jobId}`);
      } catch (error) {
        logger.error(`Error processing document ${document.id} for job ${jobId}:`, error);
        
        // Update document to mark it as having processing errors
        await documentService.updateDocument(document.id, {
          metadata: {
            ...document.metadata as Record<string, any>,
            processingError: error instanceof Error ? error.message : 'Unknown error during processing',
          },
        });
        
        // Continue with other documents despite the error
      }
    }
    
    // Get the actual number of chunks created by this job
    const stats = await prisma.$queryRaw<[{ count: BigInt }]>`
      SELECT COUNT(*) as count FROM chunks c
      INNER JOIN documents d ON d.id = c.document_id
      WHERE d.job_id = ${jobId}
    `;
    
    // Convert BigInt to Number for stats
    const chunkCount = stats[0]?.count ? Number(stats[0].count) : processedDocs;
    
    // Mark job as completed
    await jobService.updateJobProgress(jobId, 'completed', 1.0);
    await jobService.updateJobStats(jobId, {
      pagesProcessed: processedDocs,
      pagesSkipped: totalDocs - processedDocs,
      totalChunks: Number(chunkCount),
    });
    
    logger.info(`Document processing and embedding generation completed for job ${jobId}`);
    logger.info(`Job statistics: ${processedDocs} documents processed, ${chunkCount} chunks created`);
    
  } catch (error) {
    logger.error(`Error during job ${jobId}:`, error);
    // Update job with error status
    const prisma = params._prisma || getMainPrismaClient();
    const jobService = new JobService(prisma);
    await jobService.updateJobError(jobId, error instanceof Error ? error.message : 'Unknown error during processing');
  }
}

// Define the handler function matching SDK expectations
export const addDocumentationHandler = async (params: AddDocumentationParams) => {
  logger.info(`Add documentation tool called with URL: ${params.url}`);

  // Perform parameter validation (already done by Zod via SDK)
  // try {
  //   new URL(params.url); // URL validation handled by z.string().url()
  // } catch (error) {
  //   return { content: [{ type: 'text', text: `Invalid URL format: ${params.url}` }], isError: true };
  // }
  // (Other validations like maxDepth, rateLimit also handled by Zod)

  console.log('Add documentation tool called with params:', params);
  try {
    const prisma = params._prisma || getMainPrismaClient();
    const jobService = new JobService(prisma);

    // Create a job record
    const job = await jobService.createJob({
      url: params.url,
      status: JobStatus.pending, // Use enum
      type: JobType.crawl, // Corrected field name and enum value
      startDate: new Date(),
      progress: 0,
      endDate: null,
      error: null,
      stats: {
        pagesProcessed: 0,
        pagesSkipped: 0,
        totalChunks: 0
      },
      metadata: { // Store initial params in metadata
        sourceUrl: params.url,
        sourceName: params.name,
        sourceTags: params.tags,
        crawlMaxDepth: params.maxDepth,
        crawlRateLimit: params.rateLimit,
        crawlRespectRobotsTxt: params.respectRobotsTxt,
      }
    });

    logger.info(`Created job ${job.id} for URL ${params.url}`);

    // Trigger the async processing
    if (params._bypassAsync) {
      // For testing: run immediately and wait (useful for integration tests)
      await startCrawlingProcess(job.id, params);
    } else {
      // Don't await - let it run in the background
      startCrawlingProcess(job.id, params).catch(err => {
        logger.error(`Unhandled error in background job ${job.id}:`, err);
        // Optionally update job status to failed here if the catch is reliable
      });
    }

    // Return success message with job ID
    return {
      content: [
        {
          type: 'text' as const,
          text: `Documentation source added. Processing started with Job ID: ${job.id}`
        }
      ]
    };
  } catch (error) {
    logger.error('Error creating documentation job:', error);
    return {
      content: [
        {
          type: 'text' as const,
          text: error instanceof Error ? error.message : 'Failed to start documentation job'
        }
      ],
      isError: true
    };
  }
}; 
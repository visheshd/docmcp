import { MCPFunction, MCPTool, MCPToolRegistry } from '../../types/mcp';
import logger from '../../utils/logger';
import { CrawlerService } from '../crawler.service';
import { JobService } from '../job.service';
import { DocumentProcessorService } from '../document-processor.service';
import { Document, JobStatus, JobType, PrismaClient } from '../../generated/prisma';
import { getPrismaClient as getMainPrismaClient } from '../../config/database';
import { URL } from 'url';
import { DocumentService } from '../document.service';

/**
 * Add Documentation MCP tool implementation
 * This tool allows adding new documentation by crawling a URL and processing it
 */

// Define the tool function schema following OpenAI Function Calling format
const addDocumentationFunction: MCPFunction = {
  name: 'add_documentation',
  description: 'Add new documentation to the knowledge base by crawling a URL and processing it',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL of the documentation site to crawl and process'
      },
      maxDepth: {
        type: 'number',
        description: 'The maximum depth to crawl (number of links to follow from the start URL)'
      },
      name: {
        type: 'string',
        description: 'A friendly name for this documentation source'
      },
      tags: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Tags to associate with this documentation'
      },
      rateLimit: {
        type: 'number',
        description: 'Milliseconds to wait between requests (to avoid rate limiting)'
      },
      respectRobotsTxt: {
        type: 'boolean',
        description: 'Whether to respect robots.txt directives'
      }
    },
    required: ['url']
  }
};

// Input type for the handler
interface AddDocumentationParams {
  url: string;
  maxDepth?: number;
  name?: string;
  tags?: string[];
  rateLimit?: number;
  respectRobotsTxt?: boolean;
  // For testing: bypass the setTimeout
  _bypassAsync?: boolean;
  // For testing: provide custom Prisma client
  _prisma?: PrismaClient;
}

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

// Implement the tool handler
const addDocumentationHandler = async (params: AddDocumentationParams) => {
  logger.info(`Add documentation tool called with URL: ${params.url}`);
  
  // Validate URL
  try {
    new URL(params.url);
  } catch (error) {
    throw new Error(`Invalid URL format: ${params.url}`);
  }
  
  // Validate maxDepth if provided
  if (params.maxDepth !== undefined) {
    if (!Number.isInteger(params.maxDepth) || params.maxDepth < 1) {
      throw new Error('maxDepth must be a positive integer');
    }
  }
  
  // Validate rateLimit if provided
  if (params.rateLimit !== undefined) {
    if (!Number.isInteger(params.rateLimit) || params.rateLimit < 0) {
      throw new Error('rateLimit must be a non-negative integer');
    }
  }
  
  try {
    // Use the provided Prisma client or get the main one
    const prisma = params._prisma || getMainPrismaClient();
    
    // Create a job service for job tracking with the Prisma client
    const jobService = new JobService(prisma);
    
    // Create a job record to track the crawling process
    const job = await jobService.createJob({
      url: params.url,
      status: 'pending' as JobStatus,
      startDate: new Date(),
      progress: 0,
      endDate: null,
      error: null,
      stats: { 
        pagesProcessed: 0, 
        pagesSkipped: 0, 
        totalChunks: 0 
      },
    });
    
    // Log the job creation
    logger.info(`Created job ${job.id} for URL ${params.url}`);
    
    // Start the crawling process in the background or immediately for tests
    if (params._bypassAsync) {
      // For testing: run immediately
      await startCrawlingProcess(job.id, params);
    } else {
      // In production: run in the background
      setTimeout(() => {
        startCrawlingProcess(job.id, params).catch(error => {
          logger.error(`Unhandled error in background crawling process:`, error);
        });
      }, 0);
    }
    
    // Return the job information immediately
    return {
      jobId: job.id,
      url: params.url,
      status: 'pending',
      message: 'Documentation crawling job has been created and started in the background'
    };
  } catch (error) {
    logger.error('Error in add_documentation handler:', error);
    throw error;
  }
};

// Create the MCP tool
const addDocumentationTool: MCPTool = {
  function: addDocumentationFunction,
  handler: addDocumentationHandler
};

// Register the tool
export const registerAddDocumentationTool = () => {
  MCPToolRegistry.registerTool(addDocumentationTool);
  logger.info('Add documentation tool registered');
};

export default addDocumentationTool; 
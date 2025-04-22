#!/usr/bin/env node
/**
 * Process Documents CLI Script
 * 
 * This script provides a command-line interface for processing documents
 * that have been crawled but not yet processed. It's particularly useful if
 * you want to run the processing step separately from the crawling step.
 * 
 * @example
 * ```
 * npm run process-docs -- --job-id 550e8400-e29b-41d4-a716-446655440000 --wait
 * ```
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import yargs from 'yargs';
import logger from '../utils/logger';
import { JobService } from '../services/job.service';
import { DocumentService } from '../services/document.service';
import { DocumentProcessorService } from '../services/document-processor.service';
import { JobStatus, PrismaClient } from '../generated/prisma';
import { getPrismaClient } from '../config/database';

// Define interface for the CLI arguments
interface CliArgs {
  'job-id': string;
  wait: boolean;
  verbose: boolean;
  reprocess: boolean;
  [key: string]: unknown;
}

/**
 * Display job progress in real-time on the CLI
 * @param jobId The ID of the job to monitor
 * @param prisma PrismaClient instance
 * @returns A promise that resolves when the job completes or fails
 */
async function displayJobProgress(jobId: string, prisma: any): Promise<void> {
  return new Promise((resolve) => {
    const progressInterval = 2000; // Update progress every 2 seconds
    let lastProgress = -1;
    
    const interval = setInterval(async () => {
      try {
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          select: { 
            status: true, 
            progress: true, 
            stats: true,
            error: true,
            timeElapsed: true,
            timeRemaining: true
          }
        });
        
        if (!job) {
          console.log(`Job ${jobId} not found`);
          clearInterval(interval);
          resolve();
          return;
        }
        
        // Only display progress if it has changed
        const currentProgress = Math.floor(job.progress * 100);
        if (currentProgress !== lastProgress) {
          lastProgress = currentProgress;
          
          // Clear previous line and show progress
          process.stdout.write('\r\x1b[K'); // Clear line
          process.stdout.write(`Progress: ${currentProgress}% `);
          
          // Add status indicators
          if (job.stats) {
            process.stdout.write(`| Docs: ${job.stats.pagesProcessed || 0} processed, ${job.stats.totalChunks || 0} chunks `);
          }
          
          // Add time information if available
          if (job.timeElapsed !== null && job.timeRemaining !== null) {
            const formatTime = (seconds: number) => {
              if (seconds < 60) return `${seconds}s`;
              const mins = Math.floor(seconds / 60);
              const secs = seconds % 60;
              return `${mins}m ${secs}s`;
            };
            
            process.stdout.write(`| Time: ${formatTime(job.timeElapsed || 0)} elapsed`);
            if (job.timeRemaining) {
              process.stdout.write(`, ~${formatTime(job.timeRemaining)} remaining`);
            }
          }
        }
        
        // Check if job is complete
        if (['completed', 'failed', 'cancelled', 'paused'].includes(job.status)) {
          clearInterval(interval);
          // Print a newline to ensure next output starts on a fresh line
          console.log('');
          resolve();
        }
      } catch (error) {
        console.error(`Error fetching job progress: ${error instanceof Error ? error.message : String(error)}`);
        clearInterval(interval);
        resolve();
      }
    }, progressInterval);
  });
}

/**
 * Deletes all chunks associated with documents belonging to a specific job.
 * @param jobId The ID of the job whose chunks should be cleared.
 * @param prisma PrismaClient instance.
 */
async function clearChunksForJob(jobId: string, prisma: PrismaClient): Promise<number> {
  let deletedCount = 0;
  try {
    logger.debug(`Finding document IDs for job ${jobId} to clear chunks.`);
    // Find all document IDs for the given job
    const documents = await prisma.document.findMany({
      where: { jobId: jobId },
      select: { id: true }
    });

    if (!documents || documents.length === 0) {
      logger.info(`No documents found for job ${jobId}, no chunks to clear.`);
      return 0; // Return 0 deleted
    }

    const documentIds = documents.map(doc => doc.id);
    logger.debug(`Found ${documentIds.length} documents for job ${jobId}.`); // Removed listing all IDs for brevity

    logger.info(`Deleting chunks associated with ${documentIds.length} documents for job ${jobId}.`);
    const deleteResult = await prisma.chunk.deleteMany({
      where: {
        documentId: {
          in: documentIds
        }
      }
    });
    deletedCount = deleteResult.count;
    logger.info(`Deleted ${deletedCount} chunks for job ${jobId}.`);
    
  } catch (error) {
    logger.error(`Error clearing chunks for job ${jobId}:`, error);
    // Log the error but allow reprocessing to continue
    console.error(`\nError deleting existing chunks: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Proceeding with reprocessing, but old chunks might remain.');
    // Return the count known so far, even if incomplete
  }
  return deletedCount;
}

/**
 * Process all documents for a specific job
 */
async function processDocumentsForJob(jobId: string, prisma: PrismaClient): Promise<void> {
  const jobService = new JobService(prisma);
  const documentService = new DocumentService(prisma);
  const documentProcessorService = new DocumentProcessorService(prisma);
  
  // Get job details
  const job = await jobService.findJobById(jobId);
  if (!job) {
    throw new Error(`Job with ID ${jobId} not found`);
  }
  
  // Update job status to processing stage
  await jobService.updateJobProgress(jobId, 'running', 0.5);
  await jobService.updateJobMetadata(jobId, { stage: 'processing' });
  logger.info(`Starting document processing for job ${jobId}`);
  
  // Get all documents created by this specific job
  const documents = await prisma.document.findMany({
    where: {
      jobId: jobId
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
        totalChunks: processedDocs, // Will be refined later with actual chunk count
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
}

/**
 * Main function to parse arguments and execute the document processing
 */
async function main() {
  // Filter out the '--' argument that npm adds when running as 'npm run process-docs -- --args'
  const filteredArgs = process.argv.filter(arg => arg !== '--');
  
  // Parse command line arguments using yargs and the filtered arguments
  const argv = yargs(filteredArgs)
    .usage('Usage: $0 --job-id <jobId> [--reprocess] [options]')
    .option('job-id', {
      type: 'string',
      demandOption: true,
      describe: 'The ID of the job to process documents for'
    })
    .option('wait', {
      type: 'boolean',
      default: false,
      describe: 'Wait for the job to complete before exiting'
    })
    .option('verbose', {
      type: 'boolean',
      alias: 'v',
      default: false,
      describe: 'Enable more detailed logging'
    })
    .option('reprocess', {
      type: 'boolean',
      default: false,
      describe: 'Delete existing chunks and reprocess all documents for the specified job'
    })
    .epilogue('For more information, see the documentation in the README.md file.')
    .help()
    .alias('help', 'h')
    .parseSync() as CliArgs;

  try {
    // Enable verbose logging if the flag is set
    if (argv.verbose) {
      logger.level = 'debug';
      logger.debug('Verbose logging enabled');
      logger.debug('Parsed CLI arguments:', argv);
    }
    
    logger.info(`Starting document processing for job: ${argv['job-id']}`);
    
    try {
      // Connect to the database
      const prisma = getPrismaClient();
      
      // Initialize the job service
      const jobService = new JobService(prisma);
      
      // Check if job exists
      const job = await jobService.findJobById(argv['job-id']);
      if (!job) {
        console.error(`Error: Job ${argv['job-id']} not found`);
        process.exit(1);
      }
      
      console.log(`Found job ${job.id} (${job.status})`);
      
      // --- Reprocessing Logic ---
      if (argv.reprocess) {
        logger.info(`Reprocess flag set for job ${job.id}. Deleting existing chunks...`);
        console.log(`Reprocessing requested. Deleting existing chunks for job ${job.id}...`);
        
        const deletedCount = await clearChunksForJob(job.id, prisma);
        console.log(`Deleted ${deletedCount} existing chunks.`);

        // Reset job progress and stats before reprocessing
        logger.info(`Resetting progress and stats for job ${job.id} before reprocessing.`);
        await jobService.updateJobProgress(job.id, 'pending', 0); // Reset status to pending, progress to 0
        await jobService.updateJobStats(job.id, { // Reset stats (removed 'errors')
             pagesProcessed: 0, 
             totalChunks: 0, 
             pagesSkipped: 0, 
        }); 
        // Update job metadata stage if needed, e.g., back to 'crawling' or keep as 'processing'?
        // Let's leave the stage as is for now, assuming reprocessing stays within the 'processing' context.

        logger.info(`Existing chunks deleted and job state reset for job ${job.id}. Starting reprocessing.`);
        console.log(`Job state reset. Starting reprocessing...`);
      }
      // --- End Reprocessing Logic ---
      
      if (!argv.wait) {
        // Start the processing in the background
        processDocumentsForJob(job.id, prisma).catch(async (error) => {
          logger.error(`Unhandled error in background job ${job.id}:`, error);
          // Update job status to failed and store error message
           const errorMsg = `Background processing error: ${error instanceof Error ? error.message : String(error)}`;
           try {
             // First, update status and progress (progress undefined keeps it as is or resets based on status)
             await jobService.updateJobProgress(job.id, 'failed', 0); 
             // Then, update metadata to store the error message
             await jobService.updateJobMetadata(job.id, { error: errorMsg }); 
           } catch (e: any) {
              logger.error(`Failed to update job ${job.id} status/metadata after background error: ${e}`);
           }
        });
        
        console.log(`Document processing started in the background.`);
        console.log(`Use 'mcp_docmcp_local_stdio_get_job_status' with jobId=${job.id} to check progress.`);
        
        // Exit after starting the process
        process.exit(0);
      } else {
        // Implement wait functionality
        console.log(`Waiting for job ${job.id} to complete...`);
        
        // When --wait is specified, start displaying progress
        console.log(`Real-time progress display enabled. Press Ctrl+C to stop (job will continue in background).`);
        
        // Start the process
        const processPromise = processDocumentsForJob(job.id, prisma);
        
        // Display progress while job is running
        const progressDisplayPromise = displayJobProgress(job.id, prisma);
        
        // Wait for both the process and progress display to finish
        try {
          await Promise.all([processPromise, progressDisplayPromise]);
          
          // Get final job details
          const finalJob = await jobService.findJobById(job.id);
          
          if (!finalJob) {
            console.error(`Error: Job ${job.id} not found`);
            process.exit(1);
          }
          
          // Final status report
          console.log(`\nJob ${job.id} ${finalJob.status}!`);
          
          if (finalJob.status === 'completed') {
            const jobStats = finalJob.stats as Record<string, any>;
            if (jobStats) {
              console.log(`Processed ${jobStats.pagesProcessed || 0} documents`);
              console.log(`Created ${jobStats.totalChunks || 0} chunks`);
            }
            console.log(`\nDocumentation processing complete.`);
            process.exit(0);
          } else {
            console.error(`\nJob ended with status: ${finalJob.status}`);
            if (finalJob.error) {
              console.error(`Error details: ${finalJob.error}`);
            }
            process.exit(finalJob.status === 'cancelled' || finalJob.status === 'paused' ? 0 : 1);
          }
        } catch (error) {
          console.error(`\nError during job execution or progress display: ${error instanceof Error ? error.message : String(error)}`);
           // Attempt to mark job as failed and store error message
           const errorMsg = `Processing error: ${error instanceof Error ? error.message : String(error)}`;
           try {
              // First, update status and progress
             await jobService.updateJobProgress(job.id, 'failed', 0);
              // Then, update metadata with the error
             await jobService.updateJobMetadata(job.id, { error: errorMsg });
           } catch (e: any) {
              logger.error(`Failed to update job ${job.id} status/metadata after error: ${e}`);
           }
          process.exit(1);
        }
      }
      
    } catch (dbError) {
      // Check for database connection errors
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      
      if (errorMessage.includes("Can't reach database server") || 
          errorMessage.includes("connection") || 
          errorMessage.includes("ECONNREFUSED")) {
        
        logger.error('Database connection error');
        console.error('\n❌ Database Connection Error');
        console.error('-----------------------------');
        console.error('Could not connect to the PostgreSQL database.');
        console.error('\nPossible solutions:');
        console.error('1. Make sure the PostgreSQL server is running');
        console.error('2. Check that the database connection settings in .env are correct');
        console.error('3. If using Docker, ensure the database container is up and running:');
        console.error('   $ ./docker-start.sh');
        console.error('\nSee README.md for more information on setting up the environment.');
        
        process.exit(2); // Special exit code for database connection issues
      }
      
      // Re-throw other database errors
      throw dbError;
    }
    
  } catch (error) {
    logger.error('Error during script initialization or argument parsing:', error);
    console.error(`Initialization Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  logger.error('Unhandled error in process-docs script:', error);
  console.error(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exit(1);
}); 
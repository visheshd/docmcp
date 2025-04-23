#!/usr/bin/env node
/**
 * Add Documentation CLI Script
 * 
 * This script provides a command-line interface for adding documentation
 * to the DocMCP system. It's an alternative to using the MCP tool and allows
 * direct initiation of documentation crawling and processing from the terminal.
 * 
 * @example
 * ```
 * npm run add-docs -- --url https://reactjs.org/docs --max-depth 3 --tags react,frontend --wait
 * ```
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import yargs from 'yargs';
import { URL } from 'url';
import logger from '../utils/logger';
import { JobService } from '../services/job.service';
import { JobStatus, JobType } from '../generated/prisma';
import { getPrismaClient } from '../config/database';
import { startCrawlingProcess } from '../services/mcp-tools/add-documentation.tool';
import inquirer from 'inquirer';

// Define interface for the CLI arguments
interface CliArgs {
  url: string;
  'max-depth': number;
  name?: string;
  tags?: string[];
  'rate-limit': number;
  'respect-robots-txt': boolean;
  wait: boolean;
  verbose: boolean;
  check: boolean;
  package?: string;
  version?: string;
  'skip-prompts': boolean;
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
            process.stdout.write(`| Pages: ${job.stats.pagesProcessed || 0} processed, ${job.stats.pagesSkipped || 0} skipped `);
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
 * Prompt the user for package information if not provided via command line
 * @param args The parsed command line arguments
 * @returns Object containing package name and version
 */
async function promptForPackageInfo(args: CliArgs): Promise<{ packageName: string; packageVersion: string }> {
  // Use CLI args if provided
  if (args.package && args['skip-prompts']) {
    return {
      packageName: args.package,
      packageVersion: args.version || 'latest'
    };
  }

  // Define answers interface
  interface PromptAnswers {
    packageName?: string;
    packageVersion?: string;
  }

  // If we have questions to ask, prompt the user
  const answers: PromptAnswers = {};
  
  // Only ask for package name if not provided via CLI
  if (!args.package) {
    const packageNameResponse = await inquirer.prompt<{packageName: string}>({
      type: 'input',
      name: 'packageName',
      message: 'What is the name of the package this documentation is for?',
      validate: (input: string) => {
        return input.trim().length > 0 ? true : 'Package name is required';
      }
    });
    answers.packageName = packageNameResponse.packageName;
  }
  
  // Always ask for version if not provided via CLI
  if (!args.version) {
    const versionResponse = await inquirer.prompt<{packageVersion: string}>({
      type: 'input',
      name: 'packageVersion',
      message: 'What version of the package is this documentation for? (leave blank for "latest")',
      default: 'latest'
    });
    answers.packageVersion = versionResponse.packageVersion;
  }
  
  return {
    packageName: args.package || answers.packageName || '',
    packageVersion: args.version || answers.packageVersion || 'latest'
  };
}

/**
 * Main function to parse arguments and execute the documentation addition process
 */
async function main() {
  // Filter out the '--' argument that npm adds when running as 'npm run add-docs -- --args'
  const filteredArgs = process.argv.filter(arg => arg !== '--');
  
  // Parse command line arguments using yargs and the filtered arguments
  const argv = yargs(filteredArgs)
    .usage('Usage: $0 --url <url> [options]')
    .option('url', {
      type: 'string',
      demandOption: true,
      describe: 'The URL of the documentation site to crawl and process'
    })
    .option('max-depth', {
      type: 'number',
      default: 3,
      describe: 'Maximum crawl depth'
    })
    .option('name', {
      type: 'string',
      describe: 'Friendly name for the source (defaults to hostname)'
    })
    .option('tags', {
      type: 'string',
      describe: 'Comma-separated tags for categorization',
      coerce: (arg: string) => arg.split(',').map(tag => tag.trim())
    })
    .option('rate-limit', {
      type: 'number',
      default: 1000,
      describe: 'Milliseconds between requests'
    })
    .option('respect-robots-txt', {
      type: 'boolean',
      default: true,
      describe: 'Whether to respect robots.txt rules'
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
    .option('check', {
      type: 'boolean',
      default: false,
      describe: 'Validate arguments without connecting to the database'
    })
    .option('package', {
      type: 'string',
      describe: 'The name of the package this documentation is for'
    })
    .option('version', {
      type: 'string',
      describe: 'The version of the package this documentation is for (defaults to "latest")'
    })
    .option('skip-prompts', {
      type: 'boolean',
      default: false,
      describe: 'Skip interactive prompts and use provided CLI arguments or defaults'
    })
    .check((argv) => {
      // Validate URL format
      try {
        new URL(argv.url as string);
        return true;
      } catch (error) {
        throw new Error('Invalid URL format. Please provide a valid URL with protocol (e.g., https://example.com).');
      }
    })
    .epilogue('For more information, see the documentation in the README.md file.')
    .help()
    .alias('help', 'h')
    .parseSync() as CliArgs; // Type assertion here

  try {
    // Enable verbose logging if the flag is set
    if (argv.verbose) {
      logger.level = 'debug';
      logger.debug('Verbose logging enabled');
      logger.debug('Parsed CLI arguments:', argv);
    }
    
    logger.info(`Starting documentation addition process for URL: ${argv.url}`);
    
    // Extract hostname and tags for displaying in check mode too
    const urlObj = new URL(argv.url);
    const name = argv['name'] || urlObj.hostname;
    const tags = argv.tags || [urlObj.hostname];
    
    // Get package information - either from CLI args or interactive prompts
    let packageInfo;
    if (!argv.check) {
      packageInfo = await promptForPackageInfo(argv);
      logger.info(`Package information: ${packageInfo.packageName}@${packageInfo.packageVersion}`);
    } else {
      packageInfo = {
        packageName: argv.package || 'not specified',
        packageVersion: argv.version || 'latest'
      };
    }
    
    // If in check mode, just validate and exit
    if (argv.check) {
      logger.info('Check mode: Validating arguments without database connection');
      console.log('✅ Arguments validated successfully');
      console.log('Configuration summary:');
      console.log(`  URL: ${argv.url}`);
      console.log(`  Max Depth: ${argv['max-depth']}`);
      console.log(`  Name: ${name}`);
      console.log(`  Tags: ${tags.join(', ')}`);
      console.log(`  Package: ${packageInfo.packageName}`);
      console.log(`  Package Version: ${packageInfo.packageVersion}`);
      console.log(`  Rate Limit: ${argv['rate-limit']}ms`);
      console.log(`  Respect robots.txt: ${argv['respect-robots-txt']}`);
      console.log(`  Wait for completion: ${argv.wait}`);
      process.exit(0);
    }
    
    try {
      // Connect to the database
      const prisma = getPrismaClient();
      
      // Initialize the job service
      const jobService = new JobService(prisma);
      
      // Create job record in the database
      logger.info('Creating job record in database...');
      
      // Create job with appropriate parameters
      const job = await jobService.createJob({
        url: argv.url,
        status: JobStatus.pending,
        type: JobType.crawl,
        startDate: new Date(),
        progress: 0,
        endDate: null,
        error: null,
        stats: {
          pagesProcessed: 0,
          pagesSkipped: 0,
          totalChunks: 0
        },
        metadata: {
          sourceUrl: argv.url,
          sourceName: name,
          sourceTags: tags,
          crawlMaxDepth: argv['max-depth'],
          crawlRateLimit: argv['rate-limit'],
          crawlRespectRobotsTxt: argv['respect-robots-txt'],
          // Add package information to the metadata
          packageName: packageInfo.packageName,
          packageVersion: packageInfo.packageVersion
        }
      });
      
      logger.info(`Job created successfully with ID: ${job.id}`);
      console.log(`Job ID: ${job.id}`);
      console.log(`Package mapping: ${packageInfo.packageName}@${packageInfo.packageVersion}`);
      
      // Implement core processing logic (Task 11.3)
      if (!argv.wait) {
        // Start the crawling process in the background
        startCrawlingProcess(job.id, {
          url: argv.url,
          maxDepth: argv['max-depth'],
          name: name,
          tags: tags,
          rateLimit: argv['rate-limit'],
          respectRobotsTxt: argv['respect-robots-txt'],
          // Pass package information to the crawling process
          packageName: packageInfo.packageName,
          packageVersion: packageInfo.packageVersion
        }).catch(error => {
          logger.error(`Unhandled error in background job ${job.id}:`, error);
        });
        
        console.log(`Documentation processing started in the background.`);
        console.log(`Use 'mcp_docmcp_local_stdio_get_job_status' with jobId=${job.id} to check progress.`);
        
        // Exit after starting the process
        process.exit(0);
      } else {
        // Implement wait functionality (Task 11.4)
        console.log(`Waiting for job ${job.id} to complete...`);
        
        // When --wait is specified, start displaying progress
        console.log(`Real-time progress display enabled. Press Ctrl+C to stop (job will continue in background).`);
        
        // Start the process
        const crawlPromise = startCrawlingProcess(job.id, {
          url: argv.url,
          maxDepth: argv['max-depth'],
          name: name,
          tags: tags,
          rateLimit: argv['rate-limit'],
          respectRobotsTxt: argv['respect-robots-txt'],
          // Pass package information to the crawling process
          packageName: packageInfo.packageName,
          packageVersion: packageInfo.packageVersion,
          _bypassAsync: true // Run synchronously
        });
        
        // Display progress while job is running
        const progressDisplayPromise = displayJobProgress(job.id, prisma);
        
        // Wait for both the crawl process and progress display to finish
        try {
          await Promise.all([crawlPromise, progressDisplayPromise]);
          
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
              console.log(`Processed ${jobStats.pagesProcessed || 0} pages`);
              console.log(`Created ${jobStats.totalChunks || 0} chunks`);
              console.log(`Skipped ${jobStats.pagesSkipped || 0} pages`);
            }
            console.log(`\nDocumentation is now available in the knowledge base.`);
            console.log(`Package mapping created for: ${packageInfo.packageName}@${packageInfo.packageVersion}`);
            process.exit(0);
          } else {
            console.error(`\nJob ended with status: ${finalJob.status}`);
            if (finalJob.error) {
              console.error(`Error: ${finalJob.error}`);
            }
            process.exit(finalJob.status === 'cancelled' || finalJob.status === 'paused' ? 0 : 1);
          }
        } catch (error) {
          console.error(`Error processing job: ${error instanceof Error ? error.message : String(error)}`);
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
    logger.error('Error during documentation addition:', error);
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  logger.error('Unhandled error in add-docs script:', error);
  console.error(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exit(1);
}); 
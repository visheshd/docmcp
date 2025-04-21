import { ICrawler } from '../interfaces/ICrawler';
import { IJobManager } from '../interfaces/IJobManager';
import { ILinkExtractor } from '../interfaces/ILinkExtractor';
import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import { IRobotsTxtService } from '../interfaces/IRobotsTxtService';
import { IRateLimiter } from '../interfaces/IRateLimiter';
import { IUrlQueue } from '../interfaces/IUrlQueue';
import { CrawlOptions, CrawlProgress, CrawlerState } from '../interfaces/types';
import { LoggingUtils } from '../utils/LoggingUtils';

/**
 * Abstract base class for crawler implementations
 * Provides common functionality and state management for all crawlers
 */
export abstract class BaseCrawler implements ICrawler {
  protected state: CrawlerState = CrawlerState.IDLE;
  protected options: CrawlOptions;
  protected logger = LoggingUtils.createTaggedLogger('crawler');
  protected currentJobId: string | null = null;

  /**
   * Constructor for the base crawler
   * 
   * @param urlQueue Queue for managing URLs to be crawled
   * @param jobManager Service for managing crawl jobs
   * @param linkExtractor Service for extracting links from pages
   * @param documentProcessor Service for processing and storing documents
   * @param robotsTxtService Service for handling robots.txt rules
   * @param rateLimiter Service for rate limiting requests
   * @param options Default crawl options
   */
  constructor(
    protected readonly urlQueue: IUrlQueue,
    protected readonly jobManager: IJobManager,
    protected readonly linkExtractor: ILinkExtractor,
    protected readonly documentProcessor: IDocumentProcessor,
    protected readonly robotsTxtService: IRobotsTxtService,
    protected readonly rateLimiter: IRateLimiter,
    options: Partial<CrawlOptions> = {}
  ) {
    // Set default options
    this.options = {
      maxDepth: 3,
      baseUrl: '',
      rateLimit: 1000,
      respectRobotsTxt: true,
      userAgent: 'DocMCP Crawler/1.0',
      timeout: 30000,
      maxRedirects: 5,
      reuseCachedContent: true,
      cacheExpiry: 7,
      concurrency: 1,
      ...options
    };
  }

  /**
   * Main method to start the crawling process
   * Implementation to be provided by subclasses
   * 
   * @param jobId The ID of the job in the database
   * @param startUrl The URL to start crawling from
   * @param options Configuration options for the crawl
   */
  abstract crawl(jobId: string, startUrl: string, options: CrawlOptions): Promise<void>;

  /**
   * Initialize the crawler
   * Sets up required services and state
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing crawler');
    this.state = CrawlerState.INITIALIZING;
    
    try {
      // Perform any necessary initialization
      this.state = CrawlerState.IDLE;
      this.logger.info('Crawler initialized');
    } catch (error) {
      this.state = CrawlerState.ERROR;
      this.logger.error('Failed to initialize crawler', error as Error);
      throw error;
    }
  }

  /**
   * Stop the current crawling process
   * Cannot be resumed after stopping
   */
  async stop(): Promise<void> {
    if (this.state === CrawlerState.CRAWLING || this.state === CrawlerState.PAUSED) {
      this.logger.info('Stopping crawler');
      this.state = CrawlerState.STOPPING;
      
      // If we have an active job, mark it as cancelled
      if (this.currentJobId) {
        await this.jobManager.cancelJob(this.currentJobId, 'Crawl process stopped manually');
      }
      
      this.state = CrawlerState.IDLE;
      this.currentJobId = null;
      this.logger.info('Crawler stopped');
    } else {
      this.logger.warn(`Cannot stop crawler in state: ${this.state}`);
    }
  }

  /**
   * Pause the current crawling process
   * Can be resumed later
   */
  async pause(): Promise<void> {
    if (this.state === CrawlerState.CRAWLING) {
      this.logger.info('Pausing crawler');
      this.state = CrawlerState.PAUSED;
      
      // If we have an active job, mark it as paused
      if (this.currentJobId) {
        await this.jobManager.pauseJob(this.currentJobId);
      }
      
      this.logger.info('Crawler paused');
    } else {
      this.logger.warn(`Cannot pause crawler in state: ${this.state}`);
    }
  }

  /**
   * Resume a previously paused crawling process
   */
  async resume(): Promise<void> {
    if (this.state === CrawlerState.PAUSED) {
      this.logger.info('Resuming crawler');
      this.state = CrawlerState.CRAWLING;
      
      // If we have an active job, mark it as resumed
      if (this.currentJobId) {
        await this.jobManager.resumeJob(this.currentJobId);
      }
      
      this.logger.info('Crawler resumed');
      
      // Actual resumption logic should be handled by the concrete implementation
    } else {
      this.logger.warn(`Cannot resume crawler in state: ${this.state}`);
    }
  }

  /**
   * Get the current progress of the crawling process
   * 
   * @returns Progress information including completion percentage and stats
   */
  async getProgress(): Promise<CrawlProgress> {
    const totalUrls = this.urlQueue.size() + this.urlQueue.visitedCount();
    const crawledUrls = this.urlQueue.visitedCount();
    const pendingUrls = this.urlQueue.size();
    
    // Calculate progress as a percentage
    const progress = totalUrls > 0 ? (crawledUrls / totalUrls) * 100 : 0;
    
    return {
      totalUrls,
      crawledUrls,
      pendingUrls,
      skippedUrls: 0, // This would need to be tracked separately
      progress: Math.min(progress, 100), // Ensure we don't exceed 100%
      percentage: progress
    };
  }

  /**
   * Update job progress in the database
   * 
   * @param jobId The ID of the job to update
   */
  protected async updateJobProgress(jobId: string): Promise<void> {
    if (!jobId) return;
    
    const progress = await this.getProgress();
    
    // Update the job progress
    await this.jobManager.updateProgress(jobId, progress.progress, {
      pagesProcessed: progress.crawledUrls,
      pagesSkipped: progress.skippedUrls,
      totalChunks: 0 // Unknown at this point
    });
  }

  /**
   * Handle completion of a job
   * 
   * @param jobId The ID of the completed job
   */
  protected async markJobCompleted(jobId: string): Promise<void> {
    if (!jobId) return;
    
    const progress = await this.getProgress();
    
    // Mark the job as completed
    await this.jobManager.markJobCompleted(jobId, {
      pagesProcessed: progress.crawledUrls,
      pagesSkipped: progress.skippedUrls,
      totalChunks: 0 // Will be updated by document processor
    });
    
    this.currentJobId = null;
    this.state = CrawlerState.IDLE;
    this.logger.info(`Job ${jobId} completed`);
  }

  /**
   * Handle failure of a job
   * 
   * @param jobId The ID of the failed job
   * @param error The error that caused the failure
   */
  protected async markJobFailed(jobId: string, error: Error | string): Promise<void> {
    if (!jobId) return;
    
    const progress = await this.getProgress();
    const errorMessage = error instanceof Error ? error.message : error;
    
    // Mark the job as failed
    await this.jobManager.markJobFailed(jobId, errorMessage, {
      pagesProcessed: progress.crawledUrls,
      pagesSkipped: progress.skippedUrls,
      totalChunks: 0,
      errors: [errorMessage]
    });
    
    this.currentJobId = null;
    this.state = CrawlerState.ERROR;
    this.logger.error(`Job ${jobId} failed: ${errorMessage}`);
  }
} 
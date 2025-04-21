import { CrawlOptions, CrawlerState, ExtractedContent, CrawlProgress, JobStats, PageType } from '../interfaces/types';
import { BaseCrawler } from './BaseCrawler';
import { IPageDetector } from '../interfaces/IPageDetector';
import { CrawlingStrategyFactory } from '../factories/CrawlingStrategyFactory';
import { ILinkExtractor } from '../interfaces/ILinkExtractor';
import { IUrlQueue } from '../interfaces/IUrlQueue';
import { IJobManager } from '../interfaces/IJobManager';
import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import { IRobotsTxtService } from '../interfaces/IRobotsTxtService';
import { IRateLimiter } from '../interfaces/IRateLimiter';
import { DelayUtils } from '../utils/DelayUtils';
import { UrlUtils } from '../utils/UrlUtils';

/**
 * Standard crawler implementation
 * This implementation:
 * - Uses strategy factory to select appropriate content extractor
 * - Handles robots.txt rules
 * - Manages rate limiting
 * - Tracks progress
 * - Handles errors gracefully
 */
export class StandardCrawler extends BaseCrawler {
  constructor(
    private readonly pageDetector: IPageDetector,
    private readonly strategyFactory: CrawlingStrategyFactory,
    urlQueue: IUrlQueue,
    jobManager: IJobManager,
    linkExtractor: ILinkExtractor,
    documentProcessor: IDocumentProcessor,
    robotsTxtService: IRobotsTxtService,
    rateLimiter: IRateLimiter,
    options: Partial<CrawlOptions> = {}
  ) {
    super(
      urlQueue,
      jobManager,
      linkExtractor,
      documentProcessor,
      robotsTxtService,
      rateLimiter,
      options
    );
  }

  /**
   * Main crawling method that coordinates the crawling process
   */
  public async crawl(jobId: string, startUrl: string, options: CrawlOptions): Promise<void> {
    this.logger.info(`Starting crawl for job ${jobId} at ${startUrl}`);
    this.currentJobId = jobId;
    this.state = CrawlerState.RUNNING;

    try {
      // Initialize crawler and services
      await this.initialize();
      
      // Initialize URL queue with start URL
      await this.urlQueue.markVisited(startUrl); // Clear any previous visit status
      await this.urlQueue.add(startUrl, 0);

      // Set rate limit for the domain
      const domain = UrlUtils.extractDomain(startUrl);
      if (domain) {
        const rateLimit = options.rateLimit || this.options.rateLimit || 1000; // Default to 1 second if not specified
        this.rateLimiter.setRateLimit(domain, rateLimit);
      }

      // Main crawling loop
      while (this.state === CrawlerState.RUNNING && this.urlQueue.size() > 0) {
        // Check if job should continue
        if (!(await this.jobManager.shouldContinue(jobId))) {
          this.logger.info('Job cancelled or paused');
          break;
        }

        // Get next URL to process
        const next = await this.urlQueue.getNext();
        if (!next) continue;
        
        const { url, depth } = next;
        
        // Skip if we've exceeded max depth
        if (depth > options.maxDepth) {
          await this.urlQueue.markVisited(url);
          continue;
        }

        // Acquire rate limiting token
        const urlDomain = UrlUtils.extractDomain(url);
        if (urlDomain) {
          await this.rateLimiter.acquireToken(urlDomain);
        }

        try {
          await this.processUrl(url, depth);
        } finally {
          // Release rate limiting token
          if (urlDomain) {
            this.rateLimiter.releaseToken(urlDomain);
          }
        }

        // Update job progress
        await this.updateJobProgress(jobId);
      }

      // Mark job as completed
      await this.markJobCompleted(jobId);
    } catch (error) {
      // Handle any errors during crawling
      await this.markJobFailed(jobId, error as Error);
      throw error;
    }
  }

  /**
   * Process a single URL
   */
  private async processUrl(url: string, depth: number): Promise<void> {
    try {
      // Check robots.txt rules if enabled
      if (this.options.respectRobotsTxt && !(await this.robotsTxtService.isAllowed(url))) {
        this.logger.info(`URL ${url} disallowed by robots.txt`);
        await this.urlQueue.markVisited(url);
        return;
      }

      // Detect page type and get appropriate extractor
      const pageTypeResult = await this.pageDetector.detectPageType(url);
      const extractor = this.strategyFactory.getExtractorByPageType(pageTypeResult.pageType);

      // Extract content
      const content = await extractor.extract(url, {
        userAgent: this.options.userAgent,
        timeout: this.options.timeout
      });

      // Mark URL as visited
      await this.urlQueue.markVisited(url);

      // Process document
      await this.documentProcessor.createDocument({
        url: content.url || url,
        title: content.title,
        content: content.content,
        metadata: content.metadata,
        crawlDate: new Date(),
        level: depth,
        jobId: this.currentJobId!
      });

      // Extract and queue new URLs if we haven't reached max depth
      if (depth < this.options.maxDepth) {
        const links = await this.linkExtractor.extractLinks(content.content, this.options.baseUrl, url);
        for (const link of links) {
          if (!(await this.urlQueue.isVisited(link))) {
            await this.urlQueue.add(link, depth + 1);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error processing URL ${url}:`, error as Error);
      await this.urlQueue.markVisited(url); // Mark as visited to avoid retrying
    }
  }

  /**
   * Update job progress based on crawl status
   */
  protected async updateJobProgress(jobId: string): Promise<void> {
    if (!this.currentJobId) return;

    const progress = await this.getProgress();
    await this.jobManager.updateProgress(jobId, progress.progress, {
      pagesProcessed: progress.crawledUrls,
      pagesSkipped: progress.skippedUrls,
      totalChunks: 0
    });
  }

  /**
   * Get the current progress of the crawling process
   */
  public async getProgress(): Promise<CrawlProgress> {
    const totalUrls = this.urlQueue.size() + this.urlQueue.visitedCount();
    const crawledUrls = this.urlQueue.visitedCount();
    
    // Calculate progress as a percentage
    const progress = totalUrls > 0 ? (crawledUrls / totalUrls) * 100 : 0;
    const percentage = Math.min(progress, 100); // Ensure we don't exceed 100%
    
    return {
      totalUrls,
      crawledUrls,
      skippedUrls: 0, // This would need to be tracked separately
      progress: percentage,
      percentage
    };
  }
} 
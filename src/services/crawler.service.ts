import * as cheerio from 'cheerio';
import axios from 'axios';
import { URL } from 'url';
import { PrismaClient } from '../generated/prisma';
import { Prisma } from '../generated/prisma';
import logger from '../utils/logger';
import { DocumentService } from './document.service';
import { getPrismaClient as getMainPrismaClient } from '../config/database';
import robotsParser from 'robots-parser';

interface CrawlOptions {
  maxDepth: number;
  baseUrl: string;
  rateLimit?: number; // milliseconds between requests
  respectRobotsTxt?: boolean; // whether to respect robots.txt rules
  randomDelay?: boolean; // whether to add random delay between requests
  minDelay?: number; // minimum delay in milliseconds
  maxDelay?: number; // maximum delay in milliseconds
  userAgent?: string; // user agent to use for requests
}

// Common user agents for spoofing
const USER_AGENTS = {
  GOOGLEBOT: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  CHROME: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  SAFARI: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
  FIREFOX: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0'
};

interface CrawlResult {
  url: string;
  title: string;
  content: string;
  metadata: {
    package?: string;
    version?: string;
    type?: string;
    tags?: string[];
  };
  level: number;
  links: string[];
}

export class CrawlerService {
  private visitedUrls: Set<string> = new Set();
  private urlQueue: { url: string; depth: number }[] = [];
  private documentService: DocumentService;
  private prisma: PrismaClient;
  private robotsTxt: any = null;
  // Track errors for reporting
  private errorCount: number = 0;
  private pagesSkipped: number = 0;
  private pagesProcessed: number = 0;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || getMainPrismaClient();
    this.documentService = new DocumentService(this.prisma);
  }

  /**
   * Initialize a crawl job for a documentation site
   */
  async crawl(jobId: string, startUrl: string, options: Partial<CrawlOptions> = {}) {
    const defaultOptions: CrawlOptions = {
      maxDepth: 3,
      baseUrl: new URL(startUrl).origin,
      rateLimit: 1000, // 1 second between requests by default
      respectRobotsTxt: true, // respect robots.txt by default
      randomDelay: true, // use random delays between requests
      minDelay: 1500, // minimum 1.5 seconds between requests
      maxDelay: 5000, // maximum 5 seconds between requests
      userAgent: USER_AGENTS.GOOGLEBOT, // default to Googlebot user agent
    };

    const crawlOptions = { ...defaultOptions, ...options };
    this.urlQueue = [{ url: startUrl, depth: 0 }];
    this.visitedUrls.clear();
    // Reset counters
    this.errorCount = 0;
    this.pagesSkipped = 0;
    this.pagesProcessed = 0;

    // Log the crawl configuration
    logger.info(`Starting crawl with options:`, {
      maxDepth: crawlOptions.maxDepth,
      baseUrl: crawlOptions.baseUrl,
      rateLimit: crawlOptions.rateLimit,
      respectRobotsTxt: crawlOptions.respectRobotsTxt,
      randomDelay: crawlOptions.randomDelay,
      userAgent: crawlOptions.userAgent
    });

    // Load robots.txt if enabled
    if (crawlOptions.respectRobotsTxt) {
      await this.loadRobotsTxt(crawlOptions.baseUrl);
    }

    try {
      while (this.urlQueue.length > 0) {
        // Check if job should be cancelled
        const jobStatus = await this.prisma.job.findUnique({
          where: { id: jobId },
          select: { shouldCancel: true, shouldPause: true }
        });

        if (jobStatus?.shouldCancel) {
          logger.info(`Job ${jobId} was cancelled. Stopping crawl.`);
          await this.prisma.job.update({
            where: { id: jobId },
            data: {
              status: 'cancelled',
              endDate: new Date(),
              progress: this.visitedUrls.size / (this.visitedUrls.size + this.urlQueue.length),
            },
          });
          return; // Exit early
        }

        if (jobStatus?.shouldPause) {
          logger.info(`Job ${jobId} was paused. Stopping crawl.`);
          await this.prisma.job.update({
            where: { id: jobId },
            data: {
              status: 'paused',
              progress: this.visitedUrls.size / (this.visitedUrls.size + this.urlQueue.length),
            },
          });
          return; // Exit early
        }

        const { url, depth } = this.urlQueue.shift()!;
        
        if (depth > crawlOptions.maxDepth) {
          continue;
        }

        if (this.visitedUrls.has(url)) {
          continue;
        }

        // Check for recent existing document
        const copiedDocument = await this.findAndCopyRecentDocument(url, depth, jobId);
        
        if (copiedDocument) {
          logger.info(`Reused recent document data for ${url} (New ID: ${copiedDocument.id})`);
          this.visitedUrls.add(url);
          this.pagesProcessed++; // Count copied documents as processed
          
          // Extract links from the copied content
          const links = this.extractLinksFromHtml(copiedDocument.content, crawlOptions.baseUrl, url);
          logger.debug(`Extracted ${links.length} links from copied content for ${url}`);
          
          // Queue new URLs from copied content
          for (const link of links) {
            if (!this.visitedUrls.has(link)) {
              this.urlQueue.push({ url: link, depth: depth + 1 });
            }
          }
          
          await this.updateJobProgress(jobId); // Update progress
          await this.applyDelay(crawlOptions); // Apply delay even after copying
          continue; // Skip fetching and processing this URL
        }

        // Check robots.txt rules if enabled
        if (crawlOptions.respectRobotsTxt && this.robotsTxt && !this.isAllowedByRobotsTxt(url)) {
          logger.info(`Skipping ${url} (disallowed by robots.txt)`);
          this.pagesSkipped++;
          continue;
        }

        try {
          logger.info(`Crawling: ${url} (depth: ${depth})`);
          const result = await this.crawlPage(url, depth, crawlOptions);
          this.visitedUrls.add(url);
          this.pagesProcessed++;

          // Create document record, including the jobId
          await this.documentService.createDocument({
            url: result.url,
            title: result.title,
            content: result.content,
            metadata: result.metadata as Prisma.InputJsonValue,
            crawlDate: new Date(),
            level: result.level,
            jobId: jobId,
          });

          // Queue new URLs
          for (const link of result.links) {
            if (!this.visitedUrls.has(link)) {
              this.urlQueue.push({ url: link, depth: depth + 1 });
            }
          }

          // Update job progress and stats
          await this.updateJobProgress(jobId);

          // Apply delay between requests
          await this.applyDelay(crawlOptions);
        } catch (error) {
          // Handle specific error types
          if (axios.isAxiosError(error)) {
            // Mark URL as visited to prevent retries
            this.visitedUrls.add(url);
            this.errorCount++;
            this.pagesSkipped++;
            
            if (error.response) {
              // Server responded with an error status code
              const statusCode = error.response.status;
              
              if (statusCode === 404) {
                logger.warn(`Page not found (404): ${url} - Skipping and continuing.`);
              } else if (statusCode === 403 || statusCode === 401) {
                logger.warn(`Access denied (${statusCode}): ${url} - Skipping and continuing.`);
              } else if (statusCode >= 500) {
                logger.warn(`Server error (${statusCode}): ${url} - Skipping and continuing.`);
              } else {
                logger.warn(`HTTP error (${statusCode}): ${url} - Skipping and continuing.`);
              }
              
              // Update job with warning but continue crawling
              await this.prisma.job.update({
                where: { id: jobId },
                data: {
                  error: `${this.errorCount} errors during crawling. Latest: HTTP ${statusCode} at ${url}`,
                  errorCount: this.errorCount,
                  lastError: new Date(),
                  itemsFailed: this.errorCount,
                  itemsSkipped: this.pagesSkipped,
                }
              });
            } else if (error.request) {
              // Request was made but no response received (network error)
              logger.warn(`Network error for ${url} - Skipping and continuing.`);
              
              // Update job with warning but continue crawling
              await this.prisma.job.update({
                where: { id: jobId },
                data: {
                  error: `${this.errorCount} errors during crawling. Latest: Network error at ${url}`,
                  errorCount: this.errorCount,
                  lastError: new Date(),
                  itemsFailed: this.errorCount,
                  itemsSkipped: this.pagesSkipped,
                }
              });
            } else {
              // Something else went wrong
              logger.warn(`Error crawling ${url}: ${error.message} - Skipping and continuing.`);
              
              // Update job with warning but continue crawling
              await this.prisma.job.update({
                where: { id: jobId },
                data: {
                  error: `${this.errorCount} errors during crawling. Latest: ${error.message} at ${url}`,
                  errorCount: this.errorCount,
                  lastError: new Date(),
                  itemsFailed: this.errorCount,
                  itemsSkipped: this.pagesSkipped,
                }
              });
            }
          } else {
            // Non-Axios error - likely a parsing error or other issue
            this.visitedUrls.add(url);
            this.errorCount++;
            this.pagesSkipped++;
            
            logger.warn(`Error processing ${url}: ${error} - Skipping and continuing.`);
            
            // Update job with warning but continue crawling
            await this.prisma.job.update({
              where: { id: jobId },
              data: {
                error: `${this.errorCount} errors during crawling. Latest: Processing error at ${url}: ${error}`,
                errorCount: this.errorCount,
                lastError: new Date(),
                itemsFailed: this.errorCount,
                itemsSkipped: this.pagesSkipped,
              }
            });
          }
          
          // Update job progress despite error
          await this.updateJobProgress(jobId);
          
          // Add delay after error before continuing
          await this.applyDelay(crawlOptions);
          
          // Continue with next URL - do NOT re-throw the error
        }
      }

      // The crawl completed normally
      logger.info(`Crawl finished successfully for job ${jobId}.`);
      
    } catch (error) {
      // This should only catch unexpected errors outside the URL processing loop
      logger.error('Unexpected error during crawl:', error);
      // We'll mark the job as failed in the finally block
    } finally {
      // Ensure the job is always marked with final status
      logger.info(`Crawl finished for job ${jobId}. Updating status.`);
      try {
        // Check if there were too many errors
        const failureThreshold = 0.75; // 75% of pages failed
        const totalPages = this.pagesProcessed + this.pagesSkipped;
        const errorRate = totalPages > 0 ? this.errorCount / totalPages : 0;
        
        // Determine final status
        let finalStatus: 'completed' | 'failed';
        if (this.errorCount > 0 && errorRate >= failureThreshold) {
          finalStatus = 'failed';
          logger.warn(`Job ${jobId} marked as failed due to high error rate (${errorRate.toFixed(2)})`);
        } else {
          finalStatus = 'completed';
          logger.info(`Job ${jobId} completed with ${this.errorCount} errors out of ${totalPages} pages`);
        }
        
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: finalStatus, 
            endDate: new Date(),
            // Set progress to 1 if completed
            progress: 1,
            // Update final statistics
            stats: {
              pagesProcessed: this.pagesProcessed,
              pagesSkipped: this.pagesSkipped, 
              totalChunks: this.pagesProcessed,
              errorCount: this.errorCount,
              errorRate: errorRate
            },
            itemsProcessed: this.pagesProcessed,
            itemsSkipped: this.pagesSkipped,
            itemsFailed: this.errorCount,
            itemsTotal: this.pagesProcessed + this.pagesSkipped
          },
        });
        logger.info(`Job ${jobId} status updated to ${finalStatus}.`);
      } catch (updateError) {
        logger.error(`Failed to update final job status for job ${jobId}:`, updateError);
      }
    }
  }

  /**
   * Update job progress and statistics
   */
  private async updateJobProgress(jobId: string): Promise<void> {
    try {
      const totalUrls = this.visitedUrls.size + this.urlQueue.length;
      const progress = totalUrls > 0 ? this.visitedUrls.size / totalUrls : 0;
      
      // Calculate time estimates
      const job = await this.prisma.job.findUnique({
        where: { id: jobId },
        select: { startDate: true }
      });
      
      let timeElapsed = 0;
      let timeRemaining = 0;
      
      if (job) {
        timeElapsed = Math.floor((Date.now() - job.startDate.getTime()) / 1000); // in seconds
        
        // Estimate remaining time based on progress
        if (progress > 0) {
          timeRemaining = Math.floor((timeElapsed / progress) - timeElapsed);
        }
      }
      
      // Calculate estimated completion time
      const estimatedCompletion = timeRemaining > 0 
        ? new Date(Date.now() + (timeRemaining * 1000)) 
        : undefined;
      
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          progress,
          stats: {
            pagesProcessed: this.pagesProcessed,
            pagesSkipped: this.pagesSkipped,
            totalChunks: this.pagesProcessed,
            errorCount: this.errorCount
          },
          itemsProcessed: this.pagesProcessed,
          itemsSkipped: this.pagesSkipped,
          itemsFailed: this.errorCount,
          itemsTotal: this.pagesProcessed + this.pagesSkipped + this.urlQueue.length,
          timeElapsed,
          timeRemaining,
          estimatedCompletion,
          lastActivity: new Date()
        },
      });
    } catch (error) {
      logger.warn(`Failed to update job progress for job ${jobId}:`, error);
      // Non-critical error, we can continue
    }
  }

  /**
   * Apply delay between requests based on the configured options
   */
  private async applyDelay(options: CrawlOptions): Promise<void> {
    let delay = options.rateLimit || 1000;

    if (options.randomDelay && options.minDelay !== undefined && options.maxDelay !== undefined) {
      // Calculate a random delay between minDelay and maxDelay
      delay = Math.floor(Math.random() * (options.maxDelay - options.minDelay + 1)) + options.minDelay;
      logger.debug(`Applying random delay of ${delay}ms before next request`);
    } else {
      logger.debug(`Applying fixed delay of ${delay}ms before next request`);
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Load and parse robots.txt file from a domain
   */
  private async loadRobotsTxt(baseUrl: string): Promise<void> {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      logger.info(`Loading robots.txt from ${robotsUrl}`);
      
      const response = await axios.get(robotsUrl, { timeout: 5000 });
      if (response.status === 200) {
        this.robotsTxt = robotsParser(robotsUrl, response.data);
        logger.info(`Robots.txt successfully loaded from ${robotsUrl}`);
      } else {
        logger.warn(`Failed to load robots.txt from ${robotsUrl} - status: ${response.status}`);
        this.robotsTxt = null;
      }
    } catch (error) {
      logger.warn(`Error loading robots.txt: ${error}`);
      this.robotsTxt = null;
    }
  }

  /**
   * Check if URL is allowed by robots.txt
   */
  private isAllowedByRobotsTxt(url: string): boolean {
    if (!this.robotsTxt) {
      return true; // If we can't load robots.txt, we assume everything is allowed
    }
    
    return this.robotsTxt.isAllowed(url, 'Googlebot');
  }

  /**
   * Crawl a single page and extract its content
   */
  private async crawlPage(url: string, depth: number, options: CrawlOptions): Promise<CrawlResult> {
    // Configure request headers with user agent
    const headers = {
      'User-Agent': options.userAgent || USER_AGENTS.GOOGLEBOT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    const response = await axios.get(url, { 
      headers,
      timeout: 15000, // 15 second timeout
      maxRedirects: 5  // Maximum 5 redirects
    });
    
    const $ = cheerio.load(response.data);

    // Remove script tags, style tags, and comments
    $('script, style').remove();
    $('*').contents().filter((_: number, el: any) => el.type === 'comment').remove();

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || url;

    // Extract main content
    // This is a basic implementation - you might need to adjust selectors based on the site structure
    const mainContent = $('main, article, .content, .documentation, #content').first();
    const content = mainContent.length ? mainContent.html() || '' : $('body').html() || '';

    // Extract links using the new helper method
    const extractedLinks = this.extractLinksFromHtml(response.data, options.baseUrl, url);

    // Extract metadata
    // This is a basic implementation - you might need to adjust based on the site structure
    const metadata = {
      package: $('meta[name="package"]').attr('content'),
      version: $('meta[name="version"]').attr('content'),
      type: 'documentation',
      tags: ['auto-generated'],
    };

    return {
      url,
      title,
      content,
      metadata,
      level: depth,
      links: extractedLinks,
    };
  }

  /**
   * Extract pagination links from a page
   */
  private extractPaginationLinks($: any, currentUrl: string, baseUrl: string, links: Set<string>): void {
    // Common pagination selectors - expand this list based on documentation sites you need to support
    const paginationSelectors = [
      '.pagination a', // Generic
      '.pager a',      // Generic
      'nav.pagination a', // Common in docs
      'ul.pager a',    // Bootstrap style
      '.next-page',    // Common 'next' button
      '.prev-page',    // Common 'previous' button
      '[aria-label="Next"]', // Accessibility labeled buttons
      '[aria-label="Previous"]',
      '.page-navigation a', // Documentation specific
      '.doc-navigation a',  // Documentation specific
    ];
    
    // Join selectors with commas for a single query
    const selector = paginationSelectors.join(',');
    
    // Find and process pagination links
    $(selector).each((_: number, element: any) => {
      const href = $(element).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, currentUrl).toString();
          // Only include links from the same domain
          if (absoluteUrl.startsWith(baseUrl)) {
            links.add(absoluteUrl);
            logger.debug(`Found pagination link: ${absoluteUrl}`);
          }
        } catch (error) {
          // Invalid URL - ignore
        }
      }
    });
  }

  /**
   * NEW METHOD: Check for a recent document in the DB and copy its data
   * if found, creating a new document record linked to the current job.
   */
  private async findAndCopyRecentDocument(url: string, depth: number, jobId: string): Promise<Prisma.DocumentGetPayload<{}> | null> {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    try {
      const existingDocument = await this.prisma.document.findFirst({
        where: {
          url: url,
          crawlDate: {
            gte: fourWeeksAgo // Check if crawlDate is within the last 4 weeks
          }
        },
        orderBy: {
          crawlDate: 'desc' // Get the most recent one if multiple exist
        }
      });

      if (existingDocument) {
        logger.debug(`Found recent document for ${url} (ID: ${existingDocument.id}, Crawled: ${existingDocument.crawlDate.toISOString()})`);

        // Create a new document record, copying data from the existing one
        const newDocumentData: Prisma.DocumentCreateInput = {
          url: existingDocument.url,
          title: existingDocument.title,
          content: existingDocument.content,
          metadata: existingDocument.metadata ?? ({} as Prisma.InputJsonValue),
          crawlDate: new Date(), // Set crawlDate to now for the new record
          level: depth, // Use current depth
          job: { connect: { id: jobId } }, // Link to the current job
          // We don't copy parentDocumentId or childDocuments relations here
          // Processing step will handle content/chunks/embeddings for this new doc
        };

        const newDocument = await this.documentService.createDocument(newDocumentData);
        logger.info(`Created new document ${newDocument.id} by copying data from ${existingDocument.id}`);
        return newDocument;
      } else {
        logger.debug(`No recent existing document found for ${url}`);
        return null;
      }
    } catch (error) {
      logger.error(`Error checking for existing document for ${url}:`, error);
      return null; // Proceed with normal crawl if DB check fails
    }
  }

  /**
   * NEW METHOD: Extracts links from HTML content using Cheerio.
   * Duplicates link extraction logic from crawlPage.
   */
  private extractLinksFromHtml(htmlContent: string, baseUrl: string, currentUrl: string): string[] {
    const links = new Set<string>();
    try {
      const $ = cheerio.load(htmlContent);
      
      // Process regular links
      $('a').each((_: number, element: any) => {
        const href = $(element).attr('href');
        if (href) {
          try {
            const absoluteUrl = new URL(href, currentUrl).toString();
            // Only include links from the same domain
            if (absoluteUrl.startsWith(baseUrl)) {
              links.add(absoluteUrl);
            }
          } catch (error) {
            // Invalid URL - ignore
          }
        }
      });
      
      // Handle pagination links specifically
      this.extractPaginationLinks($, currentUrl, baseUrl, links);

    } catch (error) {
      logger.warn(`Error parsing HTML content for link extraction from ${currentUrl}:`, error);
      // Return empty array if parsing fails
    }
    
    return Array.from(links);
  }
}
import * as cheerio from 'cheerio';
import axios from 'axios';
import { URL } from 'url';
import { PrismaClient } from '../generated/prisma';
import logger from '../utils/logger';
import { DocumentService } from './document.service';
import { getPrismaClient as getMainPrismaClient } from '../config/database';
import robotsParser from 'robots-parser';

interface CrawlOptions {
  maxDepth: number;
  baseUrl: string;
  rateLimit?: number; // milliseconds between requests
  respectRobotsTxt?: boolean; // whether to respect robots.txt rules
}

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

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || getMainPrismaClient();
    this.documentService = new DocumentService();
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
    };

    const crawlOptions = { ...defaultOptions, ...options };
    this.urlQueue = [{ url: startUrl, depth: 0 }];
    this.visitedUrls.clear();

    // Load robots.txt if enabled
    if (crawlOptions.respectRobotsTxt) {
      await this.loadRobotsTxt(crawlOptions.baseUrl);
    }

    try {
      while (this.urlQueue.length > 0) {
        const { url, depth } = this.urlQueue.shift()!;
        
        if (depth > crawlOptions.maxDepth) {
          continue;
        }

        if (this.visitedUrls.has(url)) {
          continue;
        }

        // Check robots.txt rules if enabled
        if (crawlOptions.respectRobotsTxt && this.robotsTxt && !this.isAllowedByRobotsTxt(url)) {
          logger.info(`Skipping ${url} (disallowed by robots.txt)`);
          continue;
        }

        try {
          const result = await this.crawlPage(url, depth, crawlOptions);
          this.visitedUrls.add(url);

          // Create document record, including the jobId
          await this.documentService.createDocument({
            url: result.url,
            title: result.title,
            content: result.content,
            metadata: result.metadata,
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

          // Update job progress
          await this.prisma.job.update({
            where: { id: jobId },
            data: {
              progress: this.visitedUrls.size / (this.visitedUrls.size + this.urlQueue.length),
              stats: {
                pagesProcessed: this.visitedUrls.size,
                pagesSkipped: 0,
                totalChunks: this.visitedUrls.size,
              },
            },
          });

          // Respect rate limiting
          if (crawlOptions.rateLimit) {
            await new Promise(resolve => setTimeout(resolve, crawlOptions.rateLimit));
          }
        } catch (error) {
          logger.error(`Error crawling ${url}:`, error);
          // Update job with error but continue crawling
          await this.prisma.job.update({
            where: { id: jobId },
            data: {
              error: `Error crawling ${url}: ${error}`,
              progress: this.visitedUrls.size / (this.visitedUrls.size + this.urlQueue.length),
            },
          });
          // Re-throw the error to be caught by the outer block
          throw error;
        }
      }

      // Mark job as completed when all URLs are processed - Moved to finally block
      // await this.prisma.job.update({
      //   where: { id: job.id },
      //   data: {
      //     status: 'completed',
      //     endDate: new Date(),
      //     progress: 1,
      //   },
      // });
    } catch (error) {
      logger.error('Crawl failed:', error);
      // Error is already logged in the job record by the inner catch or here
      // We just need to ensure the final status is set in `finally`
      // No need to update here anymore, but we still re-throw
      throw error; 
    } finally {
      // Ensure the job is always marked as completed
      logger.info(`Crawl finished for job ${jobId}. Updating status.`);
      try {
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'completed', 
            endDate: new Date(),
            // Ensure progress is 1 if successful, otherwise keep last calculated progress
            progress: (await this.prisma.job.findUnique({ where: { id: jobId }, select: { error: true } }))?.error ? 
                      this.visitedUrls.size / (this.visitedUrls.size + this.urlQueue.length) : 1,
          },
        });
        logger.info(`Job ${jobId} status updated to completed.`);
      } catch (updateError) {
        logger.error(`Failed to update final job status for job ${jobId}:`, updateError);
      }
    }
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
    
    return this.robotsTxt.isAllowed(url, 'DocMCPBot');
  }

  /**
   * Crawl a single page and extract its content
   */
  private async crawlPage(url: string, depth: number, options: CrawlOptions): Promise<CrawlResult> {
    const response = await axios.get(url);
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

    // Extract links
    const links = new Set<string>();
    
    // Process regular links
    $('a').each((_: number, element: any) => {
      const href = $(element).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, url).toString();
          // Only include links from the same domain
          if (absoluteUrl.startsWith(options.baseUrl)) {
            links.add(absoluteUrl);
          }
        } catch (error) {
          // Invalid URL - ignore
        }
      }
    });
    
    // Handle pagination links specifically
    this.extractPaginationLinks($, url, options.baseUrl, links);

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
      links: Array.from(links),
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
}
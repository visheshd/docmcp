import * as cheerio from 'cheerio';
import axios from 'axios';
import { URL } from 'url';
import { PrismaClient } from '../generated/prisma';
import logger from '../utils/logger';
import { DocumentService } from './document.service';

interface CrawlOptions {
  maxDepth: number;
  baseUrl: string;
  rateLimit?: number; // milliseconds between requests
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

  constructor() {
    this.prisma = new PrismaClient();
    this.documentService = new DocumentService();
  }

  /**
   * Initialize a crawl job for a documentation site
   */
  async crawl(startUrl: string, options: Partial<CrawlOptions> = {}) {
    const defaultOptions: CrawlOptions = {
      maxDepth: 3,
      baseUrl: new URL(startUrl).origin,
      rateLimit: 1000, // 1 second between requests by default
    };

    const crawlOptions = { ...defaultOptions, ...options };
    this.urlQueue = [{ url: startUrl, depth: 0 }];
    this.visitedUrls.clear();

    try {
      // Create or update job record
      const job = await this.prisma.job.create({
        data: {
          url: startUrl,
          status: 'running',
          startDate: new Date(),
          stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
        },
      });

      while (this.urlQueue.length > 0) {
        const { url, depth } = this.urlQueue.shift()!;
        
        if (depth > crawlOptions.maxDepth) {
          continue;
        }

        if (this.visitedUrls.has(url)) {
          continue;
        }

        try {
          const result = await this.crawlPage(url, depth, crawlOptions);
          this.visitedUrls.add(url);

          // Create document record
          await this.documentService.createDocument({
            url: result.url,
            title: result.title,
            content: result.content,
            metadata: result.metadata,
            crawlDate: new Date(),
            level: result.level,
          });

          // Queue new URLs
          for (const link of result.links) {
            if (!this.visitedUrls.has(link)) {
              this.urlQueue.push({ url: link, depth: depth + 1 });
            }
          }

          // Update job progress
          await this.prisma.job.update({
            where: { id: job.id },
            data: {
              progress: this.visitedUrls.size / (this.visitedUrls.size + this.urlQueue.length),
              stats: {
                pagesProcessed: this.visitedUrls.size,
                pagesSkipped: 0,
                totalChunks: this.visitedUrls.size, // This will be updated when chunking is implemented
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
            where: { id: job.id },
            data: {
              error: `Error crawling ${url}: ${error}`,
            },
          });
        }
      }

      // Mark job as completed
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          endDate: new Date(),
          progress: 1,
        },
      });

    } catch (error) {
      logger.error('Crawl failed:', error);
      throw error;
    }
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
}
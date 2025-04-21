export interface CrawlerOptions {
  startUrl: string;
  maxDepth: number;
  respectRobotsTxt?: boolean;
  rateLimit?: number;
}

export interface CrawlProgress {
  crawledUrls: number;
  skippedUrls: number;
  totalUrls: number;
  progress: number;
  percentage: number;
} 
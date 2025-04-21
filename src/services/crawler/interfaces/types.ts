/**
 * Common types and enums for the crawler service
 */

/**
 * Enum for different page types
 */
export enum PageType {
  STATIC = 'static',
  SPA = 'spa'
}

/**
 * Result of page type detection
 */
export interface PageTypeResult {
  isSPA: boolean;
  confidence: number;
  pageType: PageType;
  detectionMethod: 'static' | 'dynamic' | 'hybrid';
}

/**
 * Options for content extraction
 */
export interface ExtractionOptions {
  userAgent?: string;
  timeout?: number;
  waitForSelector?: string;
  waitForTimeout?: number;
  evaluateJs?: boolean;
  extractLinks?: boolean;
}

/**
 * Result of content extraction
 */
export interface ExtractedContent {
  url: string;
  title: string | null;
  content: string;
  text?: string;
  metadata: Record<string, any>;
  links?: string[];
}

/**
 * Options for crawling
 */
export interface CrawlOptions {
  maxDepth: number;
  baseUrl: string;
  rateLimit?: number;
  respectRobotsTxt?: boolean;
  userAgent?: string;
  timeout?: number;
  forceStrategy?: 'cheerio' | 'puppeteer';
  maxRedirects?: number;
  reuseCachedContent?: boolean;
  cacheExpiry?: number;
  concurrency?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

/**
 * Crawl progress information
 */
export interface CrawlProgress {
  crawledUrls: number;
  skippedUrls: number;
  totalUrls: number;
  progress: number;
  percentage: number;
}

/**
 * Job statistics
 */
export interface JobStats {
  pagesProcessed: number;
  pagesSkipped: number;
  totalChunks: number;
  errors?: string[];
}

/**
 * Document creation data
 */
export interface DocumentCreateData {
  url: string;
  title: string | null;
  content: string;
  metadata: Record<string, any>;
  crawlDate: Date;
  level: number;
  jobId: string;
}

/**
 * Job creation data
 */
export interface JobCreateData {
  url: string;
  status: string;
  type: string;
  startDate: Date;
  progress: number;
  endDate: Date | null;
  error: string | null;
  stats: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * Job entity structure
 */
export interface Job {
  id: string;
  url: string;
  status: string;
  type: string;
  startDate: Date;
  progress: number;
  endDate: Date | null;
  error: string | null;
  stats: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Document entity structure
 */
export interface Document {
  id: string;
  url: string;
  title: string | null;
  content: string;
  metadata: Record<string, any>;
  crawlDate: Date;
  level: number;
  jobId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Options for the strategy factory
 */
export interface StrategyFactoryOptions {
  forceStrategy?: 'cheerio' | 'puppeteer';
}

/**
 * Options for SPA detection
 */
export interface SPADetectorOptions {
  staticAnalysisWeight?: number;
  dynamicAnalysisWeight?: number;
  spaConfidenceThreshold?: number;
  cacheResults?: boolean;
  enableDynamicAnalysis?: boolean;
}

/**
 * Crawler state enum
 */
export enum CrawlerState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR'
} 
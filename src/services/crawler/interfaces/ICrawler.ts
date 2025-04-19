import { CrawlOptions, CrawlProgress } from './types';

/**
 * Interface for crawler implementations that handle the web crawling process.
 * This interface defines the contract for all crawler implementations, allowing
 * for strategy-based swapping of crawlers.
 */
export interface ICrawler {
  /**
   * Main method to start the crawling process
   * @param jobId The ID of the job in the database
   * @param startUrl The URL to start crawling from
   * @param options Configuration options for the crawl
   */
  crawl(jobId: string, startUrl: string, options: CrawlOptions): Promise<void>;
  
  /**
   * Initialize the crawler with required services and configuration
   */
  initialize(): Promise<void>;
  
  /**
   * Stop the current crawling process (permanent)
   */
  stop(): Promise<void>;
  
  /**
   * Pause the current crawling process (can be resumed)
   */
  pause(): Promise<void>;
  
  /**
   * Resume a previously paused crawling process
   */
  resume(): Promise<void>;
  
  /**
   * Get the current progress of the crawling process
   * @returns Progress information including completion percentage and time estimates
   */
  getProgress(): Promise<CrawlProgress>;
} 
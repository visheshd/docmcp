/**
 * Interface for robots.txt handling.
 * Implementations parse and enforce robots.txt rules for crawled websites.
 */
export interface IRobotsTxtService {
  /**
   * Load and parse the robots.txt file for a domain
   * @param baseUrl The base URL of the website
   * @param userAgent The user agent to check permissions for
   */
  loadRobotsTxt(baseUrl: string, userAgent: string): Promise<void>;
  
  /**
   * Check if a URL is allowed by the robots.txt rules
   * @param url The URL to check
   * @returns True if the URL is allowed, false if disallowed
   */
  isAllowed(url: string): boolean;
  
  /**
   * Get the crawl delay specified in robots.txt
   * @returns The crawl delay in seconds, or null if not specified
   */
  getCrawlDelay(): number | null;
} 
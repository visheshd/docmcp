/**
 * Interface for link extraction.
 * Implementations are responsible for finding and normalizing URLs within
 * HTML content, focusing on both regular links and pagination links.
 */
export interface ILinkExtractor {
  /**
   * Extract all links from HTML content
   * @param htmlContent The HTML content to extract links from
   * @param baseUrl The base URL for resolving relative links
   * @param currentUrl The current page URL for context
   * @returns Array of normalized absolute URLs
   */
  extractLinks(htmlContent: string, baseUrl: string, currentUrl: string): Promise<string[]>;
  
  /**
   * Extract pagination-specific links from HTML content
   * This is useful for ensuring thorough crawling of paginated content
   * @param htmlContent The HTML content to extract pagination links from
   * @param baseUrl The base URL for resolving relative links
   * @param currentUrl The current page URL for context
   * @returns Array of normalized absolute pagination URLs
   */
  extractPaginationLinks(htmlContent: string, baseUrl: string, currentUrl: string): Promise<string[]>;
} 
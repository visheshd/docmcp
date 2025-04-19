/**
 * Interface for URL queue management.
 * Implementations track URLs to be crawled, visited URLs,
 * and provide methods for queue management.
 */
export interface IUrlQueue {
  /**
   * Add a URL to the queue with its depth level
   * @param url The URL to add
   * @param depth The depth level of the URL
   */
  add(url: string, depth: number): void;
  
  /**
   * Add multiple URLs to the queue in bulk
   * @param urls Array of URL and depth pairs to add
   */
  addBulk(urls: Array<{url: string, depth: number}>): void;
  
  /**
   * Get the next URL to process from the queue
   * @returns The next URL and its depth, or null if the queue is empty
   */
  getNext(): {url: string, depth: number} | null;
  
  /**
   * Check if a URL is in the queue
   * @param url The URL to check
   * @returns True if the URL is in the queue
   */
  has(url: string): boolean;
  
  /**
   * Get the number of URLs in the queue
   * @returns The queue size
   */
  size(): number;
  
  /**
   * Mark a URL as visited
   * @param url The URL to mark as visited
   */
  markVisited(url: string): void;
  
  /**
   * Check if a URL has been visited
   * @param url The URL to check
   * @returns True if the URL has been visited
   */
  isVisited(url: string): boolean;
  
  /**
   * Get the number of visited URLs
   * @returns The visited URL count
   */
  visitedCount(): number;
} 
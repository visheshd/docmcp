import { IUrlQueue } from '../interfaces/IUrlQueue';
import { UrlUtils } from '../utils/UrlUtils';
import { LoggingUtils } from '../utils/LoggingUtils';

/**
 * In-memory implementation of the URL queue
 */
export class InMemoryUrlQueue implements IUrlQueue {
  private queue: Array<{ url: string; depth: number }> = [];
  private visited: Set<string> = new Set();
  private readonly logger = LoggingUtils.createTaggedLogger('url-queue');

  /**
   * Add a URL to the queue
   * @param url The URL to add
   * @param depth The crawl depth of the URL
   */
  add(url: string, depth: number): void {
    const normalizedUrl = UrlUtils.normalize(url);
    
    // Skip if URL is invalid or already visited
    if (!UrlUtils.isValid(normalizedUrl) || this.isVisited(normalizedUrl)) {
      return;
    }
    
    // Add to queue
    this.queue.push({ url: normalizedUrl, depth });
    this.logger.debug(`Added URL to queue: ${normalizedUrl} (depth: ${depth})`);
  }

  /**
   * Add multiple URLs to the queue at once
   * @param urls Array of URLs with their depths
   */
  addBulk(urls: Array<{ url: string; depth: number }>): void {
    const validUrls = urls.filter(({ url }) => {
      const normalizedUrl = UrlUtils.normalize(url);
      return UrlUtils.isValid(normalizedUrl) && !this.isVisited(normalizedUrl);
    });
    
    // Add all valid URLs to the queue
    this.queue.push(...validUrls.map(({ url, depth }) => ({
      url: UrlUtils.normalize(url),
      depth
    })));
    
    this.logger.debug(`Added ${validUrls.length} URLs to queue in bulk`);
  }

  /**
   * Get the next URL from the queue
   * @returns The next URL and its depth, or null if the queue is empty
   */
  getNext(): { url: string; depth: number } | null {
    if (this.queue.length === 0) {
      return null;
    }
    
    // Get and remove the first item from the queue
    return this.queue.shift() || null;
  }

  /**
   * Check if a URL is in the queue
   * @param url The URL to check
   * @returns True if the URL is in the queue
   */
  has(url: string): boolean {
    const normalizedUrl = UrlUtils.normalize(url);
    return this.queue.some(item => item.url === normalizedUrl);
  }

  /**
   * Get the number of URLs in the queue
   * @returns The queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Mark a URL as visited
   * @param url The URL to mark as visited
   */
  markVisited(url: string): void {
    const normalizedUrl = UrlUtils.normalize(url);
    this.visited.add(normalizedUrl);
    
    // Also remove from queue if present
    const index = this.queue.findIndex(item => item.url === normalizedUrl);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * Check if a URL has been visited
   * @param url The URL to check
   * @returns True if the URL has been visited
   */
  isVisited(url: string): boolean {
    const normalizedUrl = UrlUtils.normalize(url);
    return this.visited.has(normalizedUrl);
  }

  /**
   * Get the number of visited URLs
   * @returns The visited count
   */
  visitedCount(): number {
    return this.visited.size;
  }

  /**
   * Clear the queue and visited set
   */
  clear(): void {
    this.queue = [];
    this.visited.clear();
    this.logger.debug('URL queue cleared');
  }

  /**
   * Prioritize the queue based on depth or other criteria
   * @param compareFn Optional comparison function for sorting
   */
  prioritize(compareFn?: (a: { url: string; depth: number }, b: { url: string; depth: number }) => number): void {
    if (compareFn) {
      this.queue.sort(compareFn);
    } else {
      // Default prioritization: lower depth first
      this.queue.sort((a, b) => a.depth - b.depth);
    }
    this.logger.debug('URL queue prioritized');
  }
} 
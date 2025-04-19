import axios from 'axios';
import robotsParser from 'robots-parser';
import { IRobotsTxtService } from '../interfaces/IRobotsTxtService';
import { UrlUtils } from '../utils/UrlUtils';
import { LoggingUtils } from '../utils/LoggingUtils';
import { DelayUtils } from '../utils/DelayUtils';

/**
 * Implementation of the robots.txt service
 */
export class RobotsTxtService implements IRobotsTxtService {
  private robotsTxt: ReturnType<typeof robotsParser> | null = null;
  private baseUrl: string = '';
  private userAgent: string = '';
  private crawlDelay: number | null = null;
  private readonly logger = LoggingUtils.createTaggedLogger('robots');
  private cache = new Map<string, boolean>();

  /**
   * Load and parse the robots.txt file from a URL
   * @param baseUrl The base URL to load robots.txt from
   * @param userAgent The user agent to use when checking permissions
   */
  async loadRobotsTxt(baseUrl: string, userAgent: string): Promise<void> {
    try {
      this.baseUrl = baseUrl;
      this.userAgent = userAgent;
      
      // Get the root URL
      const rootUrl = UrlUtils.getRootUrl(baseUrl);
      const robotsUrl = `${rootUrl}/robots.txt`;
      
      this.logger.info(`Loading robots.txt from ${robotsUrl}`);
      
      // Fetch the robots.txt file
      const response = await DelayUtils.withRetry(
        () => axios.get(robotsUrl, {
          headers: {
            'User-Agent': userAgent
          },
          timeout: 10000
        }),
        3
      );
      
      // Parse the robots.txt content
      if (response.status === 200) {
        const content = response.data;
        this.robotsTxt = robotsParser(content, robotsUrl);
        
        // Find crawl delay in robots.txt
        // Use a regex to find the Crawl-delay directive for our user agent or *
        const lines = content.split('\n');
        let inUserAgentSection = false;
        let inWildcardSection = false;
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          // Check if we're in a User-agent section
          if (trimmedLine.toLowerCase().startsWith('user-agent:')) {
            const agentValue = trimmedLine.substring('user-agent:'.length).trim();
            inUserAgentSection = agentValue === userAgent;
            inWildcardSection = agentValue === '*';
          }
          
          // Try to find Crawl-delay
          if ((inUserAgentSection || inWildcardSection) && trimmedLine.toLowerCase().startsWith('crawl-delay:')) {
            const delayValue = trimmedLine.substring('crawl-delay:'.length).trim();
            this.crawlDelay = parseFloat(delayValue) * 1000; // Convert to milliseconds
            this.logger.info(`Found crawl delay: ${this.crawlDelay}ms`);
            
            // If we found a crawl delay in the specific user agent section, break
            if (inUserAgentSection) {
              break;
            }
          }
        }
        
        this.logger.info(`Successfully loaded and parsed robots.txt from ${robotsUrl}`);
      } else {
        // No robots.txt or error (assume everything is allowed)
        this.robotsTxt = null;
        this.logger.warn(`No robots.txt found at ${robotsUrl} or server returned non-200 status`);
      }
    } catch (error) {
      // Handle errors (can't load robots.txt, assume everything is allowed)
      this.robotsTxt = null;
      this.logger.error(`Error loading robots.txt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a URL is allowed to be crawled
   * @param url The URL to check
   * @returns True if the URL is allowed, false otherwise
   */
  isAllowed(url: string): boolean {
    try {
      // If we couldn't load robots.txt, assume everything is allowed
      if (!this.robotsTxt) {
        return true;
      }
      
      // Normalize the URL
      const normalizedUrl = UrlUtils.normalize(url);
      
      // Check cache first
      if (this.cache.has(normalizedUrl)) {
        const cacheResult = this.cache.get(normalizedUrl);
        return cacheResult === true;
      }
      
      // Check if the URL is allowed
      const allowed = this.robotsTxt.isAllowed(normalizedUrl, this.userAgent);
      
      // Cache the result (if allowed is undefined, treat as allowed)
      this.cache.set(normalizedUrl, allowed === true || allowed === undefined);
      
      return allowed === true || allowed === undefined;
    } catch (error) {
      this.logger.error(`Error checking if URL is allowed: ${error instanceof Error ? error.message : String(error)}`);
      return true; // Assume allowed in case of error
    }
  }

  /**
   * Get the crawl delay specified in robots.txt
   * @returns The crawl delay in milliseconds, or null if not specified
   */
  getCrawlDelay(): number | null {
    return this.crawlDelay;
  }

  /**
   * Check if sitemap URLs are specified in robots.txt
   * @returns Array of sitemap URLs, or empty array if none
   */
  getSitemapUrls(): string[] {
    try {
      if (!this.robotsTxt) {
        return [];
      }
      
      // The getSitemaps method might return undefined
      const sitemaps = this.robotsTxt.getSitemaps();
      return sitemaps || [];
    } catch (error) {
      this.logger.error(`Error getting sitemap URLs: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Reset the robots.txt service
   */
  reset(): void {
    this.robotsTxt = null;
    this.baseUrl = '';
    this.userAgent = '';
    this.crawlDelay = null;
    this.cache.clear();
  }
}
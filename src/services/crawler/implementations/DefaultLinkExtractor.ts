import * as cheerio from 'cheerio';
import { ILinkExtractor } from '../interfaces/ILinkExtractor';
import { UrlUtils } from '../utils/UrlUtils';
import { LoggingUtils } from '../utils/LoggingUtils';

/**
 * Default implementation of the link extractor
 */
export class DefaultLinkExtractor implements ILinkExtractor {
  private readonly logger = LoggingUtils.createTaggedLogger('link-extractor');
  
  /**
   * Extract all links from an HTML content
   * @param htmlContent The HTML content to extract links from
   * @param baseUrl The base URL for resolving relative links
   * @param currentUrl The current URL (used to filter same-domain links)
   * @returns Array of extracted and normalized links
   */
  async extractLinks(htmlContent: string, baseUrl: string, currentUrl: string): Promise<string[]> {
    try {
      const $ = cheerio.load(htmlContent);
      const links: string[] = [];
      const baseUrlDomain = UrlUtils.extractDomain(baseUrl);
      
      // Process all anchor tags
      $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;
        
        // Skip empty, javascript, mailto, and anchor links
        if (
          href.trim() === '' || 
          href.startsWith('javascript:') || 
          href.startsWith('mailto:') || 
          href.startsWith('#')
        ) {
          return;
        }
        
        try {
          // Resolve the URL against the base URL
          const resolvedUrl = UrlUtils.resolveUrl(href, currentUrl);
          const normalizedUrl = UrlUtils.normalize(resolvedUrl);
          
          // Check if the link is from the same domain
          const linkDomain = UrlUtils.extractDomain(normalizedUrl);
          if (linkDomain === baseUrlDomain) {
            links.push(normalizedUrl);
          }
        } catch (err) {
          // Skip invalid URLs
          this.logger.debug(`Skipping invalid URL: ${href}`);
        }
      });
      
      // Return unique links
      return [...new Set(links)];
    } catch (error) {
      this.logger.error(`Error extracting links: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Extract pagination links from HTML content
   * @param htmlContent The HTML content to extract pagination links from
   * @param baseUrl The base URL for resolving relative links
   * @param currentUrl The current URL
   * @returns Array of extracted pagination links
   */
  async extractPaginationLinks(htmlContent: string, baseUrl: string, currentUrl: string): Promise<string[]> {
    try {
      const $ = cheerio.load(htmlContent);
      const paginationLinks: string[] = [];
      const baseUrlDomain = UrlUtils.extractDomain(baseUrl);
      
      // Common pagination selectors
      const paginationSelectors = [
        '.pagination a',
        '.pager a',
        '.pages a',
        'nav.pagination a',
        '.page-numbers',
        '[aria-label*="page"]',
        '[aria-label*="Page"]',
        '[data-page]',
        '.page-item a'
      ];
      
      // Try each pagination selector
      for (const selector of paginationSelectors) {
        $(selector).each((_, element) => {
          const href = $(element).attr('href');
          if (!href) return;
          
          // Skip non-page links
          if (
            href.trim() === '' || 
            href.startsWith('javascript:') || 
            href.startsWith('mailto:') || 
            href === '#'
          ) {
            return;
          }
          
          try {
            // Resolve and normalize the URL
            const resolvedUrl = UrlUtils.resolveUrl(href, currentUrl);
            const normalizedUrl = UrlUtils.normalize(resolvedUrl);
            
            // Check if the link is from the same domain
            const linkDomain = UrlUtils.extractDomain(normalizedUrl);
            if (linkDomain === baseUrlDomain) {
              paginationLinks.push(normalizedUrl);
            }
          } catch (err) {
            // Skip invalid URLs
            this.logger.debug(`Skipping invalid pagination URL: ${href}`);
          }
        });
        
        // If we found pagination links with this selector, break the loop
        if (paginationLinks.length > 0) {
          break;
        }
      }
      
      // Return unique pagination links
      return [...new Set(paginationLinks)];
    } catch (error) {
      this.logger.error(`Error extracting pagination links: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
} 
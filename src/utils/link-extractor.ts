import * as cheerio from 'cheerio';
import { URL } from 'url';
import logger from './logger';

/**
 * Utility class for extracting and processing links from HTML content.
 * Centralizes all link extraction functionality for the crawler.
 */
export class LinkExtractor {
  /**
   * Extract all links from HTML content
   * @param html The HTML content to parse
   * @param baseUrl The base URL of the documentation site (for domain filtering)
   * @param currentUrl The URL of the current page (for resolving relative URLs)
   * @returns Array of absolute URLs extracted from the content
   */
  public static extractAllLinks(html: string, baseUrl: string, currentUrl: string): string[] {
    const links = new Set<string>();
    
    try {
      const $ = cheerio.load(html);
      
      // Extract regular links
      const regularLinks = this.extractRegularLinks($, baseUrl, currentUrl);
      
      // Extract pagination links
      const paginationLinks = this.extractPaginationLinks($, baseUrl, currentUrl);
      
      // Extract API documentation links
      const apiLinks = this.extractApiLinks($, baseUrl, currentUrl);
      
      // Combine all links
      regularLinks.forEach(link => links.add(link));
      paginationLinks.forEach(link => links.add(link));
      apiLinks.forEach(link => links.add(link));
      
    } catch (error) {
      logger.warn(`Error parsing HTML content for link extraction from ${currentUrl}:`, error);
    }
    
    return Array.from(links);
  }
  
  /**
   * Extract regular anchor links from a page
   * @param $ Cheerio instance with loaded HTML
   * @param baseUrl Base URL for domain filtering
   * @param currentUrl Current page URL for resolving relative links
   * @returns Set of absolute URLs from regular links
   */
  private static extractRegularLinks($: cheerio.Root, baseUrl: string, currentUrl: string): Set<string> {
    const links = new Set<string>();
    
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = this.normalizeUrl(href, currentUrl, baseUrl);
        if (absoluteUrl) {
          links.add(absoluteUrl);
        }
      }
    });
    
    return links;
  }
  
  /**
   * Extract pagination links from a page
   * @param $ Cheerio instance with loaded HTML
   * @param baseUrl Base URL for domain filtering
   * @param currentUrl Current page URL for resolving relative links
   * @returns Set of absolute URLs from pagination links
   */
  private static extractPaginationLinks($: cheerio.Root, baseUrl: string, currentUrl: string): Set<string> {
    const links = new Set<string>();
    
    // Common pagination selectors - expand this list based on documentation sites
    const paginationSelectors = [
      '.pagination a',          // Generic
      '.pager a',               // Generic
      'nav.pagination a',       // Common in docs
      'ul.pager a',             // Bootstrap style
      '.next-page',             // Common 'next' button
      '.prev-page',             // Common 'previous' button
      '[aria-label="Next"]',    // Accessibility labeled buttons
      '[aria-label="Previous"]',
      '.page-navigation a',     // Documentation specific
      '.doc-navigation a',      // Documentation specific
    ];
    
    // Join selectors with commas for a single query
    const selector = paginationSelectors.join(',');
    
    // Find and process pagination links
    $(selector).each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = this.normalizeUrl(href, currentUrl, baseUrl);
        if (absoluteUrl) {
          links.add(absoluteUrl);
          logger.debug(`Found pagination link: ${absoluteUrl}`);
        }
      }
    });
    
    return links;
  }
  
  /**
   * Extract API documentation links from a page
   * @param $ Cheerio instance with loaded HTML
   * @param baseUrl Base URL for domain filtering
   * @param currentUrl Current page URL for resolving relative links
   * @returns Set of absolute URLs specific to API documentation
   */
  private static extractApiLinks($: cheerio.Root, baseUrl: string, currentUrl: string): Set<string> {
    const links = new Set<string>();
    
    // Common API documentation link selectors
    const apiSelectors = [
      // Common API documentation patterns
      '.api-reference a', 
      '.api-docs a',
      '.method-signature a',
      '.endpoints a',
      '.functions a',
      '.classes a',
      '.module a',
      '.namespace a',
      // Framework-specific selectors
      '[data-kind="function"] a',
      '[data-kind="class"] a',
      '[data-kind="interface"] a',
      '[data-kind="method"] a',
      '[data-kind="property"] a',
      // Code block links and method links
      'code a',
      'pre a',
      '.hljs a'
    ];
    
    // Join selectors with commas for a single query
    const selector = apiSelectors.join(',');
    
    // Find and process API links
    $(selector).each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = this.normalizeUrl(href, currentUrl, baseUrl);
        if (absoluteUrl) {
          links.add(absoluteUrl);
          logger.debug(`Found API link: ${absoluteUrl}`);
        }
      }
    });
    
    return links;
  }
  
  /**
   * Normalize a URL: convert to absolute form and filter by domain
   * @param href The href attribute value
   * @param currentUrl The current page URL
   * @param baseUrl The base URL for domain filtering
   * @returns Normalized absolute URL or null if invalid or outside domain
   */
  private static normalizeUrl(href: string, currentUrl: string, baseUrl: string): string | null {
    try {
      // Skip mailto: links
      if (href.startsWith('mailto:')) {
        return null;
      }
      
      // Skip same-page anchor links (e.g., #section)
      if (href.startsWith('#')) {
        return null;
      }
      
      // Skip javascript: links
      if (href.startsWith('javascript:')) {
        return null;
      }
      
      // Skip tel: links
      if (href.startsWith('tel:')) {
        return null;
      }
      
      const absoluteUrl = new URL(href, currentUrl).toString();
      
      // Only include links from the same domain
      if (absoluteUrl.startsWith(baseUrl)) {
        // Remove fragments from URLs (e.g., #section)
        // This ensures we don't crawl the same page multiple times due to different anchors
        const urlObj = new URL(absoluteUrl);
        urlObj.hash = '';
        return urlObj.toString();
      }
    } catch (error) {
      // Invalid URL - ignore
    }
    return null;
  }
} 
import axios from 'axios';
import * as cheerio from 'cheerio';
import { IContentExtractor } from '../interfaces/IContentExtractor';
import { ExtractedContent, ExtractionOptions, PageType } from '../interfaces/types';
import { LoggingUtils } from '../utils/LoggingUtils';
import { UrlUtils } from '../utils/UrlUtils';

/**
 * Content extractor implementation using Cheerio for static pages.
 * This is a lightweight implementation ideal for regular static HTML pages.
 */
export class CheerioExtractor implements IContentExtractor {
  private readonly logger = LoggingUtils.createTaggedLogger('cheerio-extractor');

  /**
   * Check if a URL should be excluded from crawling
   * @param url The URL to check
   * @returns True if the URL should be excluded
   */
  private isExcludedUrl(url: string): boolean {
    // Common file extensions to exclude
    const excludedExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', // Images
      '.css', '.js', '.json', '.xml', '.csv', '.rss', // Data files
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', // Documents
      '.zip', '.tar', '.gz', '.rar', // Archives
      '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.wav', '.ogg', // Media
      '.exe', '.bin', '.iso', '.dmg', // Executables
    ];
    
    // Check if URL ends with any excluded extension
    const lowercaseUrl = url.toLowerCase();
    return excludedExtensions.some(ext => lowercaseUrl.endsWith(ext));
  }

  /**
   * Extract content from a URL using Cheerio (HTML parser)
   * @param url The URL to extract content from
   * @param options Configuration options for the extraction
   * @returns The extracted content
   */
  async extract(url: string, options: ExtractionOptions = {}): Promise<ExtractedContent> {
    const startTime = Date.now();
    this.logger.debug(`Starting extraction for ${url}`);
    
    try {
      // Configure request
      const requestOptions = {
        headers: {
          'User-Agent': options.userAgent || 'DocMCP Crawler/1.0 (Cheerio)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: options.timeout || 10000,
        maxRedirects: 5,
      };
      
      // Fetch the page content
      const response = await axios.get(url, requestOptions);
      
      if (response.status !== 200) {
        throw new Error(`Failed to fetch page content: HTTP ${response.status}`);
      }
      
      // Parse HTML with Cheerio
      const $ = cheerio.load(response.data);
      
      // Extract page title
      const title = $('title').text().trim() || null;
      
      // Extract page content
      const content = response.data;
      
      // Extract text content
      const textContent = this.extractText($);
      
      // Extract metadata
      const metadata = this.extractMetadata($, url);
      
      // Extract links if requested
      let links: string[] = [];
      if (options.extractLinks) {
        links = this.extractLinks($, url);
      }
      
      const extractedContent: ExtractedContent = {
        url: url,
        title: title,
        content: content,
        text: textContent,
        metadata: metadata,
        links: links
      };
      
      const elapsedTime = Date.now() - startTime;
      this.logger.debug(`Extraction completed for ${url} in ${elapsedTime}ms`);
      
      return extractedContent;
      
    } catch (error) {
      this.logger.error(`Error extracting content from ${url}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Check if this extractor supports the given page type
   * @param pageType The type of page (static or SPA)
   * @returns True if this extractor supports the page type
   */
  supportsPageType(pageType: PageType): boolean {
    return pageType === PageType.STATIC;
  }
  
  /**
   * Clean up resources
   * Cheerio doesn't maintain persistent connections or resources, so this is a no-op
   */
  async cleanup(): Promise<void> {
    // No resources to clean up for Cheerio
    return Promise.resolve();
  }
  
  /**
   * Extract text content from the page
   * @param $ Cheerio instance
   * @returns Extracted text content
   */
  private extractText($: any): string {
    // Remove script and style elements as they contain no meaningful text
    $('script, style, noscript, iframe, img').remove();
    
    // Extract text from body or whole document if no body
    let textContent = '';
    
    if ($('body').length) {
      textContent = $('body').text();
    } else {
      textContent = $.text();
    }
    
    // Normalize and clean up text
    return textContent
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }
  
  /**
   * Extract metadata from the page
   * @param $ Cheerio instance
   * @param url Source URL
   * @returns Metadata object
   */
  private extractMetadata($: any, url: string): Record<string, any> {
    const metadata: Record<string, any> = {
      domain: UrlUtils.extractDomain(url),
      lastModified: null,
      author: null,
      description: null,
      keywords: [],
      language: null,
      canonicalUrl: null
    };
    
    // Extract meta description
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
    if (description) {
      metadata.description = description.trim();
    }
    
    // Extract meta keywords
    const keywords = $('meta[name="keywords"]').attr('content');
    if (keywords) {
      metadata.keywords = keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
    }
    
    // Extract language
    const language = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content');
    if (language) {
      metadata.language = language.trim();
    }
    
    // Extract canonical URL
    const canonical = $('link[rel="canonical"]').attr('href');
    if (canonical) {
      metadata.canonicalUrl = UrlUtils.resolveUrl(canonical, url);
    }
    
    // Extract author
    const author = $('meta[name="author"]').attr('content') || 
                  $('meta[property="article:author"]').attr('content');
    if (author) {
      metadata.author = author.trim();
    }
    
    // Extract last modified
    const lastModified = $('meta[http-equiv="last-modified"]').attr('content');
    if (lastModified) {
      metadata.lastModified = lastModified;
    }
    
    // Extract Open Graph metadata
    $('meta[property^="og:"]').each((_: number, element: any) => {
      const property = $(element).attr('property');
      const content = $(element).attr('content');
      
      if (property && content) {
        const key = property.replace('og:', '');
        metadata[`og_${key}`] = content.trim();
      }
    });
    
    return metadata;
  }
  
  /**
   * Extract links from the page
   * @param $ Cheerio instance
   * @param baseUrl Base URL for resolving relative links
   * @returns Array of normalized absolute URLs
   */
  private extractLinks($: any, baseUrl: string): string[] {
    const links = new Set<string>();
    
    // Extract regular links but not javascript:void(0)
    $('a[href]').each((_: number, element: any) => {
      const href = $(element).attr('href');
      if (href && href !== 'javascript:void(0)') {
        try {
          const absoluteUrl = UrlUtils.resolveUrl(href, baseUrl);
          if (UrlUtils.isValid(absoluteUrl) && !this.isExcludedUrl(absoluteUrl)) {
            links.add(absoluteUrl);
          }
        } catch (error) {
          // Invalid or malformed URL, skip it
        }
      }
    });
    
    return Array.from(links);
  }
} 
import { ExtractedContent, ExtractionOptions, PageType } from './types';

/**
 * Interface for content extraction strategies.
 * Implementations provide different ways to extract content from web pages,
 * such as using Cheerio for static pages or Puppeteer for SPAs.
 */
export interface IContentExtractor {
  /**
   * Extract content from a URL
   * @param url The URL to extract content from
   * @param options Configuration options for the extraction
   * @returns The extracted content including title, HTML content, metadata, and links
   */
  extract(url: string, options: ExtractionOptions): Promise<ExtractedContent>;
  
  /**
   * Check if this extractor supports the given page type
   * @param pageType The type of page (static or SPA)
   * @returns True if this extractor supports the page type
   */
  supportsPageType(pageType: PageType): boolean;
  
  /**
   * Clean up resources used by the extractor
   * This is especially important for browser-based extractors like Puppeteer
   */
  cleanup(): Promise<void>;
} 
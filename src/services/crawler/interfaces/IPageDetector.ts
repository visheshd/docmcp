import { PageTypeResult } from './types';

/**
 * Interface for page type detection.
 * Implementations analyze web pages to determine if they are static HTML pages
 * or Single Page Applications (SPAs) that require JavaScript execution.
 */
export interface IPageDetector {
  /**
   * Detect the type of page (static HTML or SPA)
   * @param url The URL to analyze
   * @param htmlContent Optional pre-fetched HTML content
   * @returns Result object with page type determination and confidence score
   */
  detectPageType(url: string, htmlContent?: string): Promise<PageTypeResult>;
  
  /**
   * Convenience method to determine if a page is an SPA
   * @param url The URL to analyze
   * @param htmlContent Optional pre-fetched HTML content
   * @returns True if the page is determined to be an SPA
   */
  isSPA(url: string, htmlContent?: string): Promise<boolean>;
} 
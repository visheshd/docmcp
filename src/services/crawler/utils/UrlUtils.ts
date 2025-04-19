import { URL } from 'url';

/**
 * Utilities for handling URLs in the crawler service
 */
export class UrlUtils {
  /**
   * Normalizes a URL by removing trailing slashes, fragments, and normalizing protocol
   * @param url The URL to normalize
   * @returns The normalized URL string
   */
  static normalize(url: string): string {
    try {
      const parsedUrl = new URL(url);
      
      // Remove hash fragments
      parsedUrl.hash = '';
      
      // Normalize protocol (prefer https)
      if (parsedUrl.protocol === 'http:' && !url.includes('http://localhost')) {
        parsedUrl.protocol = 'https:';
      }
      
      // Get the base URL without trailing slash
      let normalizedUrl = parsedUrl.toString();
      if (normalizedUrl.endsWith('/')) {
        normalizedUrl = normalizedUrl.slice(0, -1);
      }
      
      return normalizedUrl;
    } catch (error) {
      // If URL parsing fails, return the original URL
      return url;
    }
  }

  /**
   * Extracts the domain from a URL
   * @param url The URL to extract the domain from
   * @returns The domain string or null if the URL is invalid
   */
  static extractDomain(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validates if a string is a properly formatted URL
   * @param url The URL to validate
   * @returns True if the URL is valid, false otherwise
   */
  static isValid(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Resolves a relative URL against a base URL
   * @param relativeUrl The relative URL to resolve
   * @param baseUrl The base URL to resolve against
   * @returns The resolved absolute URL
   */
  static resolveUrl(relativeUrl: string, baseUrl: string): string {
    try {
      return new URL(relativeUrl, baseUrl).toString();
    } catch (error) {
      return relativeUrl;
    }
  }

  /**
   * Checks if a URL is from the same domain as the base URL
   * @param url The URL to check
   * @param baseUrl The base URL to compare against
   * @returns True if the URL is from the same domain, false otherwise
   */
  static isSameDomain(url: string, baseUrl: string): boolean {
    try {
      const urlDomain = this.extractDomain(url);
      const baseDomain = this.extractDomain(baseUrl);
      return urlDomain === baseDomain && urlDomain !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets the root URL (protocol + domain) from a URL
   * @param url The URL to get the root from
   * @returns The root URL
   */
  static getRootUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      return `${parsedUrl.protocol}//${parsedUrl.hostname}`;
    } catch (error) {
      return url;
    }
  }
} 
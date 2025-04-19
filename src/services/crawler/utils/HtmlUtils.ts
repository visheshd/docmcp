import * as cheerio from 'cheerio';

/**
 * Utilities for handling HTML content in the crawler service
 */
export class HtmlUtils {
  /**
   * Extract the title from HTML content
   * @param html The HTML content
   * @returns The extracted title or null if not found
   */
  static extractTitle(html: string): string | null {
    try {
      const $ = cheerio.load(html);
      const title = $('title').text().trim();
      return title || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract meta tags from HTML content
   * @param html The HTML content
   * @returns An object with meta tag names/properties as keys and content as values
   */
  static extractMetaTags(html: string): Record<string, string> {
    try {
      const $ = cheerio.load(html);
      const metaTags: Record<string, string> = {};

      $('meta').each((_, el) => {
        const name = $(el).attr('name') || $(el).attr('property');
        const content = $(el).attr('content');

        if (name && content) {
          metaTags[name] = content;
        }
      });

      return metaTags;
    } catch (error) {
      return {};
    }
  }

  /**
   * Extract the main content from HTML, attempting to identify the main content area
   * @param html The HTML content
   * @returns The extracted main content or null if extraction fails
   */
  static extractMainContent(html: string): string | null {
    try {
      const $ = cheerio.load(html);
      
      // Try to find main content by common containers
      const contentSelectors = [
        'main',
        'article',
        '.content',
        '#content',
        '.main',
        '#main',
        '.article',
        '.post',
        '.page-content',
        '.entry-content',
      ];

      // Find first match with substantial content
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length && element.text().trim().length > 100) {
          return element.html() || null;
        }
      }

      // Fallback to body if no content containers found
      return $('body').html() || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Remove script and style tags from HTML content
   * @param html The HTML content
   * @returns The cleaned HTML
   */
  static removeScripts(html: string): string {
    try {
      const $ = cheerio.load(html);
      $('script, style').remove();
      return $.html();
    } catch (error) {
      return html;
    }
  }

  /**
   * Convert HTML to plain text by removing all tags
   * @param html The HTML content
   * @returns Plain text extracted from HTML
   */
  static htmlToText(html: string): string {
    try {
      const $ = cheerio.load(html);
      return $('body').text().replace(/\s+/g, ' ').trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * Check if HTML content contains specific framework signatures
   * @param html The HTML content
   * @returns An object with detected frameworks
   */
  static detectFrameworks(html: string): Record<string, boolean> {
    const frameworks: Record<string, boolean> = {
      react: false,
      angular: false,
      vue: false,
      svelte: false,
      next: false,
      nuxt: false,
    };

    try {
      const $ = cheerio.load(html);
      const htmlContent = $.html();

      // React detection
      frameworks.react = 
        htmlContent.includes('react') || 
        htmlContent.includes('ReactDOM') || 
        $('[data-reactroot]').length > 0 || 
        $('[data-reactid]').length > 0 ||
        $('#root').length > 0;

      // Angular detection
      frameworks.angular = 
        htmlContent.includes('ng-') || 
        htmlContent.includes('angular') || 
        $('[ng-app]').length > 0 ||
        $('[ng-controller]').length > 0 ||
        $('app-root').length > 0;

      // Vue detection
      frameworks.vue = 
        htmlContent.includes('vue.js') || 
        htmlContent.includes('vue.min.js') || 
        $('[v-app]').length > 0 || 
        $('[v-if]').length > 0 ||
        $('#app[data-v-app]').length > 0;

      // Svelte detection
      frameworks.svelte = 
        htmlContent.includes('svelte') || 
        $('script[type="application/node"]').length > 0;

      // Next.js detection
      frameworks.next = 
        htmlContent.includes('__NEXT_DATA__') || 
        $('div#__next').length > 0;

      // Nuxt.js detection
      frameworks.nuxt = 
        htmlContent.includes('__NUXT__') || 
        $('div#__nuxt').length > 0 ||
        $('div#__layout').length > 0;

      return frameworks;
    } catch (error) {
      return frameworks;
    }
  }
} 
import puppeteer, { Browser, Page } from 'puppeteer';
import { IContentExtractor } from '../interfaces/IContentExtractor';
import { ExtractedContent, ExtractionOptions, PageType } from '../interfaces/types';
import { LoggingUtils } from '../utils/LoggingUtils';
import { UrlUtils } from '../utils/UrlUtils';

/**
 * Content extractor implementation using Puppeteer for SPAs (Single Page Applications).
 * This extractor uses a headless browser to render JavaScript and capture the fully
 * rendered DOM, making it suitable for modern web applications.
 */
export class PuppeteerExtractor implements IContentExtractor {
  private readonly logger = LoggingUtils.createTaggedLogger('puppeteer-extractor');
  private browser: Browser | null = null;
  private browserInitPromise: Promise<Browser> | null = null;
  private pages: Set<Page> = new Set();

  /**
   * Initialize the browser instance lazily
   * @returns A promise that resolves to the browser instance
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    if (this.browserInitPromise) {
      return this.browserInitPromise;
    }

    this.logger.debug('Initializing Puppeteer browser instance');
    
    this.browserInitPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ]
    });

    try {
      this.browser = await this.browserInitPromise;
      this.logger.debug('Puppeteer browser instance initialized successfully');
      return this.browser;
    } catch (error) {
      this.browserInitPromise = null;
      this.logger.error(`Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Extract content from a URL using Puppeteer (headless browser)
   * @param url The URL to extract content from
   * @param options Configuration options for the extraction
   * @returns The extracted content
   */
  async extract(url: string, options: ExtractionOptions = {}): Promise<ExtractedContent> {
    const startTime = Date.now();
    this.logger.debug(`Starting extraction for ${url}`);
    
    let page: Page | null = null;
    
    try {
      // Initialize browser if not already done
      const browser = await this.initBrowser();
      
      // Create a new page
      page = await browser.newPage();
      this.pages.add(page);
      
      // Configure page
      await this.configurePage(page, options);
      
      // Navigate to the URL
      this.logger.debug(`Navigating to ${url}`);
      const response = await page.goto(url, {
        waitUntil: 'networkidle2', // Wait until there are no more network connections for at least 500ms
        timeout: options.timeout || 30000,
      });
      
      if (!response) {
        throw new Error(`Failed to load page: ${url}`);
      }
      
      if (response.status() >= 400) {
        throw new Error(`Failed to load page: HTTP ${response.status()} - ${url}`);
      }

      // Wait for specified selector if provided
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { 
          timeout: options.timeout || 30000 
        });
      }
      
      // Wait for additional time if specified
      if (options.waitForTimeout) {
        // Use setTimeout instead of waitForTimeout which may not be available in all Puppeteer versions
        await new Promise(resolve => setTimeout(resolve, options.waitForTimeout));
      }
      
      // Extract the page title
      const title = await page.title();
      
      // Get the fully rendered HTML
      const content = await page.content();
      
      // Extract text content
      const text = await this.extractText(page);
      
      // Extract metadata
      const metadata = await this.extractMetadata(page, url);
      
      // Extract links if requested
      let links: string[] = [];
      if (options.extractLinks) {
        links = await this.extractLinks(page, url);
      }
      
      const extractedContent: ExtractedContent = {
        url: url,
        title: title || null,
        content: content,
        text: text,
        metadata: metadata,
        links: links
      };
      
      const elapsedTime = Date.now() - startTime;
      this.logger.debug(`Extraction completed for ${url} in ${elapsedTime}ms`);
      
      return extractedContent;
      
    } catch (error) {
      this.logger.error(`Error extracting content from ${url}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      // Clean up page resources
      if (page) {
        this.pages.delete(page);
        try {
          await page.close();
        } catch (error) {
          // Ignore errors during page closure
        }
      }
    }
  }
  
  /**
   * Configure the Puppeteer page with appropriate settings
   * @param page Puppeteer Page object
   * @param options Extraction options
   */
  private async configurePage(page: Page, options: ExtractionOptions): Promise<void> {
    // Set user agent
    if (options.userAgent) {
      await page.setUserAgent(options.userAgent);
    } else {
      await page.setUserAgent('DocMCP Crawler/1.0 (Puppeteer)');
    }
    
    // Set viewport
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });
    
    // Disable images, fonts, and CSS if we're only interested in content
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Handle console messages for debugging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.logger.debug(`Console error on page: ${msg.text()}`);
      }
    });
  }
  
  /**
   * Extract text content from the page
   * @param page Puppeteer Page object
   * @returns Extracted text content
   */
  private async extractText(page: Page): Promise<string> {
    // Extract all text content from the page
    return page.evaluate(() => {
      const scripts = document.querySelectorAll('script, style, noscript, iframe');
      scripts.forEach(s => s.remove());
      
      // Get text from body or whole document if no body
      const body = document.body || document.documentElement;
      return body.innerText
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();
    });
  }
  
  /**
   * Extract metadata from the page
   * @param page Puppeteer Page object
   * @param url Source URL
   * @returns Metadata object
   */
  private async extractMetadata(page: Page, url: string): Promise<Record<string, any>> {
    return page.evaluate((baseUrl) => {
      const metadata: Record<string, any> = {
        domain: new URL(baseUrl).hostname,
        lastModified: null,
        author: null,
        description: null,
        keywords: [],
        language: null,
        canonicalUrl: null,
        renderedWith: 'puppeteer'
      };
      
      // Extract meta description
      const descriptionMeta = document.querySelector('meta[name="description"]') || 
                             document.querySelector('meta[property="og:description"]');
      if (descriptionMeta && descriptionMeta.getAttribute('content')) {
        metadata.description = descriptionMeta.getAttribute('content')?.trim();
      }
      
      // Extract meta keywords
      const keywordsMeta = document.querySelector('meta[name="keywords"]');
      if (keywordsMeta && keywordsMeta.getAttribute('content')) {
        metadata.keywords = keywordsMeta.getAttribute('content')
          ?.split(',')
          .map(k => k.trim())
          .filter(Boolean) || [];
      }
      
      // Extract language
      const html = document.querySelector('html');
      const langMeta = document.querySelector('meta[http-equiv="content-language"]');
      
      metadata.language = (html && html.getAttribute('lang')) || 
                         (langMeta && langMeta.getAttribute('content')) || 
                         null;
      
      // Extract canonical URL
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      if (canonicalLink && canonicalLink.getAttribute('href')) {
        const href = canonicalLink.getAttribute('href');
        metadata.canonicalUrl = href?.startsWith('http') 
          ? href 
          : new URL(href || '', baseUrl).href;
      }
      
      // Extract author
      const authorMeta = document.querySelector('meta[name="author"]') || 
                        document.querySelector('meta[property="article:author"]');
      if (authorMeta && authorMeta.getAttribute('content')) {
        metadata.author = authorMeta.getAttribute('content')?.trim();
      }
      
      // Extract last modified
      const lastModifiedMeta = document.querySelector('meta[http-equiv="last-modified"]');
      if (lastModifiedMeta && lastModifiedMeta.getAttribute('content')) {
        metadata.lastModified = lastModifiedMeta.getAttribute('content');
      }
      
      // Extract Open Graph metadata
      document.querySelectorAll('meta[property^="og:"]').forEach(element => {
        const property = element.getAttribute('property');
        const content = element.getAttribute('content');
        
        if (property && content) {
          const key = property.replace('og:', '');
          metadata[`og_${key}`] = content.trim();
        }
      });
      
      // Detect SPA frameworks
      const frameworks = [];
      
      // React detection
      if (
        document.querySelector('[data-reactroot]') || 
        document.querySelector('[data-reactid]') ||
        // @ts-ignore: React devtools global hook may not exist in all windows
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__
      ) {
        frameworks.push('react');
      }
      
      // Angular detection
      if (
        document.querySelector('[ng-app]') ||
        document.querySelector('[ng-controller]') ||
        document.querySelector('[ng-model]') ||
        document.querySelectorAll('*[class*="ng-"]').length > 0 ||
        // @ts-ignore: Angular globals may not exist in all windows
        window.getAllAngularRootElements
      ) {
        frameworks.push('angular');
      }
      
      // Vue detection  
      if (
        document.querySelector('[data-v-]') ||
        document.querySelectorAll('*[class*="v-"]').length > 0 ||
        // @ts-ignore: Vue globals may not exist in all windows
        window.__VUE__
      ) {
        frameworks.push('vue');
      }
      
      if (frameworks.length > 0) {
        metadata.frameworks = frameworks;
      }
      
      return metadata;
    }, url);
  }
  
  /**
   * Extract links from the page
   * @param page Puppeteer Page object
   * @param baseUrl Base URL for resolving relative links
   * @returns Array of normalized absolute URLs
   */
  private async extractLinks(page: Page, baseUrl: string): Promise<string[]> {
    return page.evaluate((baseUrl) => {
      const links = new Set<string>();
      const excludedExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
        '.css', '.js', '.json', '.xml', '.csv', '.rss',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.zip', '.tar', '.gz', '.rar',
        '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.wav', '.ogg',
        '.exe', '.bin', '.iso', '.dmg',
      ];
      
      const isExcludedUrl = (url: string): boolean => {
        const lowercaseUrl = url.toLowerCase();
        return excludedExtensions.some(ext => lowercaseUrl.endsWith(ext));
      };
      
      const resolveUrl = (url: string, base: string): string => {
        try {
          return new URL(url, base).href;
        } catch (e) {
          return '';
        }
      };
      
      const isValidUrl = (url: string): boolean => {
        try {
          new URL(url);
          return true;
        } catch (e) {
          return false;
        }
      };
      
      // Extract regular links
      document.querySelectorAll('a[href]').forEach(element => {
        const href = element.getAttribute('href');
        if (href) {
          try {
            const absoluteUrl = resolveUrl(href, baseUrl);
            if (isValidUrl(absoluteUrl) && !isExcludedUrl(absoluteUrl)) {
              links.add(absoluteUrl);
            }
          } catch (error) {
            // Invalid or malformed URL, skip it
          }
        }
      });
      
      return Array.from(links);
    }, baseUrl);
  }

  /**
   * Check if this extractor supports the given page type
   * @param pageType The type of page (static or SPA)
   * @returns True if this extractor supports the page type
   */
  supportsPageType(pageType: PageType): boolean {
    return pageType === PageType.SPA;
  }
  
  /**
   * Clean up Puppeteer resources
   * This is important to prevent memory leaks
   */
  async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up Puppeteer resources');
    
    // Close all open pages
    for (const page of this.pages) {
      try {
        await page.close();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    
    this.pages.clear();
    
    // Close browser instance if it exists
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.browserInitPromise = null;
        this.logger.debug('Puppeteer browser instance closed');
      } catch (error) {
        this.logger.error(`Error closing browser: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
} 
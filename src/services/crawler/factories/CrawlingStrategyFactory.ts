import { IContentExtractor } from '../interfaces/IContentExtractor';
import { IPageDetector } from '../interfaces/IPageDetector';
import { StrategyFactoryOptions, PageType } from '../interfaces/types';
import { LoggingUtils } from '../utils/LoggingUtils';

/**
 * Factory for selecting the appropriate content extraction strategy based on page type
 * This factory determines whether to use CheerioExtractor for static pages
 * or PuppeteerExtractor for SPAs (Single Page Applications)
 */
export class CrawlingStrategyFactory {
  private readonly logger = LoggingUtils.createTaggedLogger('strategy-factory');

  /**
   * Create a new CrawlingStrategyFactory
   * @param pageDetector The page detector for identifying page types
   * @param cheerioExtractor The extractor for static pages
   * @param puppeteerExtractor The extractor for SPAs
   * @param options Configuration options for the factory
   */
  constructor(
    private readonly pageDetector: IPageDetector,
    private readonly cheerioExtractor: IContentExtractor,
    private readonly puppeteerExtractor: IContentExtractor,
    private readonly options: StrategyFactoryOptions = {}
  ) {
    // Verify extractors support their expected page types
    if (!cheerioExtractor.supportsPageType(PageType.STATIC)) {
      this.logger.warn('Cheerio extractor doesn\'t report supporting static pages');
    }
    
    if (!puppeteerExtractor.supportsPageType(PageType.SPA)) {
      this.logger.warn('Puppeteer extractor doesn\'t report supporting SPAs');
    }
  }

  /**
   * Get the appropriate extractor for a URL
   * @param url The URL to get an extractor for
   * @param htmlContent Optional HTML content if already fetched
   * @returns The appropriate content extractor for the URL
   */
  async getExtractorForUrl(url: string, htmlContent?: string): Promise<IContentExtractor> {
    this.logger.debug(`Getting extractor for URL: ${url}`);
    
    // Check if strategy is forced in options
    if (this.options.forceStrategy === 'cheerio') {
      this.logger.debug(`Forced strategy 'cheerio' for ${url}`);
      return this.cheerioExtractor;
    } else if (this.options.forceStrategy === 'puppeteer') {
      this.logger.debug(`Forced strategy 'puppeteer' for ${url}`);
      return this.puppeteerExtractor;
    }
    
    try {
      // Detect page type and select appropriate extractor
      const pageTypeResult = await this.pageDetector.detectPageType(url, htmlContent);
      
      this.logger.debug(`Detected page type for ${url}: ${pageTypeResult.pageType} (confidence: ${pageTypeResult.confidence.toFixed(2)})`);
      
      // Select extractor based on page type
      if (pageTypeResult.isSPA) {
        this.logger.debug(`Using Puppeteer extractor for SPA: ${url}`);
        return this.puppeteerExtractor;
      } else {
        this.logger.debug(`Using Cheerio extractor for static page: ${url}`);
        return this.cheerioExtractor;
      }
    } catch (error) {
      // If detection fails, default to Cheerio as it's more lightweight
      this.logger.error(`Error detecting page type for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.debug(`Defaulting to Cheerio extractor for ${url} due to detection failure`);
      return this.cheerioExtractor;
    }
  }
  
  /**
   * Get extractor directly by page type
   * This bypasses detection and can be used when page type is already known
   * @param pageType The known page type
   * @returns The appropriate content extractor for the page type
   */
  getExtractorByPageType(pageType: PageType): IContentExtractor {
    return pageType === PageType.SPA ? this.puppeteerExtractor : this.cheerioExtractor;
  }
} 
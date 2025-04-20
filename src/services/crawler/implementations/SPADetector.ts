import axios from 'axios';
import { IPageDetector } from '../interfaces/IPageDetector';
import { PageType, PageTypeResult, SPADetectorOptions } from '../interfaces/types';
import { LoggingUtils } from '../utils/LoggingUtils';
import { UrlUtils } from '../utils/UrlUtils';

/**
 * Implements page type detection to distinguish between Single Page Applications (SPAs)
 * and static websites using a scoring system and multi-factor analysis.
 */
export class SPADetector implements IPageDetector {
  private readonly logger = LoggingUtils.createTaggedLogger('spa-detector');
  private readonly signaturePatterns = [
    { pattern: /react|reactjs|react-dom/i, framework: 'React', weight: 1.0 },
    { pattern: /angular|ng-|ngx-|angular.js|angular.min.js/i, framework: 'Angular', weight: 1.0 },
    { pattern: /vue|vuejs|vue.js|vue.min.js|vue-router/i, framework: 'Vue', weight: 1.0 },
    { pattern: /ember|emberjs|ember.js|ember.min.js/i, framework: 'Ember', weight: 0.9 },
    { pattern: /backbone|backbone.js|backbone.min.js/i, framework: 'Backbone', weight: 0.8 },
    { pattern: /svelte|sveltejs|svelte.js/i, framework: 'Svelte', weight: 0.9 },
    { pattern: /jquery|jquery.js|jquery.min.js/i, framework: 'jQuery', weight: 0.5 },
    { pattern: /next-page|__next|nextjs|next.js|_next\//i, framework: 'Next.js', weight: 1.0 },
    { pattern: /nuxt|nuxtjs|nuxt.js|nuxt-link/i, framework: 'Nuxt.js', weight: 1.0 }
  ];

  // DOM structure patterns typical for SPAs
  private readonly domPatterns = [
    { pattern: /<div[^>]*id=["']root["'][^>]*>/i, description: 'React root', weight: 0.8 },
    { pattern: /<div[^>]*id=["']app["'][^>]*>/i, description: 'Vue/generic app root', weight: 0.8 },
    { pattern: /<div[^>]*id=["']__next["'][^>]*>/i, description: 'Next.js root', weight: 0.9 },
    { pattern: /<div[^>]*ng-app[^>]*>/i, description: 'Angular app', weight: 0.9 },
    { pattern: /<div[^>]*data-reactroot[^>]*>/i, description: 'React root', weight: 0.9 },
    { pattern: /<[^>]*data-v-[a-f0-9]+[^>]*>/i, description: 'Vue component', weight: 0.9 },
    { pattern: /<[^>]*ng-controller[^>]*>/i, description: 'Angular controller', weight: 0.9 },
  ];

  // Routing signatures typical for SPAs
  private readonly routingPatterns = [
    { pattern: /history\.pushState|history\.replaceState/i, description: 'History API', weight: 0.7 },
    { pattern: /location\.hash|hashchange|#!\//i, description: 'Hash-based routing', weight: 0.7 },
    { pattern: /router-view|router-link|ui-view|ng-view/i, description: 'Framework router', weight: 0.8 },
    { pattern: /route-href|router\.navigate|useRouter|createRouter/i, description: 'Router usage', weight: 0.7 }
  ];

  // Cache detection results by domain
  private domainTypeCache = new Map<string, PageTypeResult>();

  constructor(private readonly options: SPADetectorOptions = {}) {
    // Set default options
    this.options = {
      staticAnalysisWeight: 0.7,
      dynamicAnalysisWeight: 0.3,
      spaConfidenceThreshold: 0.6,
      cacheResults: true,
      enableDynamicAnalysis: false,
      ...options
    };
  }

  /**
   * Detects if a page is a Single Page Application or a static website
   * @param url The URL to analyze
   * @param htmlContent Optional HTML content if already fetched
   * @returns Detection result with SPA status, confidence score, and detection method
   */
  async detectPageType(url: string, htmlContent?: string): Promise<PageTypeResult> {
    const domain = UrlUtils.extractDomain(url);

    if (!domain) {
      this.logger.error(`Invalid URL: ${url}`);
      return {
        isSPA: false,
        confidence: 0,
        pageType: PageType.STATIC,
        detectionMethod: 'static'
      };
    }
    
    // Check cache first if enabled
    if (this.options.cacheResults && this.domainTypeCache.has(domain)) {
      this.logger.debug(`Using cached detection result for domain ${domain}`);
      return this.domainTypeCache.get(domain)!;
    }
    
    // Start with static analysis 
    let staticScore = await this.analyzeStaticContent(url, htmlContent);
    let detectionMethod: 'static' | 'dynamic' | 'hybrid' = 'static';
    
    // Only perform dynamic analysis if enabled and static analysis is inconclusive
    if (this.options.enableDynamicAnalysis && 
        staticScore > 0.3 && staticScore < 0.7) {
      this.logger.debug(`Static analysis score (${staticScore.toFixed(2)}) is inconclusive, performing dynamic analysis for ${url}`);
      const dynamicScore = await this.analyzeDynamicBehavior(url);
      
      // Combine scores with respective weights
      staticScore = (staticScore * (this.options.staticAnalysisWeight || 0.7)) + 
                   (dynamicScore * (this.options.dynamicAnalysisWeight || 0.3));
      detectionMethod = 'hybrid';
    }
    
    // Determine result
    const isSPA = staticScore >= (this.options.spaConfidenceThreshold || 0.6);
    const result: PageTypeResult = {
      isSPA,
      confidence: staticScore,
      pageType: isSPA ? PageType.SPA : PageType.STATIC,
      detectionMethod
    };
    
    // Cache result if enabled
    if (this.options.cacheResults) {
      this.domainTypeCache.set(domain, result);
    }
    
    this.logger.debug(`Detected page type for ${url}: ${result.pageType} (confidence: ${result.confidence.toFixed(2)})`);
    return result;
  }

  /**
   * Simplified interface to check if a URL is a SPA
   * @param url The URL to check
   * @param htmlContent Optional HTML content if already fetched
   * @returns True if the page is likely a SPA
   */
  async isSPA(url: string, htmlContent?: string): Promise<boolean> {
    const result = await this.detectPageType(url, htmlContent);
    return result.isSPA;
  }

  /**
   * Analyze static HTML content for SPA signatures
   * @param url The URL to analyze
   * @param htmlContent Optional HTML content if already fetched
   * @returns A score between 0-1 indicating SPA likelihood
   */
  private async analyzeStaticContent(url: string, htmlContent?: string): Promise<number> {
    try {
      // Fetch HTML content if not provided
      const html = htmlContent || await this.fetchHtml(url);
      if (!html) {
        this.logger.warn(`Failed to get HTML content for ${url}`);
        return 0;
      }

      // Initialize empty scores
      let totalScore = 0;
      let totalWeight = 0;
      const detectedFrameworks = new Set<string>();
      
      // Check for SPA framework signatures in scripts and links
      for (const pattern of this.signaturePatterns) {
        if (pattern.pattern.test(html)) {
          totalScore += pattern.weight;
          totalWeight += pattern.weight;
          detectedFrameworks.add(pattern.framework);
          this.logger.debug(`Detected framework signature: ${pattern.framework} in ${url}`);
        }
      }
      
      // Check for typical SPA DOM structures
      for (const pattern of this.domPatterns) {
        if (pattern.pattern.test(html)) {
          totalScore += pattern.weight;
          totalWeight += pattern.weight;
          this.logger.debug(`Detected SPA DOM structure: ${pattern.description} in ${url}`);
        }
      }
      
      // Check for routing-related signatures
      for (const pattern of this.routingPatterns) {
        if (pattern.pattern.test(html)) {
          totalScore += pattern.weight;
          totalWeight += pattern.weight;
          this.logger.debug(`Detected routing pattern: ${pattern.description} in ${url}`);
        }
      }
      
      // Check for minimal HTML with JavaScript loading
      const hasMinimalHtml = this.hasMinimalHtmlStructure(html);
      if (hasMinimalHtml) {
        totalScore += 0.5;
        totalWeight += 0.5;
        this.logger.debug(`Detected minimal HTML structure with heavy JavaScript loading in ${url}`);
      }
      
      // Normalize score (if no weights were applied, assume not SPA)
      if (totalWeight === 0) {
        return 0;
      }
      
      const normalizedScore = totalScore / totalWeight;
      this.logger.debug(`Static analysis score for ${url}: ${normalizedScore.toFixed(2)} (frameworks: ${Array.from(detectedFrameworks).join(', ') || 'none'})`);
      
      return normalizedScore;
    } catch (error) {
      this.logger.error(`Error analyzing static content for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  /**
   * Fetch HTML content from a URL
   * @param url The URL to fetch
   * @returns The HTML content as string or null if failed
   */
  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'DocMCP Crawler/1.0 (SPA Detector)',
          'Accept': 'text/html'
        },
        timeout: 10000
      });
      
      if (response.status === 200 && response.data) {
        return response.data;
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error fetching HTML from ${url}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Check if HTML has minimal structure with heavy JavaScript loading
   * Typical for SPAs that render most content through JavaScript
   * @param html The HTML content to analyze
   * @returns True if the structure suggests SPA
   */
  private hasMinimalHtmlStructure(html: string): boolean {
    const mainContentRegex = /<body[^>]*>([\s\S]*?)<\/body>/i;
    const mainContentMatch = mainContentRegex.exec(html);
    
    if (!mainContentMatch || !mainContentMatch[1]) {
      return false;
    }
    
    // Get content inside body tag and remove scripts, comments, and whitespace
    let bodyContent = mainContentMatch[1]
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Check for empty or nearly empty body with scripts
    const scriptTags = (html.match(/<script[^>]*>/g) || []).length;
    const scriptSources = (html.match(/src=["'][^"']*["']/g) || []).length;
    
    // If body has very little content but many scripts, likely SPA
    return (bodyContent.length < 500 && scriptTags > 3) || 
           (bodyContent.length < 1000 && scriptSources > 5);
  }

  /**
   * Analyze dynamic behavior to detect SPA characteristics
   * This is a placeholder since puppeteer integration would be needed for actual implementation
   * @param url The URL to analyze
   * @returns A score between 0-1 indicating SPA likelihood
   */
  private async analyzeDynamicBehavior(url: string): Promise<number> {
    // This would require Puppeteer for actual implementation
    // Just return a default value for now
    this.logger.debug(`Dynamic analysis not fully implemented yet for ${url}, returning default score`);
    return 0.5;
  }
} 
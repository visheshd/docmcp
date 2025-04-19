import { ICrawler } from '../interfaces/ICrawler';
import { IContentExtractor } from '../interfaces/IContentExtractor';
import { IPageDetector } from '../interfaces/IPageDetector';
import { ILinkExtractor } from '../interfaces/ILinkExtractor';
import { IRateLimiter } from '../interfaces/IRateLimiter';
import { IJobManager } from '../interfaces/IJobManager';
import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import { IRobotsTxtService } from '../interfaces/IRobotsTxtService';
import { IUrlQueue } from '../interfaces/IUrlQueue';
import { CrawlOptions, StrategyFactoryOptions } from '../interfaces/types';

/**
 * Factory for creating and managing service instances with proper dependency injection.
 * This class implements a simple DI container pattern to manage the lifecycle of services.
 */
export class ServiceFactory {
  private services = new Map<string, any>();
  private readonly options: CrawlOptions;
  
  /**
   * Create a new ServiceFactory
   * @param options Global options for the crawler services
   */
  constructor(options: CrawlOptions) {
    this.options = options;
  }
  
  /**
   * Register an implementation for an interface
   * @param interfaceName Name of the interface
   * @param implementation Instance implementing the interface
   */
  register<T>(interfaceName: string, implementation: T): void {
    this.services.set(interfaceName, implementation);
  }
  
  /**
   * Get an implementation for an interface
   * @param interfaceName Name of the interface
   * @returns The registered implementation
   * @throws Error if no implementation is registered
   */
  get<T>(interfaceName: string): T {
    const implementation = this.services.get(interfaceName);
    
    if (!implementation) {
      throw new Error(`No implementation registered for ${interfaceName}`);
    }
    
    return implementation as T;
  }
  
  /**
   * Check if an implementation is registered for an interface
   * @param interfaceName Name of the interface
   * @returns True if an implementation is registered
   */
  has(interfaceName: string): boolean {
    return this.services.has(interfaceName);
  }
  
  /**
   * Get a crawler implementation
   * @returns ICrawler implementation
   */
  getCrawler(): ICrawler {
    return this.get<ICrawler>('ICrawler');
  }
  
  /**
   * Get a content extractor implementation
   * @returns IContentExtractor implementation
   */
  getContentExtractor(): IContentExtractor {
    return this.get<IContentExtractor>('IContentExtractor');
  }
  
  /**
   * Get a page detector implementation
   * @returns IPageDetector implementation
   */
  getPageDetector(): IPageDetector {
    return this.get<IPageDetector>('IPageDetector');
  }
  
  /**
   * Get a link extractor implementation
   * @returns ILinkExtractor implementation
   */
  getLinkExtractor(): ILinkExtractor {
    return this.get<ILinkExtractor>('ILinkExtractor');
  }
  
  /**
   * Get a rate limiter implementation
   * @returns IRateLimiter implementation
   */
  getRateLimiter(): IRateLimiter {
    return this.get<IRateLimiter>('IRateLimiter');
  }
  
  /**
   * Get a job manager implementation
   * @returns IJobManager implementation
   */
  getJobManager(): IJobManager {
    return this.get<IJobManager>('IJobManager');
  }
  
  /**
   * Get a document processor implementation
   * @returns IDocumentProcessor implementation
   */
  getDocumentProcessor(): IDocumentProcessor {
    return this.get<IDocumentProcessor>('IDocumentProcessor');
  }
  
  /**
   * Get a robots.txt service implementation
   * @returns IRobotsTxtService implementation
   */
  getRobotsTxtService(): IRobotsTxtService {
    return this.get<IRobotsTxtService>('IRobotsTxtService');
  }
  
  /**
   * Get a URL queue implementation
   * @returns IUrlQueue implementation
   */
  getUrlQueue(): IUrlQueue {
    return this.get<IUrlQueue>('IUrlQueue');
  }
  
  /**
   * Get the global crawler options
   * @returns CrawlOptions
   */
  getOptions(): CrawlOptions {
    return { ...this.options };
  }
} 
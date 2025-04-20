import { CrawlingStrategyFactory } from '../CrawlingStrategyFactory';
import { CheerioExtractor } from '../../implementations/CheerioExtractor';
import { PuppeteerExtractor } from '../../implementations/PuppeteerExtractor';
import { PageType, PageTypeResult } from '../../interfaces/types';
import { IContentExtractor } from '../../interfaces/IContentExtractor';
import { IPageDetector } from '../../interfaces/IPageDetector';

// Create mocks
jest.mock('../../implementations/CheerioExtractor');
jest.mock('../../implementations/PuppeteerExtractor');

describe('CrawlingStrategyFactory', () => {
  // Mock implementations
  let mockCheerioExtractor: jest.Mocked<IContentExtractor>;
  let mockPuppeteerExtractor: jest.Mocked<IContentExtractor>;
  let mockPageDetector: jest.Mocked<IPageDetector>;
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Create mock extractors
    mockCheerioExtractor = {
      extract: jest.fn(),
      supportsPageType: jest.fn().mockImplementation((pageType) => pageType === PageType.STATIC),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };
    
    mockPuppeteerExtractor = {
      extract: jest.fn(),
      supportsPageType: jest.fn().mockImplementation((pageType) => pageType === PageType.SPA),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };
    
    // Create mock page detector
    mockPageDetector = {
      detectPageType: jest.fn(),
      isSPA: jest.fn()
    };
  });
  
  describe('constructor', () => {
    it('should validate extractor capabilities', () => {
      // Setup incorrect support reporting
      mockCheerioExtractor.supportsPageType.mockReturnValue(false);
      
      // Console warn spy
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Create factory - should log warning
      new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor
      );
      
      // Expect warning to have been logged
      expect(mockCheerioExtractor.supportsPageType).toHaveBeenCalledWith(PageType.STATIC);
      expect(mockPuppeteerExtractor.supportsPageType).toHaveBeenCalledWith(PageType.SPA);
      
      // Restore console
      consoleSpy.mockRestore();
    });
  });
  
  describe('getExtractorForUrl', () => {
    it('should return cheerio extractor for static pages', async () => {
      // Create mock result
      const mockResult: PageTypeResult = {
        isSPA: false,
        confidence: 0.9,
        pageType: PageType.STATIC,
        detectionMethod: 'static'
      };
      
      // Configure mock
      mockPageDetector.detectPageType.mockResolvedValue(mockResult);
      
      // Create factory
      const factory = new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor
      );
      
      // Get extractor
      const extractor = await factory.getExtractorForUrl('https://example.com');
      
      // Verify expectations
      expect(mockPageDetector.detectPageType).toHaveBeenCalledWith('https://example.com', undefined);
      expect(extractor).toBe(mockCheerioExtractor);
    });
    
    it('should return puppeteer extractor for SPAs', async () => {
      // Create mock result
      const mockResult: PageTypeResult = {
        isSPA: true,
        confidence: 0.9,
        pageType: PageType.SPA,
        detectionMethod: 'static'
      };
      
      // Configure mock
      mockPageDetector.detectPageType.mockResolvedValue(mockResult);
      
      // Create factory
      const factory = new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor
      );
      
      // Get extractor
      const extractor = await factory.getExtractorForUrl('https://reactjs.org');
      
      // Verify expectations
      expect(mockPageDetector.detectPageType).toHaveBeenCalledWith('https://reactjs.org', undefined);
      expect(extractor).toBe(mockPuppeteerExtractor);
    });
    
    it('should respect forced cheerio strategy', async () => {
      // Create factory with forced cheerio
      const factory = new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor,
        { forceStrategy: 'cheerio' }
      );
      
      // Get extractor
      const extractor = await factory.getExtractorForUrl('https://example.com');
      
      // Verify expectations
      expect(mockPageDetector.detectPageType).not.toHaveBeenCalled();
      expect(extractor).toBe(mockCheerioExtractor);
    });
    
    it('should respect forced puppeteer strategy', async () => {
      // Create factory with forced puppeteer
      const factory = new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor,
        { forceStrategy: 'puppeteer' }
      );
      
      // Get extractor
      const extractor = await factory.getExtractorForUrl('https://example.com');
      
      // Verify expectations
      expect(mockPageDetector.detectPageType).not.toHaveBeenCalled();
      expect(extractor).toBe(mockPuppeteerExtractor);
    });
    
    it('should default to cheerio on detection failure', async () => {
      // Configure mock to throw error
      mockPageDetector.detectPageType.mockRejectedValue(new Error('Detection failed'));
      
      // Create factory
      const factory = new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor
      );
      
      // Get extractor
      const extractor = await factory.getExtractorForUrl('https://example.com');
      
      // Verify expectations
      expect(mockPageDetector.detectPageType).toHaveBeenCalledWith('https://example.com', undefined);
      expect(extractor).toBe(mockCheerioExtractor);
    });
    
    it('should use provided HTML content when available', async () => {
      // Create mock result
      const mockResult: PageTypeResult = {
        isSPA: false,
        confidence: 0.9,
        pageType: PageType.STATIC,
        detectionMethod: 'static'
      };
      
      // Configure mock
      mockPageDetector.detectPageType.mockResolvedValue(mockResult);
      
      // Create factory
      const factory = new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor
      );
      
      // HTML content
      const htmlContent = '<html><body>Test</body></html>';
      
      // Get extractor
      await factory.getExtractorForUrl('https://example.com', htmlContent);
      
      // Verify expectations
      expect(mockPageDetector.detectPageType).toHaveBeenCalledWith('https://example.com', htmlContent);
    });
  });
  
  describe('getExtractorByPageType', () => {
    it('should return cheerio extractor for static page type', () => {
      // Create factory
      const factory = new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor
      );
      
      // Get extractor
      const extractor = factory.getExtractorByPageType(PageType.STATIC);
      
      // Verify expectations
      expect(extractor).toBe(mockCheerioExtractor);
    });
    
    it('should return puppeteer extractor for SPA page type', () => {
      // Create factory
      const factory = new CrawlingStrategyFactory(
        mockPageDetector,
        mockCheerioExtractor,
        mockPuppeteerExtractor
      );
      
      // Get extractor
      const extractor = factory.getExtractorByPageType(PageType.SPA);
      
      // Verify expectations
      expect(extractor).toBe(mockPuppeteerExtractor);
    });
  });
}); 
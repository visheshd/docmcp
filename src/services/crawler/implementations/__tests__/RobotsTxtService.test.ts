import { RobotsTxtService } from '../RobotsTxtService';
import axios from 'axios';
import { DelayUtils } from '../../utils/DelayUtils';

// Mock axios and DelayUtils
jest.mock('axios');
jest.mock('../../utils/DelayUtils', () => ({
  withRetry: jest.fn((fn) => fn())
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RobotsTxtService', () => {
  let robotsTxtService: RobotsTxtService;
  const userAgent = 'DocMCPBot';
  
  beforeEach(() => {
    robotsTxtService = new RobotsTxtService();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    robotsTxtService.reset();
  });
  
  describe('loadRobotsTxt', () => {
    it('should load and parse robots.txt file', async () => {
      const robotsTxt = `
        User-agent: DocMCPBot
        Disallow: /private/
        Allow: /public/
        
        User-agent: *
        Disallow: /admin/
        
        Sitemap: https://example.com/sitemap.xml
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // Verify axios was called correctly
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://example.com/robots.txt',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': userAgent
          })
        })
      );
      
      // Test the isAllowed method after loading
      expect(robotsTxtService.isAllowed('https://example.com/public/page')).toBe(true);
      expect(robotsTxtService.isAllowed('https://example.com/private/page')).toBe(false);
      
      // Other user-agent rules should not apply
      expect(robotsTxtService.isAllowed('https://example.com/admin/page')).toBe(true);
    });
    
    it('should handle crawl-delay directive', async () => {
      const robotsTxt = `
        User-agent: DocMCPBot
        Disallow: /private/
        Crawl-delay: 3
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // 3 seconds = 3000 milliseconds
      expect(robotsTxtService.getCrawlDelay()).toBe(3000);
    });
    
    it('should handle wildcard (*) crawl-delay when no specific one is found', async () => {
      const robotsTxt = `
        User-agent: *
        Disallow: /private/
        Crawl-delay: 2
        
        User-agent: Googlebot
        Disallow: /admin/
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // 2 seconds = 2000 milliseconds
      expect(robotsTxtService.getCrawlDelay()).toBe(2000);
    });
    
    it('should use specific user agent rules over wildcard', async () => {
      const robotsTxt = `
        User-agent: *
        Disallow: /all-private/
        
        User-agent: DocMCPBot
        Disallow: /bot-private/
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // Bot-specific rules should apply
      expect(robotsTxtService.isAllowed('https://example.com/bot-private/page')).toBe(false);
      expect(robotsTxtService.isAllowed('https://example.com/all-private/page')).toBe(true);
    });
    
    it('should allow all URLs if robots.txt cannot be loaded', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // Should allow all URLs when robots.txt can't be loaded
      expect(robotsTxtService.isAllowed('https://example.com/any/page')).toBe(true);
      expect(robotsTxtService.getCrawlDelay()).toBeNull();
    });
    
    it('should allow all URLs if robots.txt returns non-200 status', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 404,
        data: 'Not found'
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // Should allow all URLs when robots.txt returns non-200
      expect(robotsTxtService.isAllowed('https://example.com/any/page')).toBe(true);
    });
  });
  
  describe('isAllowed', () => {
    it('should allow all URLs if robots.txt is not loaded', () => {
      // Without loading robots.txt
      expect(robotsTxtService.isAllowed('https://example.com/any/page')).toBe(true);
    });
    
    it('should cache results for performance', async () => {
      const robotsTxt = `
        User-agent: DocMCPBot
        Disallow: /private/
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // First check
      expect(robotsTxtService.isAllowed('https://example.com/private/page')).toBe(false);
      
      // Modify the internal state of the parser (this is a bit of a hack for testing)
      // @ts-ignore: Accessing private property for test
      robotsTxtService.robotsTxt = null;
      
      // Second check should use cached result and still return false
      expect(robotsTxtService.isAllowed('https://example.com/private/page')).toBe(false);
    });
    
    it('should normalize URLs before checking if allowed', async () => {
      const robotsTxt = `
        User-agent: DocMCPBot
        Disallow: /private/
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // Check with trailing slash variation
      expect(robotsTxtService.isAllowed('https://example.com/private')).toBe(false);
      expect(robotsTxtService.isAllowed('https://example.com/private/')).toBe(false);
    });
  });
  
  describe('getSitemapUrls', () => {
    it('should return sitemap URLs if present in robots.txt', async () => {
      const robotsTxt = `
        User-agent: *
        Disallow: /private/
        
        Sitemap: https://example.com/sitemap.xml
        Sitemap: https://example.com/sitemap2.xml
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      const sitemaps = robotsTxtService.getSitemapUrls();
      expect(sitemaps).toContain('https://example.com/sitemap.xml');
      expect(sitemaps).toContain('https://example.com/sitemap2.xml');
      expect(sitemaps.length).toBe(2);
    });
    
    it('should return empty array if no sitemaps in robots.txt', async () => {
      const robotsTxt = `
        User-agent: *
        Disallow: /private/
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      const sitemaps = robotsTxtService.getSitemapUrls();
      expect(sitemaps).toEqual([]);
    });
    
    it('should return empty array if robots.txt is not loaded', () => {
      const sitemaps = robotsTxtService.getSitemapUrls();
      expect(sitemaps).toEqual([]);
    });
  });
  
  describe('reset', () => {
    it('should reset the service state', async () => {
      const robotsTxt = `
        User-agent: DocMCPBot
        Disallow: /private/
        Crawl-delay: 5
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: robotsTxt
      });
      
      await robotsTxtService.loadRobotsTxt('https://example.com', userAgent);
      
      // Verify state before reset
      expect(robotsTxtService.isAllowed('https://example.com/private/page')).toBe(false);
      expect(robotsTxtService.getCrawlDelay()).toBe(5000);
      
      // Reset the service
      robotsTxtService.reset();
      
      // Verify state after reset
      expect(robotsTxtService.isAllowed('https://example.com/private/page')).toBe(true);
      expect(robotsTxtService.getCrawlDelay()).toBeNull();
    });
  });
}); 
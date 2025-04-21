import { CheerioExtractor } from '../CheerioExtractor';
import axios from 'axios';
import { PageType } from '../../interfaces/types';

// Mock axios to avoid making actual HTTP requests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CheerioExtractor', () => {
  let extractor: CheerioExtractor;
  
  beforeEach(() => {
    extractor = new CheerioExtractor();
    jest.clearAllMocks();
  });
  
  describe('extract', () => {
    it('should extract content from a URL', async () => {
      // Mock HTTP response
      const mockHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="description" content="Test description">
          <meta name="keywords" content="test, keywords">
          <title>Test Page</title>
          <link rel="canonical" href="https://example.com/canonical">
          <meta name="author" content="Test Author">
        </head>
        <body>
          <h1>Test Header</h1>
          <p>This is a test paragraph.</p>
          <a href="https://example.com/page1">Link 1</a>
          <a href="https://example.com/page2">Link 2</a>
        </body>
        </html>
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockHtml
      });
      
      const result = await extractor.extract('https://example.com', { extractLinks: true });
      
      // Verify basic extraction
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Test Page');
      expect(result.content).toBe(mockHtml);
      
      // Verify metadata extraction
      expect(result.metadata).toHaveProperty('description', 'Test description');
      expect(result.metadata).toHaveProperty('author', 'Test Author');
      expect(result.metadata.keywords).toContain('test');
      expect(result.metadata.keywords).toContain('keywords');
      expect(result.metadata).toHaveProperty('canonicalUrl');
      expect(result.metadata).toHaveProperty('domain', 'example.com');
      
      // Verify link extraction
      expect(result.links).toContain('https://example.com/page1');
      expect(result.links).toContain('https://example.com/page2');
    });
    
    it('should handle HTTP error responses', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('HTTP Error'));
      
      await expect(extractor.extract('https://example.com')).rejects.toThrow('HTTP Error');
    });
    
    it('should handle non-200 status codes', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 404,
        data: '404 Not Found'
      });
      
      await expect(extractor.extract('https://example.com')).rejects.toThrow('Failed to fetch page content: HTTP 404');
    });
  });
  
  describe('supportsPageType', () => {
    it('should support static pages', () => {
      expect(extractor.supportsPageType(PageType.STATIC)).toBe(true);
    });
    
    it('should not support SPAs', () => {
      expect(extractor.supportsPageType(PageType.SPA)).toBe(false);
    });
  });
  
  describe('cleanup', () => {
    it('should resolve successfully', async () => {
      await expect(extractor.cleanup()).resolves.toBeUndefined();
    });
  });
  
  describe('private methods', () => {
    it('should extract text content correctly', async () => {
      const mockHtml = `
        <html>
        <body>
          <h1>Test Header</h1>
          <p>This is a test paragraph.</p>
          <script>const x = 1;</script>
          <style>.hidden { display: none; }</style>
        </body>
        </html>
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockHtml
      });
      
      const result = await extractor.extract('https://example.com');
      
      // Verify text extraction excludes script and style content
      expect(result.text).toContain('Test Header');
      expect(result.text).toContain('This is a test paragraph');
      expect(result.text).not.toContain('const x = 1');
      expect(result.text).not.toContain('.hidden');
    });
    
    it('should extract Open Graph metadata', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Description">
          <meta property="og:image" content="https://example.com/image.jpg">
        </head>
        <body>
          <h1>Test Header</h1>
        </body>
        </html>
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockHtml
      });
      
      const result = await extractor.extract('https://example.com');
      
      // Verify Open Graph metadata extraction
      expect(result.metadata).toHaveProperty('og_title', 'OG Title');
      expect(result.metadata).toHaveProperty('og_description', 'OG Description');
      expect(result.metadata).toHaveProperty('og_image', 'https://example.com/image.jpg');
    });
    
    it('should extract links properly', async () => {
      const mockHtml = `
        <html>
        <body>
          <a href="https://example.com/page1">Link 1</a>
          <a href="/relative-path">Relative Link</a>
          <a href="javascript:void(0)">JavaScript Link</a>
          <a href="file.jpg">Image Link</a>
          <a href="file.pdf">PDF Link</a>
        </body>
        </html>
      `;
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockHtml
      });
      
      const result = await extractor.extract('https://example.com', { extractLinks: true });
      
      // Verify link extraction filters out non-HTML content
      expect(result.links).toContain('https://example.com/page1');
      expect(result.links).toContain('https://example.com/relative-path');
      expect(result.links).not.toContain('javascript:void(0)');
      expect(result.links).not.toContain('https://example.com/file.jpg');
      expect(result.links).not.toContain('https://example.com/file.pdf');
    });
  });
}); 
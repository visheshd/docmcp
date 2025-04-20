import { SPADetector } from '../SPADetector';
import { PageType } from '../../interfaces/types';
import fetchMock from 'jest-fetch-mock';

// Enable fetch mocks
fetchMock.enableMocks();

describe('SPADetector', () => {
  beforeEach(() => {
    // Reset fetch mocks before each test
    fetchMock.resetMocks();
  });

  describe('detectPageType', () => {
    it('should detect static pages correctly', async () => {
      // Mock HTML for a static page
      const staticHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Static Test Page</title>
          </head>
          <body>
            <h1>Static Page</h1>
            <p>This is a static page with no SPA framework signatures</p>
          </body>
        </html>
      `;
      
      // Configure fetch mock
      fetchMock.mockResponseOnce(staticHtml);
      
      // Create detector
      const detector = new SPADetector();
      
      // Detect page type
      const result = await detector.detectPageType('https://example.com');
      
      // Verify expectations
      expect(result.isSPA).toBe(false);
      expect(result.pageType).toBe(PageType.STATIC);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.detectionMethod).toBe('static');
    });
    
    it('should detect React SPAs correctly', async () => {
      // Mock HTML for a React SPA
      const reactHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>React App</title>
            <script src="https://unpkg.com/react@17/umd/react.production.min.js"></script>
            <script src="https://unpkg.com/react-dom@17/umd/react-dom.production.min.js"></script>
          </head>
          <body>
            <div id="root"></div>
            <script>
              ReactDOM.render(React.createElement('h1', null, 'Hello React'), document.getElementById('root'));
            </script>
          </body>
        </html>
      `;
      
      // Configure fetch mock
      fetchMock.mockResponseOnce(reactHtml);
      
      // Create detector
      const detector = new SPADetector();
      
      // Detect page type
      const result = await detector.detectPageType('https://reactapp.example.com');
      
      // Verify expectations
      expect(result.isSPA).toBe(true);
      expect(result.pageType).toBe(PageType.SPA);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.detectionMethod).toBe('static');
    });
    
    it('should detect Angular SPAs correctly', async () => {
      // Mock HTML for an Angular SPA
      const angularHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Angular App</title>
          </head>
          <body>
            <app-root _nghost-abc-123=""></app-root>
            <script src="runtime.js"></script>
            <script src="polyfills.js"></script>
            <script src="main.js"></script>
          </body>
        </html>
      `;
      
      // Configure fetch mock
      fetchMock.mockResponseOnce(angularHtml);
      
      // Create detector
      const detector = new SPADetector();
      
      // Detect page type
      const result = await detector.detectPageType('https://angularapp.example.com');
      
      // Verify expectations
      expect(result.isSPA).toBe(true);
      expect(result.pageType).toBe(PageType.SPA);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.detectionMethod).toBe('static');
    });
    
    it('should detect Vue.js SPAs correctly', async () => {
      // Mock HTML for a Vue.js SPA
      const vueHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Vue App</title>
            <script src="https://unpkg.com/vue@3"></script>
          </head>
          <body>
            <div id="app"></div>
            <script>
              Vue.createApp({
                template: '<h1>Hello Vue</h1>'
              }).mount('#app');
            </script>
          </body>
        </html>
      `;
      
      // Configure fetch mock
      fetchMock.mockResponseOnce(vueHtml);
      
      // Create detector
      const detector = new SPADetector();
      
      // Detect page type
      const result = await detector.detectPageType('https://vueapp.example.com');
      
      // Verify expectations
      expect(result.isSPA).toBe(true);
      expect(result.pageType).toBe(PageType.SPA);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.detectionMethod).toBe('static');
    });
    
    it('should use provided HTML content if available', async () => {
      // Create detector
      const detector = new SPADetector();
      
      // HTML content with React
      const reactHtml = `<html><head><script src="react.js"></script></head><body><div id="root"></div></body></html>`;
      
      // Detect page type with provided HTML
      const result = await detector.detectPageType('https://example.com', reactHtml);
      
      // Verify expectations
      expect(fetchMock).not.toHaveBeenCalled(); // Should not fetch
      expect(result.isSPA).toBe(true);
      expect(result.pageType).toBe(PageType.SPA);
      expect(result.detectionMethod).toBe('static');
    });
    
    it('should handle fetch errors gracefully', async () => {
      // Configure fetch mock to throw error
      fetchMock.mockReject(new Error('Network error'));
      
      // Create detector
      const detector = new SPADetector();
      
      // Expect the detection to reject with the error
      await expect(detector.detectPageType('https://example.com')).rejects.toThrow('Network error');
    });
    
    it('should use cache for repeated detection calls', async () => {
      // Mock HTML for a React SPA
      const reactHtml = `<html><head><script src="react.js"></script></head><body><div id="root"></div></body></html>`;
      
      // Configure fetch mock
      fetchMock.mockResponseOnce(reactHtml);
      
      // Create detector with cache enabled
      const detector = new SPADetector({ cacheResults: true });
      
      // First detection call
      const result1 = await detector.detectPageType('https://example.com');
      
      // Second detection call to the same URL
      const result2 = await detector.detectPageType('https://example.com');
      
      // Verify expectations
      expect(fetchMock).toHaveBeenCalledTimes(1); // Only one fetch call
      expect(result1).toEqual(result2); // Results should be identical
    });
  });
  
  describe('isSPA', () => {
    it('should correctly identify SPA URLs', async () => {
      // Mock HTML for a React SPA
      const reactHtml = `<html><head><script src="react.js"></script></head><body><div id="root"></div></body></html>`;
      
      // Configure fetch mock
      fetchMock.mockResponseOnce(reactHtml);
      
      // Create detector
      const detector = new SPADetector();
      
      // Check if URL is SPA
      const result = await detector.isSPA('https://example.com');
      
      // Verify expectations
      expect(result).toBe(true);
    });
    
    it('should correctly identify non-SPA URLs', async () => {
      // Mock HTML for a static page
      const staticHtml = `<html><head><title>Static Page</title></head><body><h1>Hello</h1></body></html>`;
      
      // Configure fetch mock
      fetchMock.mockResponseOnce(staticHtml);
      
      // Create detector
      const detector = new SPADetector();
      
      // Check if URL is SPA
      const result = await detector.isSPA('https://example.com');
      
      // Verify expectations
      expect(result).toBe(false);
    });
  });
}); 
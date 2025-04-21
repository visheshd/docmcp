import { SPADetector } from '../SPADetector';
import { PageType } from '../../interfaces/types';
import fetchMock from 'jest-fetch-mock';

// Enable fetch mocks
fetchMock.enableMocks();

describe('SPADetector - Simple Tests', () => {
  beforeEach(() => {
    // Reset fetch mocks before each test
    fetchMock.resetMocks();
  });

  describe('detectPageType', () => {
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
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.detectionMethod).toBe('static');
    });
    
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
  });
}); 
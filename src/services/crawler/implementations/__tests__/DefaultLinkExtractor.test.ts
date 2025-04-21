import { DefaultLinkExtractor } from '../DefaultLinkExtractor';

describe('DefaultLinkExtractor', () => {
  let extractor: DefaultLinkExtractor;
  
  beforeEach(() => {
    extractor = new DefaultLinkExtractor();
  });
  
  describe('extractLinks', () => {
    it('should extract links from HTML content', async () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/page1">Page 1</a>
            <a href="/page2">Page 2</a>
            <a href="page3">Page 3</a>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page1');
      expect(links).toContain('https://example.com/page2');
      expect(links).toContain('https://example.com/page3');
      expect(links.length).toBe(3);
    });
    
    it('should resolve relative links correctly', async () => {
      const html = `
        <html>
          <body>
            <a href="../parent">Parent</a>
            <a href="./child">Child</a>
            <a href="/root">Root</a>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com/section/page';
      
      const links = await extractor.extractLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/section/parent');
      expect(links).toContain('https://example.com/section/child');
      expect(links).toContain('https://example.com/root');
      expect(links.length).toBe(3);
    });
    
    it('should filter out links from different domains', async () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/page1">Same domain</a>
            <a href="https://different.com/page">Different domain</a>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page1');
      expect(links).not.toContain('https://different.com/page');
      expect(links.length).toBe(1);
    });
    
    it('should filter out javascript, mailto and anchor links', async () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/page1">Valid link</a>
            <a href="javascript:void(0)">JavaScript link</a>
            <a href="mailto:test@example.com">Email link</a>
            <a href="#section">Anchor link</a>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page1');
      expect(links).not.toContain('javascript:void(0)');
      expect(links).not.toContain('mailto:test@example.com');
      expect(links).not.toContain('#section');
      expect(links.length).toBe(1);
    });
    
    it('should return empty array for invalid HTML', async () => {
      const html = '<html><unclosed>';
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractLinks(html, baseUrl, currentUrl);
      
      expect(links).toEqual([]);
    });
    
    it('should return empty array when no links are found', async () => {
      const html = '<html><body><p>No links here</p></body></html>';
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractLinks(html, baseUrl, currentUrl);
      
      expect(links).toEqual([]);
    });
    
    it('should return unique links only', async () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/page">Link 1</a>
            <a href="https://example.com/page">Duplicate</a>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page');
      expect(links.length).toBe(1);
    });
  });
  
  describe('extractPaginationLinks', () => {
    it('should extract pagination links using standard pagination selectors', async () => {
      const html = `
        <html>
          <body>
            <nav class="pagination">
              <a href="/page/1">1</a>
              <a href="/page/2">2</a>
              <a href="/page/3">3</a>
            </nav>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractPaginationLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page/1');
      expect(links).toContain('https://example.com/page/2');
      expect(links).toContain('https://example.com/page/3');
      expect(links.length).toBe(3);
    });
    
    it('should extract pagination links using alternative selectors', async () => {
      const html = `
        <html>
          <body>
            <div class="page-numbers">
              <a href="/page/1">1</a>
              <a href="/page/2">2</a>
            </div>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractPaginationLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page/1');
      expect(links).toContain('https://example.com/page/2');
      expect(links.length).toBe(2);
    });
    
    it('should filter out pagination links from different domains', async () => {
      const html = `
        <html>
          <body>
            <nav class="pagination">
              <a href="https://example.com/page/1">1</a>
              <a href="https://different.com/page/2">2</a>
            </nav>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractPaginationLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page/1');
      expect(links).not.toContain('https://different.com/page/2');
      expect(links.length).toBe(1);
    });
    
    it('should filter out javascript, mailto and anchor pagination links', async () => {
      const html = `
        <html>
          <body>
            <nav class="pagination">
              <a href="https://example.com/page/1">1</a>
              <a href="javascript:void(0)">2</a>
              <a href="mailto:test@example.com">3</a>
              <a href="#">4</a>
            </nav>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractPaginationLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page/1');
      expect(links.length).toBe(1);
    });
    
    it('should return empty array when no pagination links are found', async () => {
      const html = `
        <html>
          <body>
            <p>No pagination here</p>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractPaginationLinks(html, baseUrl, currentUrl);
      
      expect(links).toEqual([]);
    });
    
    it('should handle data-page attributes in pagination', async () => {
      const html = `
        <html>
          <body>
            <div class="pagination">
              <a href="/page/1" data-page="1">1</a>
              <a href="/page/2" data-page="2">2</a>
            </div>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractPaginationLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page/1');
      expect(links).toContain('https://example.com/page/2');
      expect(links.length).toBe(2);
    });
    
    it('should handle aria-labeled pagination links', async () => {
      const html = `
        <html>
          <body>
            <div class="pagination">
              <a href="/page/1" aria-label="Page 1">1</a>
              <a href="/page/2" aria-label="Page 2">2</a>
            </div>
          </body>
        </html>
      `;
      
      const baseUrl = 'https://example.com';
      const currentUrl = 'https://example.com';
      
      const links = await extractor.extractPaginationLinks(html, baseUrl, currentUrl);
      
      expect(links).toContain('https://example.com/page/1');
      expect(links).toContain('https://example.com/page/2');
      expect(links.length).toBe(2);
    });
  });
}); 
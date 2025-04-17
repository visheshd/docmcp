import { CrawlerService } from '../../services/crawler.service';
import { getTestPrismaClient } from '../utils/testDb';
import nock from 'nock';

describe('CrawlerService Integration Tests', () => {
  let crawlerService: CrawlerService;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    crawlerService = new CrawlerService();
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await prisma.chunk.deleteMany();
    await prisma.document.deleteMany();

    // Reset nock
    nock.cleanAll();
  });

  describe('crawl', () => {
    it('should crawl a simple documentation site', async () => {
      const baseUrl = 'https://test.com';
      const testHtml = `
        <html>
          <head>
            <title>Test Documentation</title>
            <meta name="package" content="test-package" />
            <meta name="version" content="1.0.0" />
          </head>
          <body>
            <main>
              <h1>Welcome to Test Docs</h1>
              <p>This is a test documentation page.</p>
              <a href="/docs/page1">Page 1</a>
              <a href="/docs/page2">Page 2</a>
            </main>
          </body>
        </html>
      `;

      const page1Html = `
        <html>
          <head>
            <title>Page 1 - Test Documentation</title>
          </head>
          <body>
            <main>
              <h1>Page 1</h1>
              <p>This is page 1 content.</p>
            </main>
          </body>
        </html>
      `;

      const page2Html = `
        <html>
          <head>
            <title>Page 2 - Test Documentation</title>
          </head>
          <body>
            <main>
              <h1>Page 2</h1>
              <p>This is page 2 content.</p>
            </main>
          </body>
        </html>
      `;

      // Mock HTTP requests
      nock(baseUrl)
        .get('/')
        .reply(200, testHtml)
        .get('/docs/page1')
        .reply(200, page1Html)
        .get('/docs/page2')
        .reply(200, page2Html);

      // Start crawling
      await crawlerService.crawl(baseUrl);

      // Verify documents were created
      const documents = await prisma.document.findMany({
        orderBy: { url: 'asc' },
      });

      expect(documents).toHaveLength(3);

      // Check main page
      const mainDoc = documents.find(d => d.url === baseUrl);
      expect(mainDoc).toBeDefined();
      expect(mainDoc?.title).toBe('Test Documentation');
      expect(mainDoc?.metadata).toEqual({
        package: 'test-package',
        version: '1.0.0',
        type: 'documentation',
        tags: ['auto-generated'],
      });

      // Check child pages
      const page1Doc = documents.find(d => d.url === `${baseUrl}/docs/page1`);
      expect(page1Doc).toBeDefined();
      expect(page1Doc?.title).toBe('Page 1 - Test Documentation');

      const page2Doc = documents.find(d => d.url === `${baseUrl}/docs/page2`);
      expect(page2Doc).toBeDefined();
      expect(page2Doc?.title).toBe('Page 2 - Test Documentation');

      // Verify job was created and completed
      const jobs = await prisma.job.findMany();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('completed');
      expect(jobs[0].progress).toBe(1);
      expect(jobs[0].error).toBeNull();
    });

    it('should respect maxDepth option', async () => {
      const baseUrl = 'https://test.com';
      const testHtml = `
        <html>
          <head><title>Test</title></head>
          <body>
            <a href="/page1">Page 1</a>
          </body>
        </html>
      `;

      const page1Html = `
        <html>
          <head><title>Page 1</title></head>
          <body>
            <a href="/page2">Page 2</a>
          </body>
        </html>
      `;

      const page2Html = `
        <html>
          <head><title>Page 2</title></head>
          <body>
            <a href="/page3">Page 3</a>
          </body>
        </html>
      `;

      // Mock HTTP requests
      nock(baseUrl)
        .get('/')
        .reply(200, testHtml)
        .get('/page1')
        .reply(200, page1Html)
        .get('/page2')
        .reply(200, page2Html);

      // Start crawling with maxDepth = 1
      await crawlerService.crawl(baseUrl, { maxDepth: 1 });

      // Should only have crawled the main page and page1
      const documents = await prisma.document.findMany();
      expect(documents).toHaveLength(2);
      expect(documents.map(d => d.url).sort()).toEqual([
        baseUrl,
        `${baseUrl}/page1`,
      ]);
    });

    it('should handle errors gracefully', async () => {
      const baseUrl = 'https://test.com';
      const testHtml = `
        <html>
          <head><title>Test</title></head>
          <body>
            <a href="/good-page">Good Page</a>
            <a href="/error-page">Error Page</a>
          </body>
        </html>
      `;

      const goodPageHtml = `
        <html>
          <head><title>Good Page</title></head>
          <body><p>This page works</p></body>
        </html>
      `;

      // Mock HTTP requests
      nock(baseUrl)
        .get('/')
        .reply(200, testHtml)
        .get('/good-page')
        .reply(200, goodPageHtml)
        .get('/error-page')
        .reply(500, 'Internal Server Error');

      // Start crawling - expect it to throw due to the 500 error
      try {
        await crawlerService.crawl(baseUrl);
      } catch (error) {
        // Expecting an error from the 500 response, so we catch it here
        // and allow the test to continue to check the final DB state.
        expect(error).toBeDefined(); 
      }

      // Should have crawled the main page and good page
      const documents = await prisma.document.findMany();
      expect(documents).toHaveLength(2);
      expect(documents.map(d => d.url).sort()).toEqual([
        baseUrl,
        `${baseUrl}/good-page`,
      ]);

      // Add a small delay to allow async operations/finally block to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Job should be completed but have an error logged
      const job = await prisma.job.findFirst({
        where: { url: baseUrl },
      });
      expect(job).toBeDefined();
      expect(job?.status).toBe('completed');
      expect(job?.error).toContain('Error crawling');
    });

    it('should respect robots.txt rules', async () => {
      const baseUrl = 'https://test.com';
      const robotsTxt = `
        User-agent: DocMCPBot
        Disallow: /private/
        
        User-agent: *
        Allow: /
      `;
      
      const testHtml = `
        <html>
          <head><title>Test</title></head>
          <body>
            <a href="/public">Public Page</a>
            <a href="/private/secret">Private Page</a>
          </body>
        </html>
      `;

      const publicPageHtml = `
        <html>
          <head><title>Public Page</title></head>
          <body><p>This is a public page</p></body>
        </html>
      `;

      const privatePageHtml = `
        <html>
          <head><title>Private Page</title></head>
          <body><p>This is a private page</p></body>
        </html>
      `;

      // Mock HTTP requests including robots.txt
      nock(baseUrl)
        .get('/robots.txt')
        .reply(200, robotsTxt)
        .get('/')
        .reply(200, testHtml)
        .get('/public')
        .reply(200, publicPageHtml)
        .get('/private/secret')
        .reply(200, privatePageHtml);

      // Start crawling with robots.txt respect enabled
      await crawlerService.crawl(baseUrl, { respectRobotsTxt: true });

      // Should only have crawled the main page and public page
      const documents = await prisma.document.findMany();
      expect(documents).toHaveLength(2);
      expect(documents.map(d => d.url).sort()).toEqual([
        baseUrl,
        `${baseUrl}/public`,
      ]);
      
      // Verify the private page was not crawled
      const privateDoc = await prisma.document.findFirst({
        where: { url: `${baseUrl}/private/secret` },
      });
      expect(privateDoc).toBeNull();
    });

    it('should detect and follow pagination links', async () => {
      const baseUrl = 'https://test.com';
      
      const page1Html = `
        <html>
          <head><title>Page 1</title></head>
          <body>
            <main>
              <h1>Documentation - Page 1</h1>
              <p>First page content.</p>
              <nav class="pagination">
                <a href="/page1" class="current">1</a>
                <a href="/page2">2</a>
                <a href="/page3">3</a>
              </nav>
            </main>
          </body>
        </html>
      `;

      const page2Html = `
        <html>
          <head><title>Page 2</title></head>
          <body>
            <main>
              <h1>Documentation - Page 2</h1>
              <p>Second page content.</p>
              <nav class="pagination">
                <a href="/page1">1</a>
                <a href="/page2" class="current">2</a>
                <a href="/page3">3</a>
              </nav>
            </main>
          </body>
        </html>
      `;

      const page3Html = `
        <html>
          <head><title>Page 3</title></head>
          <body>
            <main>
              <h1>Documentation - Page 3</h1>
              <p>Third page content.</p>
              <nav class="pagination">
                <a href="/page1">1</a>
                <a href="/page2">2</a>
                <a href="/page3" class="current">3</a>
              </nav>
            </main>
          </body>
        </html>
      `;

      // Mock HTTP requests
      nock(baseUrl)
        .get('/')
        .reply(200, page1Html)
        .get('/page1')
        .reply(200, page1Html)
        .get('/page2')
        .reply(200, page2Html)
        .get('/page3')
        .reply(200, page3Html);

      // Start crawling
      await crawlerService.crawl(baseUrl);

      // Should have crawled all three pages
      const documents = await prisma.document.findMany();
      expect(documents).toHaveLength(4); // Base URL + 3 pages
      
      // All pagination pages should be detected and crawled
      const urls = documents.map(d => d.url).sort();
      expect(urls).toContain(`${baseUrl}/page1`);
      expect(urls).toContain(`${baseUrl}/page2`);
      expect(urls).toContain(`${baseUrl}/page3`);
    });
  });
}); 
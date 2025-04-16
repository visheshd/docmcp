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
    await prisma.job.deleteMany();

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

      // Start crawling
      await crawlerService.crawl(baseUrl);

      // Should have crawled the main page and good page
      const documents = await prisma.document.findMany();
      expect(documents).toHaveLength(2);
      expect(documents.map(d => d.url).sort()).toEqual([
        baseUrl,
        `${baseUrl}/good-page`,
      ]);

      // Job should be completed but have an error logged
      const job = await prisma.job.findFirst({
        where: { url: baseUrl },
      });
      expect(job).toBeDefined();
      expect(job?.status).toBe('completed');
      expect(job?.error).toContain('Error crawling');
    });
  });
}); 
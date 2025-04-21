import { CrawlerService } from '../../services/crawler.service';
import { getTestPrismaClient } from '../utils/testDb';
import { ErrorConditionMocks, ErrorType } from '../../services/crawler/test-utils/mocks/ErrorConditionMocks';
import { JobStatus } from '../../generated/prisma';

describe('CrawlerService Error Handling Tests', () => {
  let crawlerService: CrawlerService;
  const prisma = getTestPrismaClient();
  let errorMocks: ErrorConditionMocks;
  const baseUrl = 'https://error-test.example.com';

  beforeAll(async () => {
    crawlerService = new CrawlerService();
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await prisma.chunk.deleteMany();
    await prisma.document.deleteMany();
    await prisma.job.deleteMany();

    // Reset mock state
    if (errorMocks) {
      errorMocks.cleanup();
    }
  });

  afterEach(() => {
    if (errorMocks) {
      errorMocks.cleanup();
    }
  });

  describe('Error Handling', () => {
    it('should continue crawling after handling 404 errors', async () => {
      const jobId = 'test-404-error';

      // Create the job record
      await prisma.job.create({
        data: {
          id: jobId,
          url: baseUrl,
          startDate: new Date(),
        },
      });

      // Set up error condition mocks
      errorMocks = new ErrorConditionMocks({
        baseUrl,
        customErrorMessage: 'Test 404 Error',
      });
      
      // Add a custom home page that links to both good and error pages
      const scope = errorMocks['scope'];
      
      // Add a good home page
      scope.get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Error Test Home</title>
          </head>
          <body>
            <h1>Error Test Home</h1>
            <p>This page links to working pages and error pages.</p>
            <ul>
              <li><a href="/good-page">Good Page</a></li>
              <li><a href="/error-${ErrorType.NOT_FOUND}">404 Not Found Page</a></li>
            </ul>
          </body>
          </html>
        `);

      // Add a good page
      scope.get('/good-page')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Good Page</title>
          </head>
          <body>
            <h1>Good Page</h1>
            <p>This is a normal page that should be crawled successfully.</p>
          </body>
          </html>
        `);
      
      // Set up the mocks
      errorMocks.setup();

      // Start crawling
      await crawlerService.crawl(jobId, baseUrl, {
        maxDepth: 1
      });

      // Verify documents were created (home page + good page)
      const documents = await prisma.document.findMany({
        where: { jobId },
      });

      // Should have home page and good page, not the 404 page
      expect(documents.length).toBe(2);
      
      // Check documents
      const urls = documents.map(d => d.url).sort();
      expect(urls).toEqual([
        baseUrl, 
        `${baseUrl}/good-page`
      ]);

      // Verify job has an error but completed
      const finalJob = await prisma.job.findUnique({ where: { id: jobId } });
      expect(finalJob).toBeDefined();
      expect(finalJob?.status).toBe('completed' as JobStatus);
      expect(finalJob?.error).toContain('errors during crawling');
    });

    it('should handle server errors gracefully', async () => {
      const jobId = 'test-500-error';

      // Create the job record
      await prisma.job.create({
        data: {
          id: jobId,
          url: baseUrl,
          startDate: new Date(),
        },
      });

      // Set up error condition mocks
      errorMocks = new ErrorConditionMocks({
        baseUrl,
        customErrorMessage: 'Test 500 Error',
      });

      // Add a custom home page that links to both good and error pages
      const scope = errorMocks['scope'];
      
      // Add a good home page
      scope.get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Error Test Home</title>
          </head>
          <body>
            <h1>Error Test Home</h1>
            <p>This page links to working pages and error pages.</p>
            <ul>
              <li><a href="/good-page-1">Good Page 1</a></li>
              <li><a href="/good-page-2">Good Page 2</a></li>
              <li><a href="/error-${ErrorType.SERVER_ERROR}">500 Server Error</a></li>
            </ul>
          </body>
          </html>
        `);

      // Add good pages
      scope.get('/good-page-1')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Good Page 1</title>
          </head>
          <body>
            <h1>Good Page 1</h1>
            <p>This is a normal page that should be crawled successfully.</p>
          </body>
          </html>
        `);
        
      scope.get('/good-page-2')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Good Page 2</title>
          </head>
          <body>
            <h1>Good Page 2</h1>
            <p>This is another normal page that should be crawled successfully.</p>
          </body>
          </html>
        `);
      
      // Set up the mocks
      errorMocks.setup();

      // Start crawling
      await crawlerService.crawl(jobId, baseUrl, {
        maxDepth: 1
      });

      // Verify only good pages were crawled
      const documents = await prisma.document.findMany({
        where: { jobId },
      });

      // Should have home page and good pages, not the 500 error page
      expect(documents.length).toBe(3);

      // Check documents
      const urls = documents.map(d => d.url).sort();
      expect(urls).toEqual([
        baseUrl,
        `${baseUrl}/good-page-1`,
        `${baseUrl}/good-page-2`
      ]);

      // Verify job has an error but completed
      const finalJob = await prisma.job.findUnique({ where: { id: jobId } });
      expect(finalJob).toBeDefined();
      expect(finalJob?.status).toBe('completed' as JobStatus);
      expect(finalJob?.error).toContain('errors during crawling');
    });

    it('should handle network errors and continue crawling', async () => {
      const jobId = 'test-network-error';

      // Create the job record
      await prisma.job.create({
        data: {
          id: jobId,
          url: baseUrl,
          startDate: new Date(),
        },
      });

      // Set up error condition mocks
      errorMocks = new ErrorConditionMocks({
        baseUrl,
      });

      // Add a custom home page that links to both good and error pages
      const scope = errorMocks['scope'];
      
      // Add a good home page
      scope.get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Error Test Home</title>
          </head>
          <body>
            <h1>Error Test Home</h1>
            <p>This page links to working pages and error pages.</p>
            <ul>
              <li><a href="/good-page">Good Page</a></li>
              <li><a href="/error-${ErrorType.NETWORK_ERROR}">Network Error</a></li>
            </ul>
          </body>
          </html>
        `);

      // Add a good page
      scope.get('/good-page')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Good Page</title>
          </head>
          <body>
            <h1>Good Page</h1>
            <p>This is a normal page that should be crawled successfully.</p>
          </body>
          </html>
        `);
      
      // Set up the mocks
      errorMocks.setup();

      // Start crawling
      await crawlerService.crawl(jobId, baseUrl, {
        maxDepth: 1
      });

      // Verify only good pages were crawled
      const documents = await prisma.document.findMany({
        where: { jobId },
      });

      // Should have home page and good page, not the network error page
      expect(documents.length).toBe(2);

      // Verify job has network error info but completed
      const finalJob = await prisma.job.findUnique({ where: { id: jobId } });
      expect(finalJob).toBeDefined();
      expect(finalJob?.status).toBe('completed' as JobStatus);
      expect(finalJob?.error).toContain('Network error');
    });
    
    it('should handle multiple types of errors in a single crawl', async () => {
      const jobId = 'test-mixed-errors';

      // Create the job record
      await prisma.job.create({
        data: {
          id: jobId,
          url: baseUrl,
          startDate: new Date(),
        },
      });

      // Set up error condition mocks
      errorMocks = new ErrorConditionMocks({
        baseUrl,
      });

      // Add a custom home page that links to both good and various error pages
      const scope = errorMocks['scope'];
      
      // Add a good home page
      scope.get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Error Test Home</title>
          </head>
          <body>
            <h1>Error Test Home</h1>
            <p>This page links to working pages and error pages.</p>
            <ul>
              <li><a href="/good-page">Good Page</a></li>
              <li><a href="/error-${ErrorType.NOT_FOUND}">404 Not Found</a></li>
              <li><a href="/error-${ErrorType.SERVER_ERROR}">500 Server Error</a></li>
              <li><a href="/error-${ErrorType.NETWORK_ERROR}">Network Error</a></li>
              <li><a href="/error-${ErrorType.MALFORMED_CONTENT}">Malformed HTML</a></li>
            </ul>
          </body>
          </html>
        `);

      // Add a good page
      scope.get('/good-page')
        .reply(200, `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Good Page</title>
          </head>
          <body>
            <h1>Good Page</h1>
            <p>This is a normal page that should be crawled successfully.</p>
          </body>
          </html>
        `);
      
      // Set up the mocks
      errorMocks.setup();

      // Start crawling
      await crawlerService.crawl(jobId, baseUrl, {
        maxDepth: 1
      });

      // Verify only good pages were crawled
      const documents = await prisma.document.findMany({
        where: { jobId },
      });

      // Should have home page and good page only
      expect(documents.length).toBe(2);

      // Check documents
      const urls = documents.map(d => d.url).sort();
      expect(urls).toEqual([
        baseUrl,
        `${baseUrl}/good-page`
      ]);

      // Verify job has errors but completed
      const finalJob = await prisma.job.findUnique({ where: { id: jobId } });
      expect(finalJob).toBeDefined();
      expect(finalJob?.status).toBe('completed' as JobStatus);
      expect(finalJob?.error).toBeDefined();
      expect(finalJob?.errorCount).toBeGreaterThan(1);
    });
  });
}); 
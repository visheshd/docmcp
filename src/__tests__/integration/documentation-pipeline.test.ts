import { PrismaClient } from '../../generated/prisma';
import { startCrawlingProcess } from '../../services/mcp-tools/add-documentation.tool';
import { CrawlerService } from '../../services/crawler.service';
import { DocumentService } from '../../services/document.service';
import { DocumentProcessorService } from '../../services/document-processor.service';
import { JobService } from '../../services/job.service';
import { setupTestDatabase, teardownTestDatabase, getTestPrismaClient } from '../utils/testDb';
import axios from 'axios';

// Mock axios to avoid making actual HTTP requests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Documentation Processing Pipeline Integration', () => {
  let prisma: PrismaClient;
  let jobId: string;
  
  beforeAll(async () => {
    prisma = await setupTestDatabase();
  });
  
  afterAll(async () => {
    await teardownTestDatabase();
  });
  
  beforeEach(async () => {
    // Clear database tables
    await prisma.chunk.deleteMany();
    await prisma.document.deleteMany();
    await prisma.job.deleteMany();
    
    // Create a new job to use in tests
    const jobService = new JobService(prisma);
    const job = await jobService.createJob({
      url: 'https://example.com/docs',
      status: 'pending',
      startDate: new Date(),
      progress: 0,
      error: null,
      stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
    });
    jobId = job.id;
    
    // Setup axios mock to return HTML content
    mockedAxios.get.mockImplementation(async (url) => {
      if (url === 'https://example.com/robots.txt') {
        return {
          status: 200,
          data: 'User-agent: *\nAllow: /',
        };
      }
      
      // First page with link to second
      if (url === 'https://example.com/docs') {
        return {
          status: 200,
          data: `
            <html>
              <head>
                <title>Documentation Home</title>
                <meta name="package" content="example-docs">
                <meta name="version" content="1.0.0">
              </head>
              <body>
                <h1>Example Documentation</h1>
                <p>This is the main documentation page.</p>
                <a href="https://example.com/docs/page1">Page 1</a>
              </body>
            </html>
          `,
        };
      }
      
      // Second page
      if (url === 'https://example.com/docs/page1') {
        return {
          status: 200,
          data: `
            <html>
              <head>
                <title>Page 1</title>
              </head>
              <body>
                <h1>Page 1</h1>
                <p>This is page 1 of the documentation.</p>
                <pre><code class="language-javascript">
                  function example() {
                    return "hello world";
                  }
                </code></pre>
              </body>
            </html>
          `,
        };
      }
      
      return {
        status: 404,
        data: '404 Not Found',
      };
    });
    
    // Setup axios mock for embeddings
    mockedAxios.post.mockResolvedValue({
      data: {
        embedding: Array(384).fill(0.1),
      },
    });
  });
  
  it('should process documents end-to-end', async () => {
    // Start the crawling process
    await startCrawlingProcess(jobId, {
      url: 'https://example.com/docs',
      maxDepth: 1,
      _prisma: prisma,
      _bypassAsync: true,
    });
    
    // Check that job was completed
    const jobService = new JobService(prisma);
    const updatedJob = await jobService.findJobById(jobId);
    
    expect(updatedJob).toBeDefined();
    expect(updatedJob?.status).toBe('completed');
    expect(updatedJob?.progress).toBe(1.0);
    
    // Check that documents were created
    const documentService = new DocumentService(prisma);
    const documents = await prisma.document.findMany({
      where: { url: { startsWith: 'https://example.com/docs' } },
    });
    
    expect(documents.length).toBe(2);
    expect(documents[0].title).toBe('Documentation Home');
    expect(documents[1].title).toBe('Page 1');
    
    // Check that chunks were created with embeddings
    const chunks = await prisma.chunk.findMany({
      where: { documentId: { in: documents.map(d => d.id) } },
      select: {
        id: true,
        content: true,
        metadata: true,
        embedding: true,
        documentId: true,
        createdAt: true,
        updatedAt: true,
      }
    });
    
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(chunk => {
      expect(chunk.embedding).toBeDefined();
      expect(chunk.embedding.length).toBe(384);
    });
    
    // Check that job stats were updated
    expect(updatedJob?.stats).toEqual(expect.objectContaining({
      pagesProcessed: 2,
      totalChunks: expect.any(Number),
    }));
  });
}); 
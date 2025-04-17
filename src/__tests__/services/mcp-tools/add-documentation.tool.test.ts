import addDocumentationTool from '../../../services/mcp-tools/add-documentation.tool';
import { JobService } from '../../../services/job.service';
import { CrawlerService } from '../../../services/crawler.service';
import { PrismaClient } from '../../../generated/prisma';
import { getTestPrismaClient } from '../../utils/testDb';

// Mock the JobService and CrawlerService
jest.mock('../../../services/job.service');
jest.mock('../../../services/crawler.service');
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Mock setTimeout to execute callback immediately
jest.mock('timers', () => ({
  ...jest.requireActual('timers'),
  setTimeout: (fn: Function) => fn(),
}));

describe('add_documentation MCP tool', () => {
  const mockJob = {
    id: 'test-job-id',
    url: 'https://example.com',
    status: 'pending',
    progress: 0,
    startDate: new Date(),
    endDate: null,
    error: null,
    stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
  };

  let jobServiceMock: jest.Mocked<JobService>;
  let crawlerServiceMock: jest.Mocked<CrawlerService>;
  let testPrisma: PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup the test Prisma client
    testPrisma = getTestPrismaClient();
    
    // Setup JobService mock
    jobServiceMock = {
      createJob: jest.fn().mockResolvedValue(mockJob),
      updateJobProgress: jest.fn().mockResolvedValue(mockJob),
      updateJobError: jest.fn().mockResolvedValue({ ...mockJob, status: 'failed' }),
    } as unknown as jest.Mocked<JobService>;
    
    // Mock the constructor to pass the test Prisma client
    (JobService as jest.Mock).mockImplementation(() => jobServiceMock);
    
    // Setup CrawlerService mock
    crawlerServiceMock = {
      crawl: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CrawlerService>;
    
    // Mock the constructor to pass the test Prisma client
    (CrawlerService as jest.Mock).mockImplementation(() => crawlerServiceMock);
  });

  it('should validate URL format', async () => {
    // Call the tool handler with an invalid URL
    await expect(addDocumentationTool.handler({ 
      url: 'invalid-url',
      _prisma: testPrisma 
    }))
      .rejects.toThrow('Invalid URL format: invalid-url');
    
    // Verify that no job was created
    expect(jobServiceMock.createJob).not.toHaveBeenCalled();
  });

  it('should validate maxDepth parameter', async () => {
    // Call the tool handler with an invalid maxDepth
    await expect(addDocumentationTool.handler({ 
      url: 'https://example.com', 
      maxDepth: 0,
      _prisma: testPrisma
    }))
      .rejects.toThrow('maxDepth must be a positive integer');
    
    // Verify that no job was created
    expect(jobServiceMock.createJob).not.toHaveBeenCalled();
  });

  it('should validate rateLimit parameter', async () => {
    // Call the tool handler with an invalid rateLimit
    await expect(addDocumentationTool.handler({ 
      url: 'https://example.com', 
      rateLimit: -1,
      _prisma: testPrisma
    }))
      .rejects.toThrow('rateLimit must be a non-negative integer');
    
    // Verify that no job was created
    expect(jobServiceMock.createJob).not.toHaveBeenCalled();
  });

  it('should create a job and return jobId immediately', async () => {
    // Call the tool handler with valid parameters but don't start crawling
    const result = await addDocumentationTool.handler({
      url: 'https://example.com',
      maxDepth: 2,
      name: 'Example Docs',
      tags: ['documentation', 'example'],
      _prisma: testPrisma
    });
    
    // Verify the result
    expect(result).toEqual({
      jobId: 'test-job-id',
      url: 'https://example.com',
      status: 'pending',
      message: expect.any(String),
    });
    
    // Verify that a job was created and JobService was created with the Prisma client
    expect(JobService).toHaveBeenCalledWith(testPrisma);
    expect(jobServiceMock.createJob).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com',
      status: 'pending',
    }));
    
    // Verify that crawling wasn't started yet (will be in background)
    expect(jobServiceMock.updateJobProgress).not.toHaveBeenCalled();
    expect(crawlerServiceMock.crawl).not.toHaveBeenCalled();
  });

  it('should start the crawling process in the background', async () => {
    // Call the tool handler with _bypassAsync to make it run immediately
    await addDocumentationTool.handler({
      url: 'https://example.com',
      maxDepth: 2,
      _bypassAsync: true,
      _prisma: testPrisma
    });
    
    // Verify that JobService was created with the Prisma client
    expect(JobService).toHaveBeenCalledWith(testPrisma);
    
    // Verify that CrawlerService was created with the Prisma client
    expect(CrawlerService).toHaveBeenCalledWith(testPrisma);
    
    // Verify that updateJobProgress was called to set status to running
    expect(jobServiceMock.updateJobProgress).toHaveBeenCalledWith('test-job-id', 'running', 0);
    
    // Verify that the crawler service was called
    expect(crawlerServiceMock.crawl).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
      maxDepth: 2,
      respectRobotsTxt: true,
    }));
  });

  it('should handle errors during crawling', async () => {
    // Setup the crawler service to throw an error
    const error = new Error('Crawling failed');
    crawlerServiceMock.crawl.mockRejectedValueOnce(error);
    
    // Call the tool handler with _bypassAsync to make it run immediately
    await addDocumentationTool.handler({
      url: 'https://example.com',
      _bypassAsync: true,
      _prisma: testPrisma
    });
    
    // Verify that JobService was created with the Prisma client for error handling
    expect(JobService).toHaveBeenCalledWith(testPrisma);
    
    // Verify that updateJobError was called with the error message
    expect(jobServiceMock.updateJobError).toHaveBeenCalledWith('test-job-id', 'Crawling failed');
  });
}); 
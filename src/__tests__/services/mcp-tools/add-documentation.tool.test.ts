import { PrismaClient } from '../../../generated/prisma';
import addDocumentationTool, { startCrawlingProcess } from '../../../services/mcp-tools/add-documentation.tool';
import { JobService } from '../../../services/job.service';
import { CrawlerService } from '../../../services/crawler.service';
import { DocumentService } from '../../../services/document.service';
import { DocumentProcessorService } from '../../../services/document-processor.service';

// Mock the services
jest.mock('../../../services/job.service');
jest.mock('../../../services/crawler.service');
jest.mock('../../../services/document.service');
jest.mock('../../../services/document-processor.service');

describe('Add Documentation Tool', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockJobService: jest.Mocked<JobService>;
  let mockCrawlerService: jest.Mocked<CrawlerService>;
  let mockDocumentService: jest.Mocked<DocumentService>;
  let mockDocumentProcessorService: jest.Mocked<DocumentProcessorService>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock PrismaClient
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: 5 }]),
      job: {
        create: jest.fn().mockResolvedValue({ id: 'test-job-id', /* other fields */ }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'doc1', jobId: 'test-job-id', title: 'Doc 1', content: '<html><body>Test 1</body></html>', metadata: { type: 'test' } },
          { id: 'doc2', jobId: 'test-job-id', title: 'Doc 2', content: '<html><body>Test 2</body></html>', metadata: { type: 'test' } },
        ]),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      package: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      packageVersion: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
      packageDocumentationMapping: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      documentationCache: { findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
      chunk: { create: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    } as unknown as jest.Mocked<PrismaClient>;
    
    // Create mock services
    mockJobService = {
      updateJobProgress: jest.fn().mockResolvedValue({}),
      updateJobMetadata: jest.fn().mockResolvedValue({}),
      updateJobStats: jest.fn().mockResolvedValue({}),
      updateJobError: jest.fn().mockResolvedValue({}),
      findJobById: jest.fn().mockResolvedValue({ stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 } }),
    } as unknown as jest.Mocked<JobService>;
    
    mockCrawlerService = {
      crawl: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CrawlerService>;
    
    mockDocumentService = {
      updateDocument: jest.fn().mockResolvedValue({}),
      createDocument: jest.fn(),
    } as unknown as jest.Mocked<DocumentService>;
    
    mockDocumentProcessorService = {
      processDocument: jest.fn().mockResolvedValue('Processed Markdown'),
    } as unknown as jest.Mocked<DocumentProcessorService>;
    
    // Restore the constructors
    (JobService as jest.Mock).mockImplementation(() => mockJobService);
    (CrawlerService as jest.Mock).mockImplementation(() => mockCrawlerService);
    (DocumentService as jest.Mock).mockImplementation(() => mockDocumentService);
    (DocumentProcessorService as jest.Mock).mockImplementation(() => mockDocumentProcessorService);
  });
  
  describe('startCrawlingProcess', () => {
    it('should execute the full pipeline successfully', async () => {
      // Arrange
      const jobId = 'test-job-id';
      const params = {
        url: 'https://example.com/docs',
        maxDepth: 2,
        name: 'Example Docs',
        tags: ['test', 'example'],
        _prisma: mockPrisma,
      };
      
      // Act
      await startCrawlingProcess(jobId, params);
      
      // Assert
      
      // 1. Job status and metadata updates
      expect(mockJobService.updateJobProgress).toHaveBeenCalledWith(jobId, 'running', 0);
      expect(mockJobService.updateJobMetadata).toHaveBeenCalledWith(jobId, { stage: 'crawling' });
      expect(mockJobService.updateJobMetadata).toHaveBeenCalledWith(jobId, {
        name: 'Example Docs',
        tags: ['test', 'example'],
        maxDepth: 2
      });
      
      // 2. Crawler is called with correct params
      expect(mockCrawlerService.crawl).toHaveBeenCalledWith(
        jobId,
        'https://example.com/docs',
        {
          maxDepth: 2,
          rateLimit: undefined,
          respectRobotsTxt: true,
        }
      );
      
      // 3. Job status is updated to processing stage
      expect(mockJobService.updateJobProgress).toHaveBeenCalledWith(jobId, 'running', 0.5);
      expect(mockJobService.updateJobMetadata).toHaveBeenCalledWith(jobId, { stage: 'processing' });
      
      // 4. Documents are retrieved
      // expect(mockDocumentService.findDocumentsByUrl).toHaveBeenCalledWith('https://example.com/docs');
      
      // 5. Each document is processed
      expect(mockDocumentProcessorService.processDocument).toHaveBeenCalledTimes(2);
      expect(mockDocumentProcessorService.processDocument).toHaveBeenCalledWith(
        'doc1', 
        '<html><body>Test 1</body></html>',
        { type: 'test' }
      );
      expect(mockDocumentProcessorService.processDocument).toHaveBeenCalledWith(
        'doc2', 
        '<html><body>Test 2</body></html>',
        { type: 'test' }
      );
      
      // 6. Job progress is updated during processing
      expect(mockJobService.updateJobProgress).toHaveBeenCalledWith(jobId, 'running', 0.5 + (0.5 * (1/2)));
      expect(mockJobService.updateJobProgress).toHaveBeenCalledWith(jobId, 'running', 0.5 + (0.5 * (2/2)));
      
      // 7. Job stats are updated
      expect(mockJobService.updateJobStats).toHaveBeenCalledWith(jobId, {
        pagesProcessed: 2,
        pagesSkipped: 0,
        totalChunks: 5,
      });
      
      // 8. Job is marked as completed
      expect(mockJobService.updateJobProgress).toHaveBeenCalledWith(jobId, 'completed', 1.0);
    });
    
    it('should handle errors during document processing', async () => {
      // Arrange
      const jobId = 'test-job-id';
      const params = {
        url: 'https://example.com/docs',
        _prisma: mockPrisma,
      };
      
      // Make the second document fail processing
      mockDocumentProcessorService.processDocument.mockImplementation((docId) => {
        if (docId === 'doc2') {
          return Promise.reject(new Error('Processing error'));
        }
        return Promise.resolve('Processed Markdown');
      });
      
      // Act
      await startCrawlingProcess(jobId, params);
      
      // Assert
      
      // 1. First document should be processed successfully
      expect(mockDocumentProcessorService.processDocument).toHaveBeenCalledWith(
        'doc1', 
        '<html><body>Test 1</body></html>',
        { type: 'test' }
      );
      
      // 2. Second document should attempt processing but fail
      expect(mockDocumentProcessorService.processDocument).toHaveBeenCalledWith(
        'doc2', 
        '<html><body>Test 2</body></html>',
        { type: 'test' }
      );
      
      // 3. Error should be recorded in document metadata
      expect(mockDocumentService.updateDocument).toHaveBeenCalledWith('doc2', {
        metadata: {
          type: 'test',
          processingError: 'Processing error',
        },
      });
      
      // 4. Job should still complete successfully with stats reflecting the partial success
      expect(mockJobService.updateJobProgress).toHaveBeenCalledWith(jobId, 'completed', 1.0);
      expect(mockJobService.updateJobStats).toHaveBeenCalledWith(jobId, {
        pagesProcessed: 1,
        pagesSkipped: 1,
        totalChunks: 5,
      });
    });
    
    it('should handle crawler errors', async () => {
      // Arrange
      const jobId = 'test-job-id';
      const params = {
        url: 'https://example.com/docs',
        _prisma: mockPrisma,
      };
      
      // Make the crawler fail
      mockCrawlerService.crawl.mockRejectedValue(new Error('Crawler error'));
      
      // Act
      await startCrawlingProcess(jobId, params);
      
      // Assert
      
      // 1. Job should be marked as failed
      expect(mockJobService.updateJobError).toHaveBeenCalledWith(jobId, 'Crawler error');
      
      // 2. Document processor should not be called
      expect(mockDocumentProcessorService.processDocument).not.toHaveBeenCalled();
    });
  });
}); 
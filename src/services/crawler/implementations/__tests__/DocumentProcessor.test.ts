import { DocumentProcessor } from '../DocumentProcessor';
import { PrismaClient } from '@prisma/client';
import { DocumentCreateData } from '../../interfaces/types';

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockCreate = jest.fn();
  const mockFindFirst = jest.fn();
  const mockFindMany = jest.fn();
  const mockDeleteMany = jest.fn();
  const mockFindUnique = jest.fn();
  
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      document: {
        create: mockCreate,
        findFirst: mockFindFirst,
        findMany: mockFindMany,
        deleteMany: mockDeleteMany,
        findUnique: mockFindUnique
      },
      $connect: jest.fn(),
      $disconnect: jest.fn()
    }))
  };
});

describe('DocumentProcessor', () => {
  let processor: DocumentProcessor;
  let mockPrisma: jest.Mocked<PrismaClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    processor = new DocumentProcessor(mockPrisma);
  });
  
  describe('createDocument', () => {
    it('should create a document in the database', async () => {
      // Setup test data
      const mockDocumentData: DocumentCreateData = {
        url: 'https://example.com/page',
        title: 'Test Page',
        content: '<html><body>Test content</body></html>',
        metadata: { domain: 'example.com' },
        crawlDate: new Date('2023-01-01'),
        level: 1,
        jobId: 'job123'
      };
      
      const mockCreatedDocument = {
        id: 'doc123',
        ...mockDocumentData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Setup mock response
      mockPrisma.document.create.mockResolvedValueOnce(mockCreatedDocument);
      
      // Execute method
      const result = await processor.createDocument(mockDocumentData);
      
      // Verify results
      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: {
          url: mockDocumentData.url,
          title: mockDocumentData.title,
          content: mockDocumentData.content,
          metadata: mockDocumentData.metadata,
          crawlDate: mockDocumentData.crawlDate,
          level: mockDocumentData.level,
          jobId: mockDocumentData.jobId
        }
      });
      
      expect(result).toEqual(mockCreatedDocument);
    });
    
    it('should use "Untitled" as default title when none provided', async () => {
      // Setup test data with no title
      const mockDocumentData: DocumentCreateData = {
        url: 'https://example.com/page',
        title: null,
        content: '<html><body>Test content</body></html>',
        metadata: { domain: 'example.com' },
        crawlDate: new Date('2023-01-01'),
        level: 1,
        jobId: 'job123'
      };
      
      const mockCreatedDocument = {
        id: 'doc123',
        ...mockDocumentData,
        title: 'Untitled',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Setup mock response
      mockPrisma.document.create.mockResolvedValueOnce(mockCreatedDocument);
      
      // Execute method
      await processor.createDocument(mockDocumentData);
      
      // Verify title is set to "Untitled"
      expect(mockPrisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Untitled'
          })
        })
      );
    });
    
    it('should handle database errors', async () => {
      const mockError = new Error('Database error');
      mockPrisma.document.create.mockRejectedValueOnce(mockError);
      
      const mockDocumentData: DocumentCreateData = {
        url: 'https://example.com/page',
        title: 'Test Page',
        content: '<html><body>Test content</body></html>',
        metadata: { domain: 'example.com' },
        crawlDate: new Date('2023-01-01'),
        level: 1,
        jobId: 'job123'
      };
      
      await expect(processor.createDocument(mockDocumentData)).rejects.toThrow('Database error');
    });
  });
  
  describe('findRecentDocument', () => {
    it('should find a recent document by URL', async () => {
      const url = 'https://example.com/page';
      const maxAge = 7; // 7 days
      
      const mockDocument = {
        id: 'doc123',
        url,
        title: 'Test Page',
        content: '<html><body>Test content</body></html>',
        metadata: { domain: 'example.com' },
        crawlDate: new Date(),
        level: 1,
        jobId: 'job123',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      mockPrisma.document.findFirst.mockResolvedValueOnce(mockDocument);
      
      const result = await processor.findRecentDocument(url, maxAge);
      
      // Verify correct query was made
      expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
        where: {
          url,
          crawlDate: {
            gte: expect.any(Date)
          }
        },
        orderBy: {
          crawlDate: 'desc'
        }
      });
      
      expect(result).toEqual(mockDocument);
    });
    
    it('should return null when no recent document is found', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(null);
      
      const result = await processor.findRecentDocument('https://example.com/page', 7);
      
      expect(result).toBeNull();
    });
  });
  
  describe('copyDocument', () => {
    it('should copy a document with updated jobId and level', async () => {
      const existingDocument = {
        id: 'doc123',
        url: 'https://example.com/page',
        title: 'Test Page',
        content: '<html><body>Test content</body></html>',
        metadata: { domain: 'example.com' },
        crawlDate: new Date('2023-01-01'),
        level: 1,
        jobId: 'job123',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const newJobId = 'newjob456';
      const newLevel = 2;
      
      const newDocument = {
        ...existingDocument,
        id: 'doc456',
        jobId: newJobId,
        level: newLevel,
        crawlDate: expect.any(Date)
      };
      
      mockPrisma.document.create.mockResolvedValueOnce(newDocument);
      
      const result = await processor.copyDocument(existingDocument, newJobId, newLevel);
      
      // Verify parameters passed to create method
      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: {
          url: existingDocument.url,
          title: existingDocument.title,
          content: existingDocument.content,
          metadata: existingDocument.metadata,
          crawlDate: expect.any(Date), // Should be updated to current date
          level: newLevel,
          jobId: newJobId
        }
      });
      
      expect(result).toEqual(newDocument);
    });
  });
  
  describe('findDocumentsByJobId', () => {
    it('should find all documents for a job', async () => {
      const jobId = 'job123';
      const mockDocuments = [
        {
          id: 'doc1',
          url: 'https://example.com/page1',
          title: 'Page 1',
          content: 'Content 1',
          metadata: {},
          crawlDate: new Date(),
          level: 0,
          jobId,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'doc2',
          url: 'https://example.com/page2',
          title: 'Page 2',
          content: 'Content 2',
          metadata: {},
          crawlDate: new Date(),
          level: 1,
          jobId,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      mockPrisma.document.findMany.mockResolvedValueOnce(mockDocuments);
      
      const result = await processor.findDocumentsByJobId(jobId);
      
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
        where: { jobId },
        orderBy: { level: 'asc' }
      });
      
      expect(result).toEqual(mockDocuments);
      expect(result.length).toBe(2);
    });
    
    it('should return empty array when no documents found', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      
      const result = await processor.findDocumentsByJobId('nonexistent');
      
      expect(result).toEqual([]);
    });
  });
  
  describe('deleteDocumentsByJobId', () => {
    it('should delete all documents for a job', async () => {
      const jobId = 'job123';
      mockPrisma.document.deleteMany.mockResolvedValueOnce({ count: 5 });
      
      const result = await processor.deleteDocumentsByJobId(jobId);
      
      expect(mockPrisma.document.deleteMany).toHaveBeenCalledWith({
        where: { jobId }
      });
      
      expect(result).toBe(5);
    });
  });
  
  describe('findDocumentById', () => {
    it('should find a document by ID', async () => {
      const documentId = 'doc123';
      const mockDocument = {
        id: documentId,
        url: 'https://example.com/page',
        title: 'Test Page',
        content: 'Test content',
        metadata: {},
        crawlDate: new Date(),
        level: 1,
        jobId: 'job123',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      mockPrisma.document.findUnique.mockResolvedValueOnce(mockDocument);
      
      const result = await processor.findDocumentById(documentId);
      
      expect(mockPrisma.document.findUnique).toHaveBeenCalledWith({
        where: { id: documentId }
      });
      
      expect(result).toEqual(mockDocument);
    });
    
    it('should return null when document not found', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      
      const result = await processor.findDocumentById('nonexistent');
      
      expect(result).toBeNull();
    });
  });
}); 
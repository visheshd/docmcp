import { DocumentService } from '../../services/document.service';
import { getTestPrismaClient } from '../utils/testDb';
import { PrismaClient, Prisma } from '../../generated/prisma';

describe('DocumentService Integration Tests', () => {
  let documentService: DocumentService;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    documentService = new DocumentService(prisma);
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await prisma.chunk.deleteMany();
    await prisma.document.deleteMany();
  });

  describe('createDocument', () => {
    it('should create a document successfully', async () => {
      const testDoc: Omit<Prisma.DocumentCreateInput, 'id' | 'createdAt' | 'updatedAt'> = {
        url: 'https://test.com/docs',
        title: 'Test Documentation',
        content: 'Test content',
        metadata: { package: 'test', version: '1.0.0', type: 'api', tags: ['test'] },
        crawlDate: new Date(),
        level: 1,
      };

      const result = await documentService.createDocument(testDoc);

      expect(result).toBeDefined();
      expect(result.url).toBe(testDoc.url);
      expect(result.title).toBe(testDoc.title);
      expect(result.content).toBe(testDoc.content);
    });
  });

  describe('findDocumentById', () => {
    it('should find a document by id', async () => {
      const testDoc = await prisma.document.create({
        data: {
          url: 'https://test.com/docs',
          title: 'Test Documentation',
          content: 'Test content',
          metadata: { package: 'test', version: '1.0.0', type: 'api', tags: ['test'] },
          crawlDate: new Date(),
          level: 1,
          parentDocumentId: null,
        },
      });

      const result = await documentService.findDocumentById(testDoc.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testDoc.id);
    });

    it('should return null for non-existent document', async () => {
      const result = await documentService.findDocumentById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('findDocumentsByUrl', () => {
    it('should find documents by url', async () => {
      const url = 'https://test.com/docs';
      await prisma.document.createMany({
        data: [
          {
            url,
            title: 'Test Doc 1',
            content: 'Content 1',
            metadata: { package: 'test', version: '1.0.0', type: 'api', tags: ['test'] },
            crawlDate: new Date(),
            level: 1,
            parentDocumentId: null,
          },
          {
            url,
            title: 'Test Doc 2',
            content: 'Content 2',
            metadata: { package: 'test', version: '1.0.0', type: 'api', tags: ['test'] },
            crawlDate: new Date(),
            level: 2,
            parentDocumentId: null,
          },
        ],
      });

      const results = await documentService.findDocumentsByUrl(url);

      expect(results).toHaveLength(2);
      expect(results[0].url).toBe(url);
      expect(results[1].url).toBe(url);
    });
  });

  describe('updateDocument', () => {
    it('should update a document successfully', async () => {
      const testDoc = await prisma.document.create({
        data: {
          url: 'https://test.com/docs',
          title: 'Test Documentation',
          content: 'Test content',
          metadata: { package: 'test', version: '1.0.0', type: 'api', tags: ['test'] },
          crawlDate: new Date(),
          level: 1,
          parentDocumentId: null,
        },
      });

      const updatedTitle = 'Updated Documentation';
      const result = await documentService.updateDocument(testDoc.id, {
        title: updatedTitle,
      });

      expect(result).toBeDefined();
      expect(result.title).toBe(updatedTitle);
    });
  });

  describe('deleteDocument', () => {
    it('should delete a document successfully', async () => {
      const testDoc = await prisma.document.create({
        data: {
          url: 'https://test.com/docs',
          title: 'Test Documentation',
          content: 'Test content',
          metadata: { package: 'test', version: '1.0.0', type: 'api', tags: ['test'] },
          crawlDate: new Date(),
          level: 1,
          parentDocumentId: null,
        },
      });

      await documentService.deleteDocument(testDoc.id);

      const result = await prisma.document.findUnique({
        where: { id: testDoc.id },
      });

      expect(result).toBeNull();
    });
  });
}); 
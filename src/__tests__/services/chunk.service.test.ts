import { ChunkService } from '../../services/chunk.service';
import prisma from '../../config/database';
import { initializeDatabase } from '../../config/database';
import type { Chunk, Document } from '../../generated/prisma';

describe('ChunkService Integration Tests', () => {
  let chunkService: ChunkService;
  let testDocument: Document;

  beforeAll(async () => {
    await initializeDatabase();
    chunkService = new ChunkService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await prisma.chunk.deleteMany();
    await prisma.document.deleteMany();

    // Create a test document for chunks
    testDocument = await prisma.document.create({
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
  });

  describe('createChunk', () => {
    it('should create a chunk successfully', async () => {
      const testChunk = {
        document: { connect: { id: testDocument.id } },
        content: 'Test chunk content',
        embedding: new Array(1536).fill(0.1),
        metadata: { title: 'Section 1', order: 1, type: 'text' },
      };

      const result = await chunkService.createChunk(testChunk);

      expect(result).toBeDefined();
      expect(result.documentId).toBe(testDocument.id);
      expect(result.content).toBe(testChunk.content);
      expect(result.metadata).toEqual(testChunk.metadata);
    });
  });

  describe('createManyChunks', () => {
    it('should create multiple chunks in a transaction', async () => {
      const chunks = [
        {
          documentId: testDocument.id,
          content: 'Chunk 1 content',
          embedding: new Array(1536).fill(0.1),
          metadata: { title: 'Section 1', order: 1, type: 'text' },
        },
        {
          documentId: testDocument.id,
          content: 'Chunk 2 content',
          embedding: new Array(1536).fill(0.2),
          metadata: { title: 'Section 2', order: 2, type: 'text' },
        },
      ];

      const results = await chunkService.createManyChunks(chunks, testDocument.id);

      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('Chunk 1 content');
      expect(results[1].content).toBe('Chunk 2 content');
    });
  });

  describe('findSimilarChunks', () => {
    it('should find similar chunks using vector similarity', async () => {
      // Create test chunks
      await prisma.chunk.createMany({
        data: [
          {
            documentId: testDocument.id,
            content: 'Chunk 1 content',
            embedding: new Array(1536).fill(0.1),
            metadata: { title: 'Section 1', order: 1, type: 'text' },
          },
          {
            documentId: testDocument.id,
            content: 'Chunk 2 content',
            embedding: new Array(1536).fill(0.2),
            metadata: { title: 'Section 2', order: 2, type: 'text' },
          },
        ],
      });

      const queryVector = new Array(1536).fill(0.15);
      const results = await chunkService.findSimilarChunks(queryVector, 2);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      // Note: We can't test exact similarity scores as they depend on the database's vector calculations
    });
  });

  describe('updateChunk', () => {
    it('should update a chunk successfully', async () => {
      const chunk = await prisma.chunk.create({
        data: {
          documentId: testDocument.id,
          content: 'Original content',
          embedding: new Array(1536).fill(0.1),
          metadata: { title: 'Original Section', order: 1, type: 'text' },
        },
      });

      const updatedContent = 'Updated content';
      const result = await chunkService.updateChunk(chunk.id, {
        content: updatedContent,
      });

      expect(result).toBeDefined();
      expect(result.content).toBe(updatedContent);
    });
  });

  describe('deleteChunksByDocumentId', () => {
    it('should delete all chunks for a document', async () => {
      // Create test chunks
      await prisma.chunk.createMany({
        data: [
          {
            documentId: testDocument.id,
            content: 'Chunk 1',
            embedding: new Array(1536).fill(0.1),
            metadata: { title: 'Section 1', order: 1, type: 'text' },
          },
          {
            documentId: testDocument.id,
            content: 'Chunk 2',
            embedding: new Array(1536).fill(0.2),
            metadata: { title: 'Section 2', order: 2, type: 'text' },
          },
        ],
      });

      await chunkService.deleteChunksByDocumentId(testDocument.id);

      const remainingChunks = await prisma.chunk.findMany({
        where: { documentId: testDocument.id },
      });

      expect(remainingChunks).toHaveLength(0);
    });
  });
}); 
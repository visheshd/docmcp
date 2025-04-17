import { setupTestDatabase, teardownTestDatabase, getTestPrismaClient } from '../utils/testDb';
import { ChunkService } from '../../services/chunk.service';
import { PrismaClient, Prisma, Document } from '../../generated/prisma';
import pgvector from 'pgvector';
import crypto from 'crypto';

let prisma: PrismaClient;
let chunkService: ChunkService;
let testDocument: Prisma.DocumentGetPayload<{}>;

beforeAll(() => {
  prisma = getTestPrismaClient();
  chunkService = new ChunkService(prisma);
});

afterAll(async () => {
  await teardownTestDatabase();
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

describe('ChunkService Integration Tests', () => {
  describe('createChunk', () => {
    it('should create a chunk successfully', async () => {
      const doc = await prisma.document.create({
        data: {
          url: 'https://test.com/doc',
          title: 'Test Document',
          content: 'Test document content',
          metadata: { package: 'test', version: '1.0.0' },
          crawlDate: new Date(),
          level: 1,
        },
      });
      const chunkData = {
        content: 'Test chunk content',
        embedding: new Array(1536).fill(0.1),
        metadata: { tokenCount: 4, source: 'test' },
        documentId: doc.id,
      };

      await chunkService.createChunk(chunkData);

      const createdChunk = await prisma.chunk.findFirst({
        where: {
          documentId: doc.id,
          content: chunkData.content,
        },
        select: {
          id: true,
          content: true,
          documentId: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      expect(createdChunk).toBeDefined();
      expect(createdChunk?.content).toBe(chunkData.content);
      expect(createdChunk?.documentId).toBe(doc.id);
    });
  });

  describe('createManyChunks', () => {
    it('should create multiple chunks in a transaction', async () => {
      const chunksData = [
        {
          documentId: testDocument.id,
          content: 'Chunk 1 content',
          embedding: new Array(1536).fill(0.2),
          metadata: { tokenCount: 5, source: 'test1' },
        },
        {
          documentId: testDocument.id,
          content: 'Chunk 2 content',
          embedding: new Array(1536).fill(0.3),
          metadata: { tokenCount: 6, source: 'test2' },
        },
      ];

      await chunkService.createManyChunks(chunksData, testDocument.id);

      const createdChunks = await prisma.chunk.findMany({
        where: { documentId: testDocument.id },
        select: {
          id: true,
          content: true,
          documentId: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        }
      });
      expect(createdChunks).toHaveLength(2);
    });
  });

  describe('getChunks', () => {
    it('should get chunks', async () => {
      const chunks = await chunkService.getChunks();
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('findSimilarChunks', () => {
    it('should find similar chunks using vector similarity', async () => {
      const chunksToCreate = [
        { documentId: testDocument.id, content: 'Chunk Alpha', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.1 : i === 1 ? 0.01 : 0), metadata: { type: 'A' } },
        { documentId: testDocument.id, content: 'Chunk Beta', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.9 : i === 1 ? 0.8 : 0), metadata: { type: 'B' } },
        { documentId: testDocument.id, content: 'Chunk Gamma', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.5 : i === 1 ? 0.2 : 0), metadata: { type: 'A' } },
      ];
       for (const chunkData of chunksToCreate) {
           await chunkService.createChunk(chunkData);
       }

      const queryEmbedding = new Array(1536).fill(0).map((_, i) => i === 0 ? 0.15 : i === 1 ? 0.05 : 0);
      // const queryEmbeddingSql = pgvector.toSql(queryEmbedding);

      // // DEBUG: Log calculated distances immediately after creation
      // const distances = await prisma.$queryRaw<Array<{ content: string; cosine_distance: number; calculated_distance: number; cosine_similarity: number }>>`
      //   SELECT
      //     content,
      //     (embedding <#> ${queryEmbeddingSql}::vector) AS cosine_distance,
      //     (1 - (embedding <=> ${queryEmbeddingSql}::vector)) AS calculated_distance,
      //     (embedding <=> ${queryEmbeddingSql}::vector) AS cosine_similarity
      //   FROM chunks
      //   WHERE document_id = ${testDocument.id}
      //   ORDER BY content ASC; -- Order by content for consistent logging
      // `;
      // console.log('DEBUG: Distances calculated right after creation:', distances);

      // Now run the service method
      const results = await chunkService.findSimilarChunks(queryEmbedding, 2);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(results[0].content).toBe('Chunk Beta');
      expect(results[1].content).toBe('Chunk Alpha');
    });

    it('should respect the limit parameter', async () => {
      const chunksToCreate = [
        { documentId: testDocument.id, content: 'Chunk Alpha', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.1 : i === 1 ? 0.01 : 0), metadata: { type: 'A' } },
        { documentId: testDocument.id, content: 'Chunk Beta', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.9 : i === 1 ? 0.8 : 0), metadata: { type: 'B' } },
        { documentId: testDocument.id, content: 'Chunk Gamma', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.5 : i === 1 ? 0.2 : 0), metadata: { type: 'A' } },
      ];
       for (const chunkData of chunksToCreate) {
           await chunkService.createChunk(chunkData);
       }

      const queryEmbedding = new Array(1536).fill(0).map((_, i) => i === 0 ? 0.15 : i === 1 ? 0.05 : 0);
      const results = await chunkService.findSimilarChunks(queryEmbedding, 1);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].content).toBe('Chunk Beta');
    });

    it('should return document details along with chunks', async () => {
      const chunksToCreate = [
        { documentId: testDocument.id, content: 'Chunk Alpha', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.1 : i === 1 ? 0.01 : 0), metadata: { type: 'A' } },
        { documentId: testDocument.id, content: 'Chunk Beta', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.9 : i === 1 ? 0.8 : 0), metadata: { type: 'B' } },
        { documentId: testDocument.id, content: 'Chunk Gamma', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.5 : i === 1 ? 0.2 : 0), metadata: { type: 'A' } },
      ];
       for (const chunkData of chunksToCreate) {
           await chunkService.createChunk(chunkData);
       }

      const queryEmbedding = new Array(1536).fill(0).map((_, i) => i === 0 ? 0.15 : i === 1 ? 0.05 : 0);
      const results = await chunkService.findSimilarChunks(queryEmbedding, 1);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe(testDocument.title);
      expect(results[0].url).toBe(testDocument.url);
    });

    it('should filter results by package name when provided', async () => {
      // Create a document with specific package metadata
      const reactDoc = await prisma.document.create({
        data: {
          url: 'https://react.dev/docs',
          title: 'React Documentation',
          content: 'React API documentation',
          metadata: { package: 'react', version: '18.0.0', type: 'api', tags: ['react'] },
          crawlDate: new Date(),
          level: 1,
          parentDocumentId: null,
        },
      });

      // Create chunks for both documents
      const chunksToCreate = [
        { documentId: testDocument.id, content: 'Test Documentation', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.5 : 0), metadata: { type: 'test' } },
        { documentId: reactDoc.id, content: 'React component documentation', embedding: new Array(1536).fill(0).map((_, i) => i === 0 ? 0.1 : 0), metadata: { type: 'react' } },
      ];
      
      for (const chunkData of chunksToCreate) {
        await chunkService.createChunk(chunkData);
      }

      // Search with package filter
      const queryEmbedding = new Array(1536).fill(0).map((_, i) => i === 0 ? 0.3 : 0);
      const results = await chunkService.findSimilarChunks(queryEmbedding, 5, 'react');

      // Verify only results from the react package are returned
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('React Documentation');
      expect(results[0].url).toBe('https://react.dev/docs');
    });
  });

  describe('updateChunk', () => {
    it('should update a chunk successfully', async () => {
      const embedding = new Array(1536).fill(0.8);
      const metadata = { tokenCount: 10, source: 'original' };
      await chunkService.createChunk({
        documentId: testDocument.id,
        content: 'Original content',
        embedding: embedding,
        metadata: metadata
      });

      const createdChunk = await prisma.chunk.findFirst({
        where: { documentId: testDocument.id, content: 'Original content' },
        select: {
          id: true,
          content: true,
          documentId: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        }
      });
       if (!createdChunk) throw new Error('Test setup failed: Chunk not created');

      const updatedData = {
        content: 'Updated content',
        metadata: { tokenCount: 12, source: 'updated' },
      };
      await chunkService.updateChunk(createdChunk.id, updatedData);

      // Fetch the updated chunk manually, selecting only non-vector fields
      const updatedChunk = await prisma.chunk.findFirst({
        where: { id: createdChunk.id },
        select: {
          id: true,
          content: true,
          metadata: true,
          documentId: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      expect(updatedChunk).toBeDefined();
      expect(updatedChunk?.content).toBe(updatedData.content);
      expect(updatedChunk?.metadata).toEqual(updatedData.metadata);
    });
  });

  describe('deleteChunksByDocumentId', () => {
    it('should delete all chunks for a document', async () => {
      // Create test chunks using raw SQL to handle vector type
      const chunksToCreate = [
        {
          id: crypto.randomUUID(), // Generate ID
          content: 'Chunk 1',
          embedding: new Array(1536).fill(0.1),
          metadata: { title: 'Section 1', order: 1, type: 'text' },
        },
        {
          id: crypto.randomUUID(), // Generate ID
          content: 'Chunk 2',
          embedding: new Array(1536).fill(0.2),
          metadata: { title: 'Section 2', order: 2, type: 'text' },
        },
      ];

      for (const chunkData of chunksToCreate) {
          await chunkService.createChunk({ ...chunkData, documentId: testDocument.id });
      }

      await chunkService.deleteChunksByDocumentId(testDocument.id);

      const remainingChunks = await prisma.chunk.findMany({
        where: { documentId: testDocument.id },
      });

      expect(remainingChunks).toHaveLength(0);
    });
  });

  describe('getChunks', () => {
    it('should get chunks', async () => {
      const chunks = await chunkService.getChunks();
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });
  });
}); 
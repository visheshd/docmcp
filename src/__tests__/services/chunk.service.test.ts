import { setupTestDatabase, teardownTestDatabase, getTestPrismaClient } from '../utils/testDb';
import { ChunkService } from '../../services/chunk.service';
import { PrismaClient, Prisma, Document } from '../../generated/prisma';
import pgvector from 'pgvector';

let prisma: PrismaClient;
let chunkService: ChunkService;
let testDocument: Prisma.DocumentGetPayload<{}>;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  chunkService = new ChunkService();
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
        }
      });

      expect(createdChunk).toBeDefined();
      expect(createdChunk?.content).toBe(chunkData.content);
      expect(createdChunk?.documentId).toBe(doc.id);
      expect(createdChunk?.embedding).toBeDefined();
    });
  });

  describe('createManyChunks', () => {
    it('should create multiple chunks in a transaction', async () => {
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
      const chunksData = [
        {
          documentId: doc.id,
          content: 'Chunk 1 content',
          embedding: new Array(1536).fill(0.2),
          metadata: { tokenCount: 5, source: 'test1' },
        },
        {
          documentId: doc.id,
          content: 'Chunk 2 content',
          embedding: new Array(1536).fill(0.3),
          metadata: { tokenCount: 6, source: 'test2' },
        },
      ];

      await chunkService.createManyChunks(chunksData, doc.id);

      const createdChunks = await prisma.chunk.findMany({
        where: { documentId: doc.id },
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
      const chunksToCreate = [
        { documentId: doc.id, content: 'Chunk Alpha', embedding: new Array(1536).fill(0.1), metadata: { type: 'A' } },
        { documentId: doc.id, content: 'Chunk Beta', embedding: new Array(1536).fill(0.9), metadata: { type: 'B' } },
        { documentId: doc.id, content: 'Chunk Gamma', embedding: new Array(1536).fill(0.5), metadata: { type: 'A' } },
      ];
       for (const chunkData of chunksToCreate) {
          const embeddingSql = pgvector.toSql(chunkData.embedding);
          const metadataSql = JSON.stringify(chunkData.metadata);
          await prisma.$executeRawUnsafe(
            'INSERT INTO "chunks" ("document_id", "content", "embedding", "metadata") VALUES ($1, $2, $3::vector, $4::jsonb)',
            doc.id,
            chunkData.content,
            embeddingSql,
            metadataSql
          );
      }

      const queryEmbedding = new Array(1536).fill(0.15);
      const results = await chunkService.findSimilarChunks(queryEmbedding, 2);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(results[0].content).toBe('Chunk Alpha');
      expect(results[1].content).toBe('Chunk Gamma');
    });

    it('should respect the limit parameter', async () => {
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
      const chunksToCreate = [
        { documentId: doc.id, content: 'Chunk Alpha', embedding: new Array(1536).fill(0.1), metadata: { type: 'A' } },
        { documentId: doc.id, content: 'Chunk Beta', embedding: new Array(1536).fill(0.9), metadata: { type: 'B' } },
        { documentId: doc.id, content: 'Chunk Gamma', embedding: new Array(1536).fill(0.5), metadata: { type: 'A' } },
      ];
       for (const chunkData of chunksToCreate) {
          const embeddingSql = pgvector.toSql(chunkData.embedding);
          const metadataSql = JSON.stringify(chunkData.metadata);
          await prisma.$executeRawUnsafe(
            'INSERT INTO "chunks" ("document_id", "content", "embedding", "metadata") VALUES ($1, $2, $3::vector, $4::jsonb)',
            doc.id,
            chunkData.content,
            embeddingSql,
            metadataSql
          );
      }

      const queryEmbedding = new Array(1536).fill(0.15);
      const results = await chunkService.findSimilarChunks(queryEmbedding, 1);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].content).toBe('Chunk Alpha');
    });

    it('should return document details along with chunks', async () => {
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
      const chunksToCreate = [
        { documentId: doc.id, content: 'Chunk Alpha', embedding: new Array(1536).fill(0.1), metadata: { type: 'A' } },
        { documentId: doc.id, content: 'Chunk Beta', embedding: new Array(1536).fill(0.9), metadata: { type: 'B' } },
        { documentId: doc.id, content: 'Chunk Gamma', embedding: new Array(1536).fill(0.5), metadata: { type: 'A' } },
      ];
       for (const chunkData of chunksToCreate) {
          const embeddingSql = pgvector.toSql(chunkData.embedding);
          const metadataSql = JSON.stringify(chunkData.metadata);
          await prisma.$executeRawUnsafe(
            'INSERT INTO "chunks" ("document_id", "content", "embedding", "metadata") VALUES ($1, $2, $3::vector, $4::jsonb)',
            doc.id,
            chunkData.content,
            embeddingSql,
            metadataSql
          );
      }

      const queryEmbedding = new Array(1536).fill(0.15);
      const results = await chunkService.findSimilarChunks(queryEmbedding, 1);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Test Document');
      expect(results[0].url).toBe('https://test.com/doc');
    });
  });

  describe('updateChunk', () => {
    it('should update a chunk successfully', async () => {
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
      const embeddingSql = pgvector.toSql(new Array(1536).fill(0.8));
      const metadataSql = JSON.stringify({ tokenCount: 10, source: 'original' });
      await prisma.$executeRawUnsafe(
        'INSERT INTO "chunks" ("document_id", "content", "embedding", "metadata") VALUES ($1, $2, $3::vector, $4::jsonb)',
        doc.id,
        'Original content',
        embeddingSql,
        metadataSql
      );
      const createdChunk = await prisma.chunk.findFirst({
        where: { documentId: doc.id, content: 'Original content' }
      });
       if (!createdChunk) throw new Error('Test setup failed: Chunk not created');

      const updatedData = {
        content: 'Updated content',
        metadata: { tokenCount: 12, source: 'updated' },
      };
      const result = await chunkService.updateChunk(createdChunk.id, updatedData);

      expect(result).toBeDefined();
      expect(result.content).toBe(updatedData.content);
      expect(result.metadata).toEqual(updatedData.metadata);
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

  describe('getChunks', () => {
    it('should get chunks', async () => {
      const chunks = await chunkService.getChunks();
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });
  });
}); 
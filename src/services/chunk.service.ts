import { getPrismaClient } from '../config/database';
import { PrismaClient, Prisma } from '../generated/prisma';
import logger from '../utils/logger';
import pgvector from 'pgvector';

// Define input types matching the data needed for raw queries
interface CreateChunkInput {
  documentId: string;
  content: string;
  embedding: number[]; // Expecting number[] directly
  metadata?: Prisma.InputJsonValue;
}

export class ChunkService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Create a new chunk
   */
  async createChunk(data: CreateChunkInput) {
    const { documentId, content, embedding, metadata } = data;

    if (!documentId || !embedding) {
      throw new Error("documentId and embedding are required to create a chunk.");
    }

    const embeddingSql = pgvector.toSql(embedding);
    const metadataSql = metadata ? JSON.stringify(metadata) : null;

    try {
      const result = await this.prisma.$executeRaw`INSERT INTO "chunks" ("document_id", "content", "embedding", "metadata") VALUES (${documentId}, ${content}, ${embeddingSql}::vector, ${metadataSql}::jsonb)`;
      logger.info(`Created chunk, result: ${result}`);
    } catch (error) {
      logger.error('Error creating chunk:', error);
      throw error;
    }
  }

  /**
   * Create multiple chunks in a transaction
   */
  async createManyChunks(chunks: CreateChunkInput[], documentId: string): Promise<void> {
    if (!chunks.length) {
      return;
    }

    logger.info(`Attempting to create ${chunks.length} chunks for document ${documentId} in a transaction.`);

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const chunk of chunks) {
          const { content, embedding, metadata } = chunk;
          const embeddingSql = pgvector.toSql(embedding);
          const metadataSql = metadata ? JSON.stringify(metadata) : null;

          await tx.$executeRaw`INSERT INTO "chunks" ("document_id", "content", "embedding", "metadata") VALUES (${documentId}, ${content}, ${embeddingSql}::vector, ${metadataSql}::jsonb)`;
        }
      });
      logger.info(`Successfully created ${chunks.length} chunks for document ${documentId}`);
    } catch (error) {
      logger.error(`Error creating chunks for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Find similar chunks using vector similarity
   */
  async findSimilarChunks(embedding: number[], limit = 5) {
    try {
      type ChunkResult = {
        id: string;
        content: string;
        embedding: number[];
        metadata: Prisma.JsonValue;
        documentId: string;
        url: string;
        title: string;
        similarity: number;
      };

      // Convert the embedding array to the string format expected by pgvector
      // Ensure the string is properly quoted for direct SQL injection (hence using $queryRawUnsafe)
      const embeddingString = `'[${embedding.join(',')}]'`;

      const query = `
        SELECT c.*, d.url, d.title,
          (c.embedding <=> ${embeddingString}::vector) as similarity
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        ORDER BY similarity ASC
        LIMIT ${limit}
      `;
      
      const results = await this.prisma.$queryRawUnsafe<ChunkResult[]>(query);

      return results;
    } catch (error) {
      logger.error('Error finding similar chunks:', error);
      throw error;
    }
  }

  /**
   * Update a chunk
   */
  async updateChunk(id: string, data: Prisma.ChunkUpdateInput) {
    try {
      const chunk = await this.prisma.chunk.update({
        where: { id },
        data,
      });
      return chunk;
    } catch (error) {
      logger.error('Error updating chunk:', error);
      throw error;
    }
  }

  /**
   * Delete all chunks for a document
   */
  async deleteChunksByDocumentId(documentId: string) {
    try {
      await this.prisma.chunk.deleteMany({
        where: {
          documentId,
        },
      });
    } catch (error) {
      logger.error('Error deleting chunks:', error);
      throw error;
    }
  }

  /**
   * Get chunks with optional ordering
   */
  async getChunks(options?: {
    orderBy?: Prisma.ChunkOrderByWithRelationInput;
  }) {
    try {
      const chunks = await this.prisma.chunk.findMany({
        orderBy: options?.orderBy,
        include: {
          document: true,
        },
      });
      return chunks;
    } catch (error) {
      logger.error('Error getting chunks:', error);
      throw error;
    }
  }
} 
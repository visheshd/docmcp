import prisma from '../config/database';
import { Chunk, PrismaClient, Prisma } from '../generated/prisma';
import logger from '../utils/logger';

export class ChunkService {
  /**
   * Create a new chunk
   */
  async createChunk(data: Prisma.ChunkCreateInput) {
    try {
      const chunk = await prisma.chunk.create({
        data,
        include: {
          document: true,
        },
      });
      return chunk;
    } catch (error) {
      logger.error('Error creating chunk:', error);
      throw error;
    }
  }

  /**
   * Create multiple chunks in a transaction
   */
  async createManyChunks(chunks: Prisma.ChunkCreateManyInput[], documentId: string) {
    try {
      const createdChunks = await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>) => {
        return await tx.chunk.createMany({
          data: chunks.map(chunk => ({
            ...chunk,
            documentId
          })),
        });
      });
      return createdChunks;
    } catch (error) {
      logger.error('Error creating chunks:', error);
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

      const results = await prisma.$queryRaw`
        SELECT c.*, d.url, d.title,
          (c.embedding <=> ${embedding}::float[]) as similarity
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        ORDER BY similarity ASC
        LIMIT ${limit}
      ` as ChunkResult[];
      
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
      const chunk = await prisma.chunk.update({
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
      await prisma.chunk.deleteMany({
        where: {
          documentId,
        },
      });
    } catch (error) {
      logger.error('Error deleting chunks:', error);
      throw error;
    }
  }
} 
import { getPrismaClient as getMainPrismaClient } from '../config/database';
import { PrismaClient, Prisma } from '../generated/prisma';
import logger from '../utils/logger';
import pgvector from 'pgvector';
import crypto from 'crypto';

// Define input types matching the data needed for raw queries
interface CreateChunkInput {
  documentId: string;
  content: string;
  embedding: number[]; // Expecting number[] directly
  metadata?: Prisma.InputJsonValue;
  id?: string; // Allow optional ID for direct insertion if needed, but generate if not provided
}

// Define input type for updates, specifically for raw query construction
interface UpdateChunkInput { 
  embedding?: number[];
  content?: string; // Simplified to string for raw query
  metadata?: Prisma.InputJsonValue; // Use InputJsonValue as expected by JSON.stringify
}

export class ChunkService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || getMainPrismaClient();
  }

  /**
   * Create a new chunk
   */
  async createChunk(data: CreateChunkInput) {
    const { documentId, content, embedding, metadata } = data;
    const id = data.id || crypto.randomUUID(); // Generate UUID if not provided

    if (!documentId || !embedding) {
      throw new Error("documentId and embedding are required to create a chunk.");
    }

    const embeddingSql = pgvector.toSql(embedding);
    const metadataSql = metadata ? JSON.stringify(metadata) : null;

    try {
      const result = await this.prisma.$executeRaw`INSERT INTO "chunks" ("id", "document_id", "content", "embedding", "metadata", "created_at", "updated_at") VALUES (${id}, ${documentId}, ${content}, ${embeddingSql}::vector, ${metadataSql}::jsonb, NOW(), NOW())`;
      logger.info(`Created chunk with ID ${id}, result: ${result}`);
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
          const id = chunk.id || crypto.randomUUID(); // Generate UUID for each chunk
          const embeddingSql = pgvector.toSql(embedding);
          const metadataSql = metadata ? JSON.stringify(metadata) : null;

          await tx.$executeRaw`INSERT INTO "chunks" ("id", "document_id", "content", "embedding", "metadata", "created_at", "updated_at") VALUES (${id}, ${documentId}, ${content}, ${embeddingSql}::vector, ${metadataSql}::jsonb, NOW(), NOW())`;
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
   * @param embedding - The embedding vector to compare against
   * @param limit - Maximum number of similar chunks to return (default: 5)
   * @param packageName - Optional package name to filter results (e.g., 'react', 'prisma')
   * @returns Promise<Array<{ id: string; content: string; metadata: Prisma.JsonValue; documentId: string; url: string; title: string; similarity: number; }>>
   */
  async findSimilarChunks(
    embedding: number[], 
    limit = 5,
    packageName?: string
  ): Promise<Array<{
    id: string;
    content: string;
    metadata: Prisma.JsonValue;
    documentId: string;
    url: string;
    title: string;
    similarity: number;
  }>> {
    try {
      type ChunkResult = {
        id: string;
        content: string;
        metadata: Prisma.JsonValue;
        documentId: string;
        url: string;
        title: string;
        similarity: number;
      };

      const embeddingSql = pgvector.toSql(embedding);

      // Build the SQL query based on whether package filtering is needed
      let results: ChunkResult[];
      
      if (packageName) {
        // Query with package filtering
        results = await this.prisma.$queryRaw<ChunkResult[]>`
          SELECT
            c.id,
            c.content,
            c.metadata,
            c.document_id AS "documentId",
            d.url,
            d.title,
            -- Use cosine similarity (<=>). Higher values mean more similar.
            (c.embedding <=> ${embeddingSql}::vector) as similarity
          FROM chunks c
          JOIN documents d ON c.document_id = d.id
          WHERE (d.metadata->>'package' = ${packageName} OR d.url LIKE ${`%${packageName}%`})
          ORDER BY similarity DESC -- Order by cosine similarity descending
          LIMIT ${limit}
        `;
      } else {
        // Query without package filtering
        results = await this.prisma.$queryRaw<ChunkResult[]>`
          SELECT
            c.id,
            c.content,
            c.metadata,
            c.document_id AS "documentId",
            d.url,
            d.title,
            -- Use cosine similarity (<=>). Higher values mean more similar.
            (c.embedding <=> ${embeddingSql}::vector) as similarity
          FROM chunks c
          JOIN documents d ON c.document_id = d.id
          ORDER BY similarity DESC -- Order by cosine similarity descending
          LIMIT ${limit}
        `;
      }

      return results;
    } catch (error) {
      logger.error('Error finding similar chunks:', error);
      throw error;
    }
  }

  /**
   * Update a chunk
   */
  async updateChunk(id: string, data: UpdateChunkInput) {
    try {
      // Prepare fields for raw query
      const updates = [];
      const values = [];
      if (data.content !== undefined) {
        updates.push(`"content" = $${values.length + 1}`);
        values.push(data.content);
      }
      if (data.embedding !== undefined) {
        updates.push(`"embedding" = $${values.length + 1}::vector`);
        values.push(pgvector.toSql(data.embedding as number[]));
      }
      if (data.metadata !== undefined) {
        updates.push(`"metadata" = $${values.length + 1}::jsonb`);
        values.push(JSON.stringify(data.metadata));
      }

      if (updates.length === 0) {
        logger.warn(`No fields to update for chunk ${id}`);
        return; // Or perhaps fetch and return the existing chunk?
      }

      // Always update the updated_at timestamp
      updates.push(`"updated_at" = NOW()`);

      const query = `UPDATE "chunks" SET ${updates.join(', ')} WHERE "id" = $${values.length + 1}`;
      values.push(id);

      await this.prisma.$executeRawUnsafe(query, ...values);
      logger.info(`Updated chunk with ID ${id}`);
      // Since we used executeRaw, we don't get the updated object back directly.
      // The calling code (like tests) will need to fetch it separately if needed.
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
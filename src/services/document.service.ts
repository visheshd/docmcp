import { getPrismaClient as getMainPrismaClient } from '../config/database';
import { PrismaClient, Prisma } from '../generated/prisma';
import logger from '../utils/logger';

// Define input type for creation, adding jobId
interface CreateDocumentInput extends Omit<Prisma.DocumentCreateInput, 'id' | 'createdAt' | 'updatedAt' | 'job'> {
  jobId?: string; // Add optional jobId
}

export class DocumentService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || getMainPrismaClient();
  }

  /**
   * Create a new document
   */
  async createDocument(data: CreateDocumentInput) {
    try {
      // Separate jobId from the rest of the data
      const { jobId, ...restData } = data;
      
      const createData: Prisma.DocumentCreateInput = {
        ...restData,
        // Connect to job if jobId is provided
        ...(jobId && { job: { connect: { id: jobId } } }),
      };
      
      const document = await this.prisma.document.create({
        data: createData,
        include: {
          chunks: true,
        },
      });
      return document;
    } catch (error) {
      logger.error('Error creating document:', error);
      throw error;
    }
  }

  /**
   * Find a document by ID
   */
  async findDocumentById(id: string) {
    try {
      const document = await this.prisma.document.findUnique({
        where: { id },
        include: {
          chunks: true,
          childDocuments: true,
        },
      });
      return document;
    } catch (error) {
      logger.error('Error finding document:', error);
      throw error;
    }
  }

  /**
   * Find documents by URL
   */
  async findDocumentsByUrl(url: string) {
    try {
      const documents = await this.prisma.document.findMany({
        where: { url },
        include: {
          chunks: true,
        },
      });
      return documents;
    } catch (error) {
      logger.error('Error finding documents by URL:', error);
      throw error;
    }
  }

  /**
   * Update a document
   */
  async updateDocument(id: string, data: Prisma.DocumentUpdateInput) {
    try {
      const document = await this.prisma.document.update({
        where: { id },
        data,
        include: {
          chunks: true,
        },
      });
      return document;
    } catch (error) {
      logger.error('Error updating document:', error);
      throw error;
    }
  }

  /**
   * Delete a document and its chunks
   */
  async deleteDocument(id: string) {
    try {
      const document = await this.prisma.document.delete({
        where: { id },
      });
      return document;
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }
} 
import prisma from '../config/database';
import type { Document } from '../generated/prisma';
import logger from '../utils/logger';

export class DocumentService {
  /**
   * Create a new document
   */
  async createDocument(data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const document = await prisma.document.create({
        data,
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
      const document = await prisma.document.findUnique({
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
      const documents = await prisma.document.findMany({
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
  async updateDocument(id: string, data: Partial<Omit<Document, 'id' | 'createdAt' | 'updatedAt'>>) {
    try {
      const document = await prisma.document.update({
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
      const document = await prisma.document.delete({
        where: { id },
      });
      return document;
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }
} 
import { PrismaClient } from '@prisma/client';
import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import { Document, DocumentCreateData } from '../interfaces/types';
import { LoggingUtils } from '../utils/LoggingUtils';

/**
 * Implementation of the document processor using Prisma
 */
export class DocumentProcessor implements IDocumentProcessor {
  private readonly prisma: PrismaClient;
  private readonly logger = LoggingUtils.createTaggedLogger('document-processor');

  /**
   * Constructor with optional Prisma client for dependency injection
   * @param prismaClient Optional Prisma client instance (for testing)
   */
  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  /**
   * Create a new document in the database
   * @param data Document creation data
   * @returns The created document
   */
  async createDocument(data: DocumentCreateData): Promise<Document> {
    try {
      this.logger.debug(`Creating document for URL: ${data.url}`);
      
      // Create the document
      const document = await this.prisma.document.create({
        data: {
          url: data.url,
          title: data.title || 'Untitled',
          content: data.content,
          metadata: data.metadata,
          crawlDate: data.crawlDate,
          level: data.level,
          jobId: data.jobId,
        }
      });
      
      this.logger.debug(`Created document with ID: ${document.id}`);
      return document as Document;
    } catch (error) {
      this.logger.error(`Error creating document: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Find a recent document for a URL
   * @param url The URL to find a document for
   * @param age Maximum age of the document in days
   * @returns The document or null if not found
   */
  async findRecentDocument(url: string, age: number): Promise<Document | null> {
    try {
      this.logger.debug(`Finding recent document for URL: ${url} (max age: ${age} days)`);
      
      // Calculate the cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - age);
      
      // Find the document
      const document = await this.prisma.document.findFirst({
        where: {
          url: url,
          crawlDate: {
            gte: cutoffDate
          }
        },
        orderBy: {
          crawlDate: 'desc'
        }
      });
      
      if (document) {
        this.logger.debug(`Found recent document with ID: ${document.id}`);
        return document as Document;
      } else {
        this.logger.debug(`No recent document found for URL: ${url}`);
        return null;
      }
    } catch (error) {
      this.logger.error(`Error finding recent document: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Copy a document but update the jobId and level
   * @param existingDocument The document to copy
   * @param jobId The new job ID
   * @param level The new level
   * @returns The copied document
   */
  async copyDocument(existingDocument: Document, jobId: string, level: number): Promise<Document> {
    try {
      this.logger.debug(`Copying document with ID: ${existingDocument.id} for job: ${jobId}`);
      
      // Create a new document with the same data
      const newDocument = await this.prisma.document.create({
        data: {
          url: existingDocument.url,
          title: existingDocument.title || 'Untitled',
          content: existingDocument.content,
          metadata: existingDocument.metadata,
          crawlDate: new Date(), // Update the crawl date to now
          level: level,
          jobId: jobId,
        }
      });
      
      this.logger.debug(`Copied document created with ID: ${newDocument.id}`);
      return newDocument as Document;
    } catch (error) {
      this.logger.error(`Error copying document: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Find all documents for a job
   * @param jobId The job ID
   * @returns Array of documents
   */
  async findDocumentsByJobId(jobId: string): Promise<Document[]> {
    try {
      this.logger.debug(`Finding documents for job: ${jobId}`);
      
      const documents = await this.prisma.document.findMany({
        where: {
          jobId: jobId
        },
        orderBy: {
          level: 'asc'
        }
      });
      
      this.logger.debug(`Found ${documents.length} documents for job: ${jobId}`);
      return documents as Document[];
    } catch (error) {
      this.logger.error(`Error finding documents by job ID: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Delete documents for a job
   * @param jobId The job ID
   * @returns The number of documents deleted
   */
  async deleteDocumentsByJobId(jobId: string): Promise<number> {
    try {
      this.logger.debug(`Deleting documents for job: ${jobId}`);
      
      const result = await this.prisma.document.deleteMany({
        where: {
          jobId: jobId
        }
      });
      
      this.logger.debug(`Deleted ${result.count} documents for job: ${jobId}`);
      return result.count;
    } catch (error) {
      this.logger.error(`Error deleting documents by job ID: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Find a document by its ID
   * @param id The document ID
   * @returns The document or null if not found
   */
  async findDocumentById(id: string): Promise<Document | null> {
    try {
      this.logger.debug(`Finding document with ID: ${id}`);
      
      const document = await this.prisma.document.findUnique({
        where: {
          id: id
        }
      });
      
      return document as Document | null;
    } catch (error) {
      this.logger.error(`Error finding document by ID: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
} 
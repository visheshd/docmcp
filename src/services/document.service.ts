import { getPrismaClient as getMainPrismaClient } from '../config/database';
import { PrismaClient, Prisma } from '../generated/prisma';
import logger from '../utils/logger';
import { DocumentationMapperService } from './documentation-mapper.service';

// Package metadata structure
export interface PackageMetadata {
  packageName: string;
  packageVersion?: string;
  language?: string;
  isApiDoc?: boolean;
  isGuide?: boolean;
  isHomepage?: boolean;
  sourceName?: string;
  sourceUrl?: string;
  sourceIsOfficial?: boolean;
  relevanceScore?: number;
}

// Define input type for creation, adding jobId and packageInfo
interface CreateDocumentInput extends Omit<Prisma.DocumentCreateInput, 'id' | 'createdAt' | 'updatedAt' | 'job'> {
  jobId?: string; // Add optional jobId
  packageInfo?: PackageMetadata; // Add optional package info
}

export class DocumentService {
  private prisma: PrismaClient;
  private documentationMapperService: DocumentationMapperService;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || getMainPrismaClient();
    this.documentationMapperService = new DocumentationMapperService(this.prisma);
  }

  /**
   * Create a new document
   * @param data Document creation data including optional package information
   * @returns Created document
   */
  async createDocument(data: CreateDocumentInput) {
    try {
      // Separate jobId and packageInfo from the rest of the data
      const { jobId, packageInfo, ...restData } = data;
      
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

      // If package info was provided, map the document to the package
      if (packageInfo && packageInfo.packageName) {
        try {
          logger.info(`Mapping document ${document.id} to package ${packageInfo.packageName}`);
          
          await this.documentationMapperService.mapDocumentToPackage(
            document.id,
            packageInfo.packageName,
            packageInfo.language || 'javascript', // Default to JavaScript
            {
              version: packageInfo.packageVersion,
              isApiDoc: packageInfo.isApiDoc,
              isGuide: packageInfo.isGuide,
              isHomepage: packageInfo.isHomepage,
              sourceName: packageInfo.sourceName || 'User Added',
              sourceUrl: packageInfo.sourceUrl,
              sourceIsOfficial: packageInfo.sourceIsOfficial,
              relevanceScore: packageInfo.relevanceScore || 0.8 // Default high relevance for user-provided mappings
            }
          );
          
          logger.debug(`Successfully mapped document ${document.id} to package ${packageInfo.packageName}`);
        } catch (error) {
          // Log the error but don't fail document creation
          logger.error(`Error mapping document ${document.id} to package ${packageInfo.packageName}:`, error);
        }
      }
      
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
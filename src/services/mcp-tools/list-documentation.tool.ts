import { MCPFunction, MCPTool, MCPToolRegistry } from '../../types/mcp';
import { getPrismaClient } from '../../config/database';
import logger from '../../utils/logger';
import { PrismaClient } from '../../generated/prisma';
import { createWhereClause } from '../../utils/prisma-filters';

/**
 * MCP tool for listing available documentation with filtering options
 * Supports filtering by tags and status, sorting, and pagination
 */

// Define the tool function schema following OpenAI Function Calling format
const listDocumentationFunction: MCPFunction = {
  name: 'list_documentation',
  description: 'Lists available documentation with filtering options by tags and status',
  parameters: {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Optional filter by tags (e.g., ["react", "nodejs"])'
      },
      status: {
        type: 'string',
        description: 'Optional filter by job status (e.g., "completed", "running", "pending")'
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default: 1)'
      },
      pageSize: {
        type: 'number',
        description: 'Number of items per page (default: 10, max: 50)'
      },
      sortBy: {
        type: 'string',
        description: 'Field to sort by (e.g., "title", "crawlDate", "createdAt")'
      },
      sortDirection: {
        type: 'string',
        description: 'Sort direction ("asc" or "desc")'
      },
      metadataFilters: {
        type: 'object',
        description: 'Optional filter by metadata fields (e.g., {"package": "react", "version": "18.0.0"})'
      }
    }
  }
};

interface ListDocumentationParams {
  tags?: string[];
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: string;
  metadataFilters?: Record<string, any>;
}

// Implement the tool handler
const listDocumentationHandler = async (params: ListDocumentationParams) => {
  const prisma = getPrismaClient();
  logger.info(`List documentation tool called with params: ${JSON.stringify(params)}`);
  
  try {
    // Parse pagination parameters
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize ? Math.min(params.pageSize, 50) : 10;
    const skip = (page - 1) * pageSize;
    
    // Build filter conditions using utility function
    const where = createWhereClause({
      tags: params.tags,
      status: params.status,
      metadataFilters: params.metadataFilters
    });
    
    // Build sorting
    const orderBy: any = {};
    if (params.sortBy) {
      const validSortFields = ['title', 'crawlDate', 'createdAt', 'updatedAt'];
      const sortField = validSortFields.includes(params.sortBy) ? params.sortBy : 'crawlDate';
      const sortDirection = params.sortDirection === 'asc' ? 'asc' : 'desc';
      orderBy[sortField] = sortDirection;
    } else {
      // Default sort by crawl date, newest first
      orderBy.crawlDate = 'desc';
    }
    
    // Execute count query
    const totalCount = await prisma.document.count({
      where
    });
    
    // Execute main query
    const documents = await prisma.document.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        job: {
          select: {
            id: true,
            status: true,
            progress: true,
            tags: true,
            name: true
          }
        },
        childDocuments: {
          select: {
            id: true,
            title: true
          }
        },
        _count: {
          select: {
            chunks: true
          }
        }
      }
    });
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // Group documents by job for statistics
    const documentsByJob = documents.reduce((acc, doc) => {
      const jobId = doc.jobId;
      if (jobId) {
        acc[jobId] = acc[jobId] || [];
        acc[jobId].push(doc);
      }
      return acc;
    }, {} as Record<string, any[]>);
    
    // Calculate statistics for each documentation set
    const stats = Object.entries(documentsByJob).map(([jobId, docs]) => {
      const firstDoc = docs[0];
      const job = firstDoc.job;
      
      return {
        jobId,
        name: job?.name || 'Unknown',
        status: job?.status || 'UNKNOWN',
        documentCount: docs.length,
        tags: job?.tags || [],
        averageChunksPerDoc: docs.reduce((sum, doc) => sum + (doc._count?.chunks || 0), 0) / docs.length,
        progress: job?.progress || 100,
      };
    });
    
    // Format the response
    const response = {
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        url: doc.url,
        metadata: doc.metadata,
        crawlDate: doc.crawlDate,
        jobId: doc.jobId,
        status: doc.job?.status || null,
        childCount: doc.childDocuments.length,
        chunkCount: doc._count?.chunks || 0,
        tags: doc.job?.tags || []
      })),
      pagination: {
        page,
        pageSize,
        totalItems: totalCount,
        totalPages
      },
      statistics: stats
    };
    
    return response;
  } catch (error) {
    logger.error('Error listing documentation:', error);
    throw error;
  }
};

// Create the MCP tool
export const listDocumentationTool: MCPTool = {
  function: listDocumentationFunction,
  handler: listDocumentationHandler
};

// Register the tool
export const registerListDocumentationTool = () => {
  MCPToolRegistry.registerTool(listDocumentationTool);
  logger.info('List documentation tool registered');
};

export default listDocumentationTool; 
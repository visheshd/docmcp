import { z } from 'zod';
import { getPrismaClient } from '../../config/database';
import logger from '../../utils/logger';
import { PrismaClient } from '../../generated/prisma';
import { createWhereClause } from '../../utils/prisma-filters';

/**
 * MCP tool for listing available documentation with filtering options
 * Supports filtering by tags and status, sorting, and pagination
 */

// Define Zod schema for parameters
export const listDocumentationSchema = {
  tags: z.array(z.string()).optional().describe('Optional filter by tags (e.g., ["react", "nodejs"])'),
  status: z.string().optional().describe('Optional filter by job status (e.g., "completed", "running", "pending")'),
  page: z.number().int().positive().optional().default(1).describe('Page number for pagination'),
  pageSize: z.number().int().positive().max(50).optional().default(10).describe('Number of items per page'),
  sortBy: z.string().optional().describe('Field to sort by (e.g., "title", "crawlDate", "createdAt")'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort direction'),
  metadataFilters: z.record(z.any()).optional().describe('Optional filter by metadata fields (e.g., {"package": "react", "version": "18.0.0"})')
};

// Explicitly define handler parameter type
type ListDocumentationParams = {
  tags?: string[];
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  metadataFilters?: Record<string, any>;
};

// Implement the handler function matching SDK expectations
export const listDocumentationHandler = async (params: ListDocumentationParams) => {
  const prisma = getPrismaClient();
  logger.info(`List documentation tool called with params: ${JSON.stringify(params)}`);
  
  try {
    // Use validated and defaulted parameters
    // Provide defaults again for type safety, although Zod should handle this upstream
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;
    const { sortBy, sortDirection, tags, status, metadataFilters } = params;
    const skip = (page - 1) * pageSize;
    
    // Build filter conditions
    const where = createWhereClause({
      tags: tags,
      status: status,
      metadataFilters: metadataFilters
    });
    
    // Build sorting
    const orderBy: any = {};
    const validSortFields = ['title', 'crawlDate', 'createdAt', 'updatedAt'];
    const sortField = sortBy && validSortFields.includes(sortBy) ? sortBy : 'crawlDate';
    orderBy[sortField] = sortDirection;
    
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
    
    // Group documents by job for statistics (simplified for this example)
    const stats = {}; // Placeholder for stats if needed in final output
    
    // Format the response data (can be simplified)
    const responseData = {
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
      // statistics: stats // Optionally include simplified stats
    };
    
    // Return simplified response for SDK
    return {
      content: [
        {
          type: 'text' as const,
          text: `Found ${totalCount} documentation entries. Page ${page}/${totalPages}.\nDetails: ${JSON.stringify(responseData, null, 2)}`
        }
      ]
    };
  } catch (error) {
    logger.error('Error listing documentation:', error);
    return {
      content: [
        {
          type: 'text' as const,
          text: error instanceof Error ? error.message : 'Failed to list documentation'
        }
      ],
      isError: true
    };
  }
};

// Remove old MCPFunction, MCPTool, and register function
// const listDocumentationFunction: MCPFunction = { ... };
// export const listDocumentationTool: MCPTool = { ... };
// export const registerListDocumentationTool = () => { ... };
// export default listDocumentationTool; 
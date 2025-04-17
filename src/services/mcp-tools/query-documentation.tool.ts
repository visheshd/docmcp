import { MCPFunction, MCPTool, MCPToolRegistry } from '../../types/mcp';
import logger from '../../utils/logger';
import { ChunkService } from '../chunk.service';
import { DocumentService } from '../document.service';
import { PrismaClient } from '../../generated/prisma';
import { getPrismaClient as getMainPrismaClient } from '../../config/database';
import { DocumentProcessorService } from '../document-processor.service';

// Define the tool function schema following OpenAI Function Calling format
const queryDocumentationFunction: MCPFunction = {
  name: 'query_documentation',
  description: 'Query indexed documentation using natural language and get relevant responses with citations',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The natural language query about documentation'
      },
      context: {
        type: 'string',
        description: 'Optional code context to help refine the search'
      },
      package: {
        type: 'string',
        description: 'Optional package name to filter results'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)'
      }
    },
    required: ['query']
  }
};

// Input type for the handler
interface QueryDocumentationParams {
  query: string;
  context?: string;
  package?: string;
  limit?: number;
  // For testing: provide custom Prisma client
  _prisma?: PrismaClient;
}

// Response type for documentation chunks
interface DocumentationChunk {
  content: string;
  metadata: any;
  url: string;
  title: string;
  similarity: number;
}

// Format a documentation chunk into a citation string
function formatCitation(chunk: DocumentationChunk): string {
  const { content, url, title, similarity } = chunk;
  return `[${title}](${url}) (similarity: ${similarity.toFixed(3)}):\n${content}\n`;
}

// Implement the tool handler
const queryDocumentationHandler = async (params: QueryDocumentationParams) => {
  logger.info(`Query documentation tool called with query: ${params.query}`);

  try {
    // Use the provided Prisma client or get the main one
    const prisma = params._prisma || getMainPrismaClient();
    
    // Initialize services
    const documentProcessorService = new DocumentProcessorService(prisma);
    const chunkService = new ChunkService(prisma);
    
    // Generate embedding for the query
    const queryEmbedding = await documentProcessorService.createEmbedding(params.query);
    
    // Find similar chunks
    const similarChunks = await chunkService.findSimilarChunks(
      queryEmbedding,
      params.limit || 5,
      params.package
    );
    
    if (!similarChunks.length) {
      return {
        message: 'No relevant documentation found for your query.',
        results: []
      };
    }

    // Format results with citations
    const formattedResults = similarChunks.map(formatCitation);

    return {
      message: 'Found relevant documentation:',
      results: formattedResults
    };

  } catch (error) {
    logger.error('Error in query_documentation handler:', error);
    throw error;
  }
};

// Export the tool for registration
export const queryDocumentationTool: MCPTool = {
  function: queryDocumentationFunction,
  handler: queryDocumentationHandler
}; 
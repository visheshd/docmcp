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
  id: string;
  content: string;
  metadata: any;
  documentId: string;
  url: string;
  title: string;
  similarity: number;
}

// Enhanced response type
interface FormattedResponse {
  content: string;
  citation: string;
  sourceUrl: string;
  sourceTitle: string;
  relevanceScore: number;
  packageInfo?: string;
  codeContext?: string;
}

/**
 * Extract package information from chunk metadata or URL
 */
function extractPackageInfo(chunk: DocumentationChunk): string {
  // Try to get package from metadata
  const packageFromMetadata = chunk.metadata?.package;
  if (packageFromMetadata) {
    const version = chunk.metadata?.version ? ` v${chunk.metadata.version}` : '';
    return `${packageFromMetadata}${version}`;
  }
  
  // Try to extract from URL
  try {
    const url = new URL(chunk.url);
    // Common patterns in documentation URLs
    const hostParts = url.hostname.split('.');
    if (hostParts.length > 1) {
      const possiblePackage = hostParts[0] === 'www' ? hostParts[1] : hostParts[0];
      if (possiblePackage !== 'github' && possiblePackage !== 'docs' && possiblePackage !== 'documentation') {
        return possiblePackage;
      }
    }
    
    // Try to extract from path
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return pathParts[0];
    }
  } catch (error) {
    // Ignore URL parsing errors
  }
  
  return 'Unknown Package';
}

/**
 * Extract code context from a chunk
 */
function extractCodeContext(chunk: DocumentationChunk): string | undefined {
  // Check if content contains code blocks
  const codeBlockMatch = chunk.content.match(/```([a-z]*)\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const language = codeBlockMatch[1] || 'unknown';
    const code = codeBlockMatch[2].trim();
    return `${language}: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`;
  }
  
  // Check if metadata indicates this is code
  if (chunk.metadata?.type === 'code' || chunk.metadata?.language) {
    return `${chunk.metadata.language || 'code'} example`;
  }
  
  return undefined;
}

/**
 * Adjust relevance score based on context
 */
function adjustRelevanceScore(
  chunk: DocumentationChunk, 
  query: string, 
  context?: string
): number {
  let score = chunk.similarity; // Base score is the cosine similarity
  
  // If we have code context, prioritize chunks that seem to be relevant to that code
  if (context) {
    // Extract potential code identifiers from context
    const contextIdentifiers = extractIdentifiersFromCode(context);
    
    // Check if any identifiers appear in the chunk content
    const contentMatches = contextIdentifiers.filter(id => 
      chunk.content.includes(id) || 
      (chunk.title && chunk.title.includes(id))
    );
    
    // Boost score based on matches
    if (contentMatches.length > 0) {
      score += 0.1 * Math.min(contentMatches.length, 3); // Cap at 0.3 boost
    }
  }
  
  // Boost documentation chunks with code examples
  if (chunk.content.includes('```') || chunk.metadata?.type === 'code') {
    score += 0.05;
  }
  
  // Boost if title contains query terms
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
  const titleMatches = queryTerms.filter(term => 
    chunk.title.toLowerCase().includes(term)
  );
  
  if (titleMatches.length > 0) {
    score += 0.1 * Math.min(titleMatches.length / queryTerms.length, 1);
  }
  
  return score;
}

/**
 * Extract potential code identifiers from a code snippet
 */
function extractIdentifiersFromCode(code: string): string[] {
  // Simple regex to extract potential function/variable names
  const identifierRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  const matches = code.match(identifierRegex) || [];
  
  // Filter out common keywords and short identifiers
  const commonKeywords = new Set([
    'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 
    'return', 'class', 'import', 'export', 'default', 'from', 'require',
    'new', 'this', 'true', 'false', 'null', 'undefined'
  ]);
  
  return matches
    .filter(id => !commonKeywords.has(id.toLowerCase()))
    .filter(id => id.length > 2); // Ignore very short identifiers
}

/**
 * Format a documentation chunk into a well-structured response with citation
 */
function formatDocumentationResponse(
  chunk: DocumentationChunk,
  query: string,
  context?: string
): FormattedResponse {
  const packageInfo = extractPackageInfo(chunk);
  const codeContext = extractCodeContext(chunk);
  const relevanceScore = adjustRelevanceScore(chunk, query, context);
  
  // Format the content with proper markdown
  let content = chunk.content.trim();
  
  // Ensure code blocks are properly formatted
  if (!content.includes('```') && codeContext) {
    // If content contains code but not in markdown code blocks, try to format it
    const codeIndentRegex = /^( {4,}|\t+).*$/gm;
    if (codeIndentRegex.test(content)) {
      // Convert indented code to fenced code blocks
      content = content.replace(
        /( {4,}|\t+)(.*\n)+/g, 
        match => `\n\`\`\`\n${match.replace(/^ {4,}|\t+/gm, '')}\n\`\`\`\n`
      );
    }
  }
  
  // Create citation with package info and source
  const citation = packageInfo ? 
    `${packageInfo} Documentation` : 
    `Documentation Source`;
  
  return {
    content,
    citation,
    sourceUrl: chunk.url,
    sourceTitle: chunk.title,
    relevanceScore,
    packageInfo,
    codeContext
  };
}

/**
 * Create a formatted response string from a formatted response object
 */
function formatResponseString(response: FormattedResponse): string {
  const { content, citation, sourceUrl, sourceTitle, relevanceScore, packageInfo, codeContext } = response;
  
  let result = `## [${sourceTitle}](${sourceUrl})\n`;
  
  // Add metadata line
  const metadataParts = [];
  if (packageInfo) {
    metadataParts.push(`Package: ${packageInfo}`);
  }
  if (codeContext) {
    metadataParts.push(`Contains: ${codeContext}`);
  }
  metadataParts.push(`Relevance: ${(relevanceScore * 100).toFixed(1)}%`);
  
  result += `> ${metadataParts.join(' | ')}\n\n`;
  
  // Add content
  result += `${content}\n\n`;
  
  return result;
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

    // Process chunks into formatted responses
    const formattedResponses: FormattedResponse[] = similarChunks.map(chunk => 
      formatDocumentationResponse(chunk, params.query, params.context)
    );
    
    // Sort by adjusted relevance score
    formattedResponses.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Convert to formatted strings
    const formattedResults = formattedResponses.map(formatResponseString);

    // Build a summary response as the first result
    let summary = `# Documentation Results for: "${params.query}"\n\n`;
    summary += `Found ${formattedResponses.length} relevant documentation sources.\n\n`;
    
    if (params.context) {
      summary += `Code context was used to prioritize relevant results.\n\n`;
    }
    
    if (params.package) {
      summary += `Results filtered to package: ${params.package}\n\n`;
    }
    
    summary += "## Top Sources\n";
    formattedResponses.slice(0, 3).forEach((response, index) => {
      summary += `${index + 1}. [${response.sourceTitle}](${response.sourceUrl}) - ${response.packageInfo || 'Unknown Package'}\n`;
    });
    
    return {
      message: 'Found relevant documentation:',
      summary,
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
import { z } from 'zod';
import logger from '../../utils/logger';
import { ChunkService } from '../chunk.service';
import { PrismaClient } from '../../generated/prisma';
import { getPrismaClient as getMainPrismaClient } from '../../config/database';
import { CodeContextService } from '../code-context.service';
import { DocumentationMapperService } from '../documentation-mapper.service';
import { DocumentProcessorService } from '../document-processor.service';

// Define Zod schema for parameters
export const queryDocumentationSchema = {
  query: z.string().describe('The natural language query about documentation'),
  context: z.string().optional().describe('Optional code context to help refine the search'),
  package: z.string().optional().describe('Optional package name to filter results'),
  limit: z.number().int().positive().optional().default(5).describe('Maximum number of results to return')
};

// Explicitly define handler parameter type
type QueryDocumentationParams = {
  query: string;
  context?: string;
  package?: string;
  limit?: number;
  _prisma?: PrismaClient;
};

// --- Helper types and functions ---
interface DocumentationChunk {
  id: string;
  content: string;
  metadata: any;
  documentId: string;
  url: string;
  title: string;
  similarity: number;
}

interface FormattedResponse {
  content: string;
  citation: string;
  sourceUrl: string;
  sourceTitle: string;
  relevanceScore: number;
  packageInfo?: string;
  codeContext?: string;
}

function extractPackageInfo(chunk: DocumentationChunk): string {
  const packageFromMetadata = chunk.metadata?.package;
  if (packageFromMetadata) {
    const version = chunk.metadata?.version ? ` v${chunk.metadata.version}` : '';
    return `${packageFromMetadata}${version}`;
  }
  try {
    const url = new URL(chunk.url);
    const hostParts = url.hostname.split('.');
    if (hostParts.length > 1) {
      const possiblePackage = hostParts[0] === 'www' ? hostParts[1] : hostParts[0];
      if (possiblePackage !== 'github' && possiblePackage !== 'docs' && possiblePackage !== 'documentation') {
        return possiblePackage;
      }
    }
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return pathParts[0];
    }
  } catch (error) {}
  return 'Unknown Package';
}

function extractCodeContext(chunk: DocumentationChunk): string | undefined {
  const codeBlockMatch = chunk.content.match(/```([a-z]*)\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const language = codeBlockMatch[1] || 'unknown';
    const code = codeBlockMatch[2].trim();
    return `${language}: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`;
  }
  if (chunk.metadata?.type === 'code' || chunk.metadata?.language) {
    return `${chunk.metadata.language || 'code'} example`;
  }
  return undefined;
}

function adjustRelevanceScore(chunk: DocumentationChunk, query: string, context?: string): number {
  let score = chunk.similarity;
  if (context) {
    const contextIdentifiers = extractIdentifiersFromCode(context);
    const contentMatches = contextIdentifiers.filter(id =>
      chunk.content.includes(id) || (chunk.title && chunk.title.includes(id))
    );
    if (contentMatches.length > 0) {
      score += 0.1 * Math.min(contentMatches.length, 3);
    }
  }
  if (chunk.content.includes('```') || chunk.metadata?.type === 'code') {
    score += 0.05;
  }
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
  const titleMatches = queryTerms.filter(term => chunk.title.toLowerCase().includes(term));
  if (titleMatches.length > 0) {
    score += 0.1 * Math.min(titleMatches.length / queryTerms.length, 1);
  }
  return score;
}

function extractIdentifiersFromCode(code: string): string[] {
  const identifierRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  const matches = code.match(identifierRegex) || [];
  const commonKeywords = new Set([
    'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
    'return', 'class', 'import', 'export', 'default', 'from', 'require',
    'new', 'this', 'true', 'false', 'null', 'undefined'
  ]);
  return matches.filter(id => !commonKeywords.has(id.toLowerCase())).filter(id => id.length > 2);
}

function formatDocumentationResponse(chunk: DocumentationChunk, query: string, context?: string): FormattedResponse {
  const packageInfo = extractPackageInfo(chunk);
  const codeContext = extractCodeContext(chunk);
  const relevanceScore = adjustRelevanceScore(chunk, query, context);
  let content = chunk.content.trim();
  if (!content.includes('```') && codeContext) {
    const codeIndentRegex = /^( {4,}|\t+).*$/gm;
    if (codeIndentRegex.test(content)) {
      content = content.replace(/( {4,}|\t+)(.*\n)+/g, match => `\n\`\`\`\n${match.replace(/^ {4,}|\t+/gm, '')}\n\`\`\`\n`);
    }
  }
  const citation = packageInfo ? `${packageInfo} Documentation` : `Documentation Source`;
  return { content, citation, sourceUrl: chunk.url, sourceTitle: chunk.title, relevanceScore, packageInfo, codeContext };
}

function formatResponseString(response: FormattedResponse): string {
  const { content, citation, sourceUrl, sourceTitle, relevanceScore, packageInfo, codeContext } = response;
  let result = `## [${sourceTitle}](${sourceUrl})\n`;
  const metadataParts = [];
  if (packageInfo) metadataParts.push(`Package: ${packageInfo}`);
  if (codeContext) metadataParts.push(`Contains: ${codeContext}`);
  if (metadataParts.length > 0) {
    result += `*${metadataParts.join(' | ')} | Relevance: ${(relevanceScore * 100).toFixed(1)}%*\n`;
  }
  result += `\n${content}\n\n`;
  result += `_Source: [${citation}](${sourceUrl})_\n`;
  return result;
}

// Define the handler function matching SDK expectations
export const queryDocumentationHandler = async (params: QueryDocumentationParams) => {
  const prisma = params._prisma || getMainPrismaClient();
  const chunkService = new ChunkService(prisma);
  const codeContextService = new CodeContextService(prisma);
  const documentationMapperService = new DocumentationMapperService(prisma);
  const documentProcessorService = new DocumentProcessorService(prisma);

  logger.info(`Query documentation tool called with query: "${params.query}", context provided: ${!!params.context}, package filter: ${params.package}`);

  try {
    const limit = params.limit ?? 5;
    let searchResults: DocumentationChunk[] = [];
    let contextSummary = "No context provided."; // Default summary
    let packageFilterApplied: string | null = params.package || null;
    let queryToEmbed = params.query;

    if (params.context) {
      try {
        const contextAnalysis = await codeContextService.analyzeCodeContext(params.context);
        logger.debug('Context analysis complete', contextAnalysis);
        queryToEmbed = contextAnalysis.enhancedQuery || params.query; // Use enhanced query if available

        if (contextAnalysis.packages.length > 0 && !params.package) {
          // If context has packages and no explicit filter, use the first one for filtering
          packageFilterApplied = contextAnalysis.packages[0];
        }
        // Note: We removed summary/suggestions access here as they aren't returned by analyzeCodeContext
      } catch (contextError) {
          logger.error("Error during code context analysis:", contextError);
          // Proceed without context enhancement if analysis fails
          contextSummary = "Context analysis failed.";
      }
    }

    // Generate embedding for the final query
    logger.debug(`Generating embedding for query: "${queryToEmbed}"`);
    const queryEmbedding = await documentProcessorService.createEmbedding(queryToEmbed);
    logger.debug(`Applying package filter: ${packageFilterApplied || 'None'}`);

    // Perform search using findSimilarChunks
    searchResults = await chunkService.findSimilarChunks(
      queryEmbedding,
      limit * 2, // Fetch more results initially for potential re-ranking
      packageFilterApplied || undefined // Pass filter if available
    ) as DocumentationChunk[];
    logger.debug(`Found ${searchResults.length} initial similar chunks.`);

    // TODO: Add re-ranking logic here if needed, potentially using
    // contextAnalysis.relevantDocumentIds if that was available and fetched.
    // For now, we just format and sort based on initial similarity + adjustments.

    // Format results
    const formattedResults = searchResults
      .map((chunk: DocumentationChunk) => formatDocumentationResponse(chunk, params.query, params.context))
      .sort((a, b) => b.relevanceScore - a.relevanceScore) // Sort by final adjusted score
      .slice(0, limit); // Apply final limit

    // Combine results into a single text response
    const combinedResponse = formattedResults.length > 0
      ? formattedResults.map(formatResponseString).join('\n---\n')
      : "No relevant documentation found.";

    const finalSummary = `Query: "${queryToEmbed}"\nContext Analysis: ${contextSummary}\nResults Found: ${formattedResults.length}`;

    // Return simplified response for SDK
    return {
      content: [
        {
          type: 'text' as const,
          text: `${finalSummary}\n\n---\n\n${combinedResponse}`
        }
      ]
    };

  } catch (error) {
    logger.error('Error querying documentation:', error);
    return {
      content: [
        {
          type: 'text' as const,
          text: error instanceof Error ? error.message : 'Failed to query documentation'
        }
      ],
      isError: true
    };
  }
}; 
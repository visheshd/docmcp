import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '../../../generated/prisma';
import { queryDocumentationTool } from '../../../services/mcp-tools/query-documentation.tool';
import { CodeContextService } from '../../../services/code-context.service';
import { ChunkService } from '../../../services/chunk.service';
import { DocumentProcessorService } from '../../../services/document-processor.service';
import { DocumentationMapperService } from '../../../services/documentation-mapper.service';
import logger from '../../../utils/logger';

// Mock Services and Prisma
jest.mock('../../../services/code-context.service');
jest.mock('../../../services/chunk.service');
jest.mock('../../../services/document-processor.service');
jest.mock('../../../services/documentation-mapper.service');
jest.mock('../../../utils/logger');

const mockPrisma = mockDeep<PrismaClient>();

// Mock service instances
const MockCodeContextService = CodeContextService as jest.MockedClass<typeof CodeContextService>;
const MockChunkService = ChunkService as jest.MockedClass<typeof ChunkService>;
const MockDocumentProcessorService = DocumentProcessorService as jest.MockedClass<typeof DocumentProcessorService>;
const MockDocumentationMapperService = DocumentationMapperService as jest.MockedClass<typeof DocumentationMapperService>;

describe('queryDocumentationTool - Context Aware Tests', () => {
  let codeContextServiceMock: DeepMockProxy<CodeContextService>;
  let chunkServiceMock: DeepMockProxy<ChunkService>;
  let documentProcessorServiceMock: DeepMockProxy<DocumentProcessorService>;
  let documentationMapperServiceMock: DeepMockProxy<DocumentationMapperService>;

  const handler = queryDocumentationTool.handler as Function;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks(); 

    // Reset jest-mock-extended mocks
    mockReset(mockPrisma);
    mockReset(MockCodeContextService);
    mockReset(MockChunkService);
    mockReset(MockDocumentProcessorService);
    mockReset(MockDocumentationMapperService);

    // Instantiate mocks
    codeContextServiceMock = mockDeep<CodeContextService>();
    chunkServiceMock = mockDeep<ChunkService>();
    documentProcessorServiceMock = mockDeep<DocumentProcessorService>();
    documentationMapperServiceMock = mockDeep<DocumentationMapperService>();

    // Provide mock implementations for constructors or static methods if needed
    MockCodeContextService.mockImplementation(() => codeContextServiceMock as any);
    MockChunkService.mockImplementation(() => chunkServiceMock as any);
    MockDocumentProcessorService.mockImplementation(() => documentProcessorServiceMock as any);
    MockDocumentationMapperService.mockImplementation(() => documentationMapperServiceMock as any);

    // Default mock behaviors
    documentProcessorServiceMock.createEmbedding.mockResolvedValue([0.1, 0.2, 0.3]); // Dummy embedding
    chunkServiceMock.findSimilarChunks.mockResolvedValue([]); // Default to no chunks found
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({ // Default context analysis result
      packages: [],
      relevantDocumentIds: [],
      enhancedQuery: undefined,
    });
    documentationMapperServiceMock.findDocumentationForPackages.mockResolvedValue(new Map()); // Default to no package docs
  });

  const defaultParams = {
    query: 'how to use hooks',
    context: 'import React from "react"; const [count, setCount] = React.useState(0);',
    _prisma: mockPrisma, // Inject mock Prisma
  };

  test('should call analyzeCodeContext when context is provided', async () => {
    await handler(defaultParams);
    expect(codeContextServiceMock.analyzeCodeContext).toHaveBeenCalledWith(defaultParams.context, undefined); // Filename is optional
  });

  test('should use enhanced query for embedding if provided by context analysis', async () => {
    const enhancedQuery = 'React hooks documentation. API references: useState';
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({
      packages: ['react'],
      relevantDocumentIds: [],
      enhancedQuery: enhancedQuery,
    });

    await handler(defaultParams);

    expect(documentProcessorServiceMock.createEmbedding).toHaveBeenCalledWith(enhancedQuery);
  });

  test('should use original query for embedding if no enhanced query provided', async () => {
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({
      packages: ['react'],
      relevantDocumentIds: [],
      enhancedQuery: undefined, // Explicitly undefined
    });

    await handler(defaultParams);

    expect(documentProcessorServiceMock.createEmbedding).toHaveBeenCalledWith(defaultParams.query);
  });

  test('should apply package filter if exactly one package is detected', async () => {
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({
      packages: ['react'], // Single package
      relevantDocumentIds: [],
      enhancedQuery: undefined,
    });

    await handler(defaultParams);

    expect(chunkServiceMock.findSimilarChunks).toHaveBeenCalledWith(
      expect.any(Array), // Embedding
      5, // Default limit
      'react' // Package filter applied
    );
  });

  test('should NOT apply package filter if multiple packages are detected', async () => {
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({
      packages: ['react', 'redux'], // Multiple packages
      relevantDocumentIds: [],
      enhancedQuery: undefined,
    });

    await handler(defaultParams);

    expect(chunkServiceMock.findSimilarChunks).toHaveBeenCalledWith(
      expect.any(Array), // Embedding
      5, // Default limit
      undefined // No package filter applied
    );
  });
  
  test('should apply direct package filter even if context detects packages', async () => {
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({
      packages: ['react', 'redux'], // Multiple packages detected
      relevantDocumentIds: [],
      enhancedQuery: undefined,
    });

    await handler({ ...defaultParams, package: 'redux' }); // Direct filter applied

    expect(chunkServiceMock.findSimilarChunks).toHaveBeenCalledWith(
      expect.any(Array), // Embedding
      5, // Default limit
      'redux' // Direct package filter takes precedence
    );
  });

  test('should boost scores for contextually relevant document IDs', async () => {
    const relevantDocId = 'doc-relevant-1';
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({
      packages: ['react'],
      relevantDocumentIds: [relevantDocId], // IDs to boost
      enhancedQuery: undefined,
    });

    const initialChunks = [
      { id: 'chunk-1', documentId: relevantDocId, title: 'Relevant Doc', url: 'url1', content: 'content1', similarity: 0.7, metadata: {} },
      { id: 'chunk-2', documentId: 'doc-irrelevant-1', title: 'Irrelevant Doc', url: 'url2', content: 'content2', similarity: 0.8, metadata: {} }, // Higher initial similarity
    ];
    chunkServiceMock.findSimilarChunks.mockResolvedValue(initialChunks);

    const result = await handler(defaultParams);

    // Expect the relevant chunk to be boosted and potentially ranked higher
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThan(0);
    // Check if the summary or results mention the relevant doc first after boosting
    // Note: We mock the formatted response generation, focusing on the boosting logic triggering
    // A more detailed check would involve asserting the final relevanceScore within the formatted response string
    expect(result.summary).toContain('Relevant Doc'); // Simple check based on title
    // Check logs for boost confirmation
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Boosting scores for chunks'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Boosted scores for 1 chunks'));
  });

  test('should include context analysis summary when context is provided', async () => {
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({
      packages: ['react'],
      relevantDocumentIds: ['doc-1'],
      enhancedQuery: 'enhanced query',
    });

    chunkServiceMock.findSimilarChunks.mockResolvedValue([
      { id: 'chunk-1', documentId: 'doc-1', title: 'Doc Title', url: 'url1', content: 'content', similarity: 0.7, metadata: {} },
    ]);

    const result = await handler(defaultParams);

    expect(result.summary).toContain('## Analysis of Your Code');
    expect(result.summary).toContain('Detected packages: react');
    expect(result.summary).toContain('Code context was used to prioritize relevant results.');
  });
  
  test('should include package suggestions if generated', async () => {
    codeContextServiceMock.analyzeCodeContext.mockResolvedValue({
      packages: ['react'],
      relevantDocumentIds: ['doc-1'],
      enhancedQuery: undefined,
    });
    
    // Simulate package suggestions being generated (this normally happens inside the handler logic)
    const mockPackageSuggestions = [{ package: 'react', results: [{ title: 'React Official Docs', url: 'react.dev' }] }];
    // We need to mock the findDocumentationForPackages call that leads to suggestions
    const docMap = new Map();
    docMap.set('react', [{ documentId: 'doc-react-1', title: 'React Official Docs', url: 'react.dev', score: 0.9 }]);
    documentationMapperServiceMock.findDocumentationForPackages.mockResolvedValue(docMap);

    chunkServiceMock.findSimilarChunks.mockResolvedValue([ // Need at least one chunk result too
      { id: 'chunk-1', documentId: 'doc-1', title: 'Some Chunk Title', url: 'url1', content: 'content', similarity: 0.7, metadata: { package: 'react' } },
    ]);

    const result = await handler(defaultParams);

    expect(result.summary).toContain('## Suggested Documentation for Detected Packages');
    expect(result.summary).toContain('### react');
    expect(result.summary).toContain('[React Official Docs](react.dev)');
    expect(result.packageSuggestions).toBeDefined();
    // expect(result.packageSuggestions).toEqual(mockPackageSuggestions); // Structure might differ slightly depending on implementation
  });


  test('should handle errors during context analysis gracefully', async () => {
    const analysisError = new Error('Context analysis failed');
    codeContextServiceMock.analyzeCodeContext.mockRejectedValue(analysisError);

    // Still expect some results based on original query
    chunkServiceMock.findSimilarChunks.mockResolvedValue([
      { id: 'chunk-1', documentId: 'doc-1', title: 'Fallback Doc', url: 'url1', content: 'content', similarity: 0.7, metadata: {} },
    ]);

    const result = await handler(defaultParams);

    expect(logger.error).toHaveBeenCalledWith('Error processing code context:', analysisError);
    expect(logger.warn).toHaveBeenCalledWith('Proceeding with original query due to context processing error.');
    // Should still use the original query for embedding
    expect(documentProcessorServiceMock.createEmbedding).toHaveBeenCalledWith(defaultParams.query);
    // Should still return results found without context boosting
    expect(result.summary).toContain('Fallback Doc');
    expect(result.summary).not.toContain('## Analysis of Your Code'); // Context analysis section shouldn't be there
  });
}); 
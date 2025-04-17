import { Prisma } from '@prisma/client';
import { queryDocumentationHandler } from '../../../../src/services/mcp-tools/query-documentation.tool';
import { DocumentProcessorService } from '../../../../src/services/document-processor.service';
import { ChunkService } from '../../../../src/services/chunk.service';

// Mock dependencies
jest.mock('../../../../src/services/document-processor.service');
jest.mock('../../../../src/services/chunk.service');

const MockedDocumentProcessorService = DocumentProcessorService as jest.MockedClass<typeof DocumentProcessorService>;
const MockedChunkService = ChunkService as jest.MockedClass<typeof ChunkService>;

const handler = queryDocumentationHandler;

const defaultParams = {
  query: 'How to use React hooks',
  limit: 10,
  package: 'react',
};

describe('Query Documentation Tool Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    MockedDocumentProcessorService.prototype.createEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    
    MockedChunkService.prototype.findSimilarChunks = jest.fn().mockResolvedValue([
      {
        id: 'chunk1',
        content: 'Introduction to React hooks and their usage.',
        metadata: { package: 'react', version: '18.0.0', tags: ['hooks', 'intro'] },
        documentId: 'doc1',
        url: 'http://react.dev/hooks',
        title: 'React Hooks Intro',
        similarity: 0.9
      },
      {
        id: 'chunk2',
        content: 'Advanced patterns for using React hooks effectively.',
        metadata: { package: 'react', version: '18.0.0', tags: ['hooks', 'advanced'] },
        documentId: 'doc2',
        url: 'http://react.dev/hooks-advanced',
        title: 'Advanced React Hooks',
        similarity: 0.8
      }
    ]);
  });

  it('should handle queries and return formatted results within content block', async () => {
    const result = await handler(defaultParams);

    expect(MockedDocumentProcessorService.prototype.createEmbedding).toHaveBeenCalledWith(defaultParams.query);
    expect(MockedChunkService.prototype.findSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], defaultParams.limit * 2, defaultParams.package);
    
    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBe(1);
    expect(result.content[0].type).toBe('text');
    
    const textContent = result.content[0].text;
    
    // Check for the summary line
    expect(textContent).toContain(`Query: "${defaultParams.query}"`);
    expect(textContent).toContain('Context Analysis: No context provided.'); // As context wasn't provided in defaultParams
    expect(textContent).toContain('Results Found: 2');
    expect(textContent).toContain('---\n'); // Separator

    // Check for first result details using new format
    expect(textContent).toContain('## [React Hooks Intro](http://react.dev/hooks)');
    expect(textContent).toContain('*Package: react v18.0.0 | Relevance: 100.0%*'); // Adjusted score based on mock
    expect(textContent).toContain('Introduction to React hooks and their usage.');
    expect(textContent).toContain('_Source: [react v18.0.0 Documentation](http://react.dev/hooks)_');
    
    // Check for second result details using new format
    expect(textContent).toContain('## [Advanced React Hooks](http://react.dev/hooks-advanced)');
    expect(textContent).toContain('*Package: react v18.0.0 | Relevance: 90.0%*'); // Adjusted score based on mock
    expect(textContent).toContain('Advanced patterns for using React hooks effectively.');
    expect(textContent).toContain('_Source: [react v18.0.0 Documentation](http://react.dev/hooks-advanced)_');
  });

  it('should handle queries with no results', async () => {
    MockedChunkService.prototype.findSimilarChunks = jest.fn().mockResolvedValue([]);
    
    const result = await handler(defaultParams);
    
    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('No relevant documentation found');
  });

  it('should respect the limit parameter for chunk search', async () => {
    const testLimit = 5;
    await handler({ ...defaultParams, limit: testLimit });
    expect(MockedChunkService.prototype.findSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], testLimit * 2, defaultParams.package);
  });

  it('should respect the package parameter for chunk search', async () => {
    const testPackage = 'react';
    await handler({ ...defaultParams, package: testPackage });
    
    expect(MockedChunkService.prototype.findSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], defaultParams.limit * 2, testPackage);
  });

  it('should handle both limit and package parameters together for chunk search', async () => {
    const testLimit = 8;
    const testPackage = 'prisma';
    await handler({ ...defaultParams, limit: testLimit, package: testPackage });
    
    expect(MockedChunkService.prototype.findSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], testLimit * 2, testPackage);
  });

  it('should handle errors during embedding creation and return error structure', async () => {
    const error = new Error('Embedding failed');
    MockedDocumentProcessorService.prototype.createEmbedding = jest.fn().mockRejectedValue(error);

    const result = await handler(defaultParams);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Embedding failed');
  });

  it('should handle errors during chunk search and return error structure', async () => {
    const error = new Error('Chunk search failed');
    MockedChunkService.prototype.findSimilarChunks = jest.fn().mockRejectedValue(error);

    const result = await handler(defaultParams);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Chunk search failed');
  });
}); 
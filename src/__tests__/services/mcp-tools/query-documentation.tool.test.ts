import { queryDocumentationTool } from '../../../services/mcp-tools/query-documentation.tool';
import { ChunkService } from '../../../services/chunk.service';
import { DocumentProcessorService } from '../../../services/document-processor.service';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');
jest.mock('../../../services/chunk.service');
jest.mock('../../../services/document-processor.service');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedChunkService = ChunkService as jest.MockedClass<typeof ChunkService>;
const mockedDocumentProcessorService = DocumentProcessorService as jest.MockedClass<typeof DocumentProcessorService>;

describe('Query Documentation Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock DocumentProcessorService.createEmbedding
    mockedDocumentProcessorService.prototype.createEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    
    // Mock ChunkService.findSimilarChunks
    mockedChunkService.prototype.findSimilarChunks = jest.fn().mockResolvedValue([
      {
        id: 'chunk1',
        content: 'Test content for the documentation',
        metadata: { tags: ['test'] },
        documentId: 'doc1',
        url: 'https://example.com/docs',
        title: 'Test Documentation',
        similarity: 0.95
      }
    ]);
  });

  it('should handle queries and return formatted results', async () => {
    // Execute the handler function
    const result = await queryDocumentationTool.handler({
      query: 'How do I use this API?'
    });

    // Verify DocumentProcessorService.createEmbedding was called
    expect(mockedDocumentProcessorService.prototype.createEmbedding).toHaveBeenCalledWith('How do I use this API?');
    
    // Verify ChunkService.findSimilarChunks was called with the embedding
    expect(mockedChunkService.prototype.findSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5);
    
    // Verify results format
    expect(result).toHaveProperty('message', 'Found relevant documentation:');
    expect(result).toHaveProperty('results');
    expect(result.results).toBeInstanceOf(Array);
    expect(result.results[0]).toContain('[Test Documentation](https://example.com/docs)');
    expect(result.results[0]).toContain('Test content for the documentation');
  });

  it('should handle queries with no results', async () => {
    // Mock ChunkService to return no results
    mockedChunkService.prototype.findSimilarChunks = jest.fn().mockResolvedValue([]);
    
    // Execute the handler function
    const result = await queryDocumentationTool.handler({
      query: 'Non-existent documentation'
    });
    
    // Verify results format for no matches
    expect(result).toHaveProperty('message', 'No relevant documentation found for your query.');
    expect(result).toHaveProperty('results');
    expect(result.results).toBeInstanceOf(Array);
    expect(result.results.length).toBe(0);
  });

  it('should respect the limit parameter', async () => {
    // Execute the handler function with a custom limit
    await queryDocumentationTool.handler({
      query: 'API documentation',
      limit: 10
    });
    
    // Verify the limit was passed to findSimilarChunks
    expect(mockedChunkService.prototype.findSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 10, undefined);
  });

  it('should respect the package parameter', async () => {
    // Execute the handler function with a package filter
    await queryDocumentationTool.handler({
      query: 'API documentation',
      package: 'react'
    });
    
    // Verify the package parameter was passed to findSimilarChunks
    expect(mockedChunkService.prototype.findSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, 'react');
  });

  it('should handle both limit and package parameters together', async () => {
    // Execute the handler function with both limit and package
    await queryDocumentationTool.handler({
      query: 'API documentation',
      limit: 8,
      package: 'prisma'
    });
    
    // Verify both parameters were passed correctly
    expect(mockedChunkService.prototype.findSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 8, 'prisma');
  });

  it('should handle errors during embedding generation', async () => {
    // Mock DocumentProcessorService to throw an error
    mockedDocumentProcessorService.prototype.createEmbedding = jest.fn().mockRejectedValue(new Error('Embedding generation failed'));
    
    // Execute the handler function and expect it to throw
    await expect(queryDocumentationTool.handler({
      query: 'Test query'
    })).rejects.toThrow('Embedding generation failed');
  });
}); 
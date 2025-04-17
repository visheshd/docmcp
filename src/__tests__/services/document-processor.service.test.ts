import { DocumentProcessorService } from '../../services/document-processor.service';
import { DocumentService } from '../../services/document.service';
import { ChunkService } from '../../services/chunk.service';
import { getTestPrismaClient } from '../utils/testDb';
import axios from 'axios';
import config from '../../config';

// Mock the DocumentService and ChunkService
jest.mock('../../services/document.service');
jest.mock('../../services/chunk.service');
// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DocumentProcessorService', () => {
  let documentProcessorService: DocumentProcessorService;
  let mockDocumentService: jest.Mocked<DocumentService>;
  let mockChunkService: jest.Mocked<ChunkService>;
  const prisma = getTestPrismaClient();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock DocumentService
    mockDocumentService = {
      updateDocument: jest.fn().mockResolvedValue({ id: 'test-doc-id' }),
      findDocumentById: jest.fn().mockResolvedValue(null),
      createDocument: jest.fn().mockResolvedValue({ id: 'test-doc-id' }),
    } as unknown as jest.Mocked<DocumentService>;
    
    // Create a mock ChunkService
    mockChunkService = {
      createChunk: jest.fn().mockResolvedValue(undefined),
      createManyChunks: jest.fn().mockResolvedValue(undefined),
      findSimilarChunks: jest.fn().mockResolvedValue([]),
      deleteChunksByDocumentId: jest.fn().mockResolvedValue(undefined),
      // Add any other methods from ChunkService if they are used indirectly
    } as unknown as jest.Mocked<ChunkService>;
    
    // Reset axios mock completely before each test
    mockedAxios.post.mockReset();
    
    // Create the service with mocks
    documentProcessorService = new DocumentProcessorService(prisma, mockDocumentService, mockChunkService);
  });
  
  describe('processDocument', () => {
    // Define a standard successful mock response for tests that don't focus on errors
    const mockSuccessfulEmbedding = (embeddingData = [0.1, 0.2, 0.3]) => {
      mockedAxios.post.mockResolvedValue({ data: { embedding: embeddingData } });
    };
    
    it('should generate embeddings and call createManyChunks', async () => {
      const documentId = 'test-doc-id';
      const html = `<html><body><h1>Title</h1><p>Chunk 1 content.</p><h2>Subtitle</h2><p>Chunk 2 content.</p></body></html>`;
      const dummyEmbedding1 = Array(384).fill(0.1); // Dimension based on granite-30m
      const dummyEmbedding2 = Array(384).fill(0.2);

      // Mock the Ollama API response
      mockedAxios.post
        .mockResolvedValueOnce({ data: { embedding: dummyEmbedding1 } }) // First call for first chunk
        .mockResolvedValueOnce({ data: { embedding: dummyEmbedding2 } }); // Second call for second chunk

      await documentProcessorService.processDocument(documentId, html);

      // Verify axios was called for each chunk
      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Assuming 2 chunks are generated
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings', // Ensure this matches the service config
        expect.objectContaining({ prompt: expect.stringContaining('Chunk 1 content') })
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({ prompt: expect.stringContaining('Chunk 2 content') })
      );

      // Verify createManyChunks was called with the embeddings
      expect(mockChunkService.createManyChunks).toHaveBeenCalledTimes(1);
      expect(mockChunkService.createManyChunks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ documentId, embedding: dummyEmbedding1 }),
          expect.objectContaining({ documentId, embedding: dummyEmbedding2 })
        ]),
        documentId
      );
      
      // Verify document update still happens
      expect(mockDocumentService.updateDocument).toHaveBeenCalledTimes(1);
    });

    it('should handle Ollama API errors gracefully', async () => {
      const documentId = 'test-doc-id';
      const html = `<html><body><h1>Title</h1><p>Chunk 1 content.</p><h2>Subtitle</h2><p>Chunk 2 content.</p></body></html>`;
      const dummyEmbedding2 = Array(384).fill(0.2);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Custom mock implementation for axios.post for this test
      let callCount = 0;
      mockedAxios.post.mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) { // Fail the first 3 attempts (for the first chunk's retries)
          const connectionError = {
            message: 'Ollama connection refused',
            code: 'ECONNREFUSED',
            response: undefined // Ensure response is undefined
          };
          return Promise.reject(connectionError);
        } else { // Succeed on the 4th call (for the second chunk)
          return Promise.resolve({ data: { embedding: dummyEmbedding2 } });
        }
      });

      await documentProcessorService.processDocument(documentId, html);

      // Verify axios was called 4 times (3 failed + 1 successful)
      expect(mockedAxios.post).toHaveBeenCalledTimes(4);

      // Verify createManyChunks was called only with the successful embedding
      expect(mockChunkService.createManyChunks).toHaveBeenCalledTimes(1);
      expect(mockChunkService.createManyChunks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ documentId, embedding: dummyEmbedding2 })
        ]),
        documentId
      );
      expect(mockChunkService.createManyChunks).not.toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining('Chunk 1 content') })
        ]),
        expect.anything()
      );

      // Verify document update still happens
      expect(mockDocumentService.updateDocument).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });
    
    it('should convert HTML to markdown', async () => {
      mockSuccessfulEmbedding(); // Add default success mock
      const documentId = 'test-doc-id';
      const html = `
        <html>
          <head>
            <title>Test Document</title>
            <meta name="package" content="test-package">
            <meta name="version" content="1.0.0">
          </head>
          <body>
            <header>This should be removed</header>
            <main>
              <h1>Main Heading</h1>
              <p>This is a paragraph with <strong>bold</strong> text.</p>
              <pre><code class="language-javascript">
                function test() {
                  console.log('Hello world');
                }
              </code></pre>
              <table>
                <tr>
                  <th>Header 1</th>
                  <th>Header 2</th>
                </tr>
                <tr>
                  <td>Value 1</td>
                  <td>Value 2</td>
                </tr>
              </table>
            </main>
            <footer>This should be removed</footer>
          </body>
        </html>
      `;
      
      const markdown = await documentProcessorService.processDocument(documentId, html);
      
      // Verify basic conversion worked
      expect(markdown).toContain('# Main Heading');
      expect(markdown).toContain('This is a paragraph with **bold** text.');
      expect(markdown).toContain('function test()');
      expect(markdown).toContain('| Header 1 | Header 2 |');
      expect(markdown).toContain('| Value 1 | Value 2 |');
      
      // Verify headers and footers were removed
      expect(markdown).not.toContain('This should be removed');
      
      // Verify the DocumentService was called to update the document
      expect(mockDocumentService.updateDocument).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          content: expect.any(String),
          metadata: expect.objectContaining({
            title: expect.any(String),
            package: 'test-package',
            version: '1.0.0',
          }),
        })
      );
    });
    
    it('should handle empty HTML', async () => {
      // No axios call expected for empty HTML, so no mock needed here
      const documentId = 'test-doc-id';
      const html = '';
      
      const markdown = await documentProcessorService.processDocument(documentId, html);
      
      expect(markdown).toBe('');
      
      // Verify the DocumentService was still called
      expect(mockDocumentService.updateDocument).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          content: '',
        })
      );
    });
    
    it('should extract metadata from HTML', async () => {
      mockSuccessfulEmbedding(); // Add default success mock
      const documentId = 'test-doc-id';
      const html = `
        <html>
          <head>
            <title>Test Document</title>
            <meta name="package" content="test-package">
            <meta name="version" content="1.0.0">
          </head>
          <body>
            <h1>Main Heading</h1>
            <h2>Subheading 1</h2>
            <p>Content for subheading 1.</p>
            <h2>Subheading 2</h2>
            <p>Content for subheading 2.</p>
            <a href="https://example.com">Example Link</a>
          </body>
        </html>
      `;
      
      await documentProcessorService.processDocument(documentId, html);
      
      // Verify the DocumentService was called with the correct metadata
      expect(mockDocumentService.updateDocument).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            title: 'Test Document',
            package: 'test-package',
            version: '1.0.0',
            headings: expect.arrayContaining([
              expect.objectContaining({ 
                level: 1, 
                text: 'Main Heading' 
              }),
              expect.objectContaining({ 
                level: 2, 
                text: 'Subheading 1' 
              }),
              expect.objectContaining({ 
                level: 2, 
                text: 'Subheading 2' 
              })
            ]),
            links: expect.arrayContaining([
              expect.objectContaining({
                text: 'Example Link',
                href: 'https://example.com'
              })
            ]),
            type: 'documentation',
          }),
        })
      );
    });
    
    it('should handle code blocks properly', async () => {
      mockSuccessfulEmbedding(); // Add default success mock
      const documentId = 'test-doc-id';
      const html = `
        <html>
          <body>
            <h1>Code Example</h1>
            <pre><code class="language-javascript">
              function hello() {
                return "world";
              }
            </code></pre>
            <pre><code class="language-python">
              def hello():
                  return "world"
            </code></pre>
          </body>
        </html>
      `;
      
      const markdown = await documentProcessorService.processDocument(documentId, html);
      
      // Verify code blocks are converted with language tags
      expect(markdown).toMatch(/```javascript\n\s*function hello\(\)/);
      expect(markdown).toMatch(/```python\n\s*def hello\(\):/);
      
      // Verify metadata extraction
      expect(mockDocumentService.updateDocument).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            codeBlocks: expect.arrayContaining([
              expect.objectContaining({
                language: 'javascript',
              }),
              expect.objectContaining({
                language: 'python',
              })
            ]),
          }),
        })
      );
    });
    
    it('should handle tables properly', async () => {
      mockSuccessfulEmbedding(); // Add default success mock
      const documentId = 'test-doc-id';
      const html = `
        <html>
          <body>
            <h1>Table Example</h1>
            <table>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>Role</th>
              </tr>
              <tr>
                <td>John</td>
                <td>30</td>
                <td>Developer</td>
              </tr>
              <tr>
                <td>Jane</td>
                <td>28</td>
                <td>Designer</td>
              </tr>
            </table>
          </body>
        </html>
      `;
      
      const markdown = await documentProcessorService.processDocument(documentId, html);
      
      // Verify table formatting
      expect(markdown).toContain('| Name | Age | Role |');
      expect(markdown).toContain('| --- | --- | --- |');
      expect(markdown).toContain('| John | 30 | Developer |');
      expect(markdown).toContain('| Jane | 28 | Designer |');
      
      // Verify metadata extraction
      expect(mockDocumentService.updateDocument).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            tableCount: 1,
          }),
        })
      );
    });

    it('should use fixed-size chunking when configured', async () => {
      mockSuccessfulEmbedding(); // Add default success mock
      const documentId = 'test-doc-id';
      // Ensure config mock uses fixed strategy for this test
      const originalStrategy = config.chunking.strategy;
      config.chunking.strategy = 'fixed';
      config.chunking.fixedChunkSize = 15;
      config.chunking.fixedChunkOverlap = 5;

      const html = `<html><body><p>This is the first part.</p><p>This is the second part.</p></body></html>`;
      // Markdown: "This is the first part.\n\nThis is the second part."
      const expectedMarkdown = 'This is the first part.\n\nThis is the second part.';
      const expectedChunk1 = expectedMarkdown.substring(0, 15); // "This is the fir"
      const expectedChunk2 = expectedMarkdown.substring(10, 25); // "e first part.\n\nTh"
      const expectedChunk3 = expectedMarkdown.substring(20, 35); // "t part.\n\nThis is"
      const expectedChunk4 = expectedMarkdown.substring(30, 45); // "is is the secon"
      const expectedChunk5 = expectedMarkdown.substring(40, 55); // " the second part."

      const dummyEmbedding = Array(384).fill(0.3);
      mockedAxios.post.mockResolvedValue({ data: { embedding: dummyEmbedding } });

      await documentProcessorService.processDocument(documentId, html);

      // Verify createManyChunks was called with fixed-size chunks
      expect(mockChunkService.createManyChunks).toHaveBeenCalledTimes(1);
      const passedChunksArgs = mockChunkService.createManyChunks.mock.calls[0][0] as Array<{ content: string; metadata: any }>; // Type assertion
      expect(passedChunksArgs.length).toBe(5);
      expect(passedChunksArgs[0].content).toBe(expectedChunk1);
      expect(passedChunksArgs[1].content).toBe(expectedChunk2);
      expect(passedChunksArgs[2].content).toBe(expectedChunk3);
      expect(passedChunksArgs[3].content).toBe(expectedChunk4);
      expect(passedChunksArgs[4].content).toBe(expectedChunk5);
      // Safely access metadata
      expect(passedChunksArgs[0]?.metadata?.chunkIndex).toBe(0);
      expect(passedChunksArgs[1]?.metadata?.chunkIndex).toBe(1);
      expect(passedChunksArgs[0]?.metadata?.start).toBe(0);
      expect(passedChunksArgs[0]?.metadata?.end).toBe(15);
      expect(passedChunksArgs[1]?.metadata?.start).toBe(10); // 15 - 5
      expect(passedChunksArgs[1]?.metadata?.end).toBe(25);
      
      // Restore original config strategy
      config.chunking.strategy = originalStrategy;
    });
  });
}); 
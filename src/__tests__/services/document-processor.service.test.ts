import { DocumentProcessorService } from '../../services/document-processor.service';
import { DocumentService } from '../../services/document.service';
import { getTestPrismaClient } from '../utils/testDb';

// Mock the DocumentService
jest.mock('../../services/document.service');

describe('DocumentProcessorService', () => {
  let documentProcessorService: DocumentProcessorService;
  const prisma = getTestPrismaClient();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementation for DocumentService
    (DocumentService as jest.Mock).mockImplementation(() => ({
      updateDocument: jest.fn().mockResolvedValue({ id: 'test-doc-id' }),
      findDocumentById: jest.fn().mockResolvedValue(null),
      createDocument: jest.fn().mockResolvedValue({ id: 'test-doc-id' }),
    }));
    
    documentProcessorService = new DocumentProcessorService(prisma);
  });
  
  describe('processDocument', () => {
    it('should convert HTML to markdown', async () => {
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
      const documentServiceMock = (DocumentService as jest.Mock).mock.instances[0];
      expect(documentServiceMock.updateDocument).toHaveBeenCalledWith(
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
      const documentId = 'test-doc-id';
      const html = '';
      
      const markdown = await documentProcessorService.processDocument(documentId, html);
      
      expect(markdown).toBe('');
      
      // Verify the DocumentService was still called
      const documentServiceMock = (DocumentService as jest.Mock).mock.instances[0];
      expect(documentServiceMock.updateDocument).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          content: '',
        })
      );
    });
    
    it('should extract metadata from HTML', async () => {
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
      const documentServiceMock = (DocumentService as jest.Mock).mock.instances[0];
      expect(documentServiceMock.updateDocument).toHaveBeenCalledWith(
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
      const documentServiceMock = (DocumentService as jest.Mock).mock.instances[0];
      expect(documentServiceMock.updateDocument).toHaveBeenCalledWith(
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
      const documentServiceMock = (DocumentService as jest.Mock).mock.instances[0];
      expect(documentServiceMock.updateDocument).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            tableCount: 1,
          }),
        })
      );
    });
  });
}); 
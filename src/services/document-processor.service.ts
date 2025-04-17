import TurndownService from 'turndown';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import { JSDOM } from 'jsdom';
import { getPrismaClient as getMainPrismaClient } from '../config/database';
import { PrismaClient } from '../generated/prisma';
import logger from '../utils/logger';
import { ChunkService } from './chunk.service';
import { DocumentService } from './document.service';
import axios from 'axios';
import config from '../config'; // Import the config

// Define the metadata structure
interface MetadataExtracted {
  title: string;
  headings: { level: number; text: string; id?: string }[];
  codeBlocks: { language: string; code: string }[];
  tableCount: number;
  sectionCount: number;
  links: { text: string; href: string }[];
  package?: string;
  version?: string;
  type?: string;
  tags?: string[];
}

// Define the document chunk interface
interface DocumentChunk {
  content: string;
  metadata: {
    title: string;
    sectionHeading?: string;
    parentHeading?: string;
    headingLevel?: number;
    sectionIndex?: number;
    language?: string;
    chunkIndex?: number;
    start?: number;
    end?: number;
    order: number;
    type: 'content' | 'code' | 'table';
  };
}

export class DocumentProcessorService {
  private prisma: PrismaClient;
  private turndownService: TurndownService;
  private markdownIt: MarkdownIt;
  private chunkService: ChunkService;
  private documentService: DocumentService;

  constructor(prismaClient?: PrismaClient, documentService?: DocumentService, chunkService?: ChunkService) {
    this.prisma = prismaClient || getMainPrismaClient();
    this.chunkService = chunkService || new ChunkService(this.prisma);
    this.documentService = documentService || new DocumentService(this.prisma);
    
    // Initialize Turndown for HTML to Markdown conversion
    this.turndownService = new TurndownService({
      headingStyle: 'atx',       // Use # style headings
      codeBlockStyle: 'fenced',  // Use ```code``` style blocks
      emDelimiter: '_',          // Use _text_ for emphasis
      hr: '---',                 // Use --- for horizontal rules
      bulletListMarker: '-',     // Use - for bullet lists
    });
    
    // Configure turndown to better handle code blocks
    this.configureCodeBlocks();
    
    // Configure turndown to better handle tables
    this.configureTables();
    
    // Initialize markdown-it for any additional processing
    this.markdownIt = new MarkdownIt({
      html: true,          // Enable HTML tags in source
      xhtmlOut: true,      // Use '/' to close single tags (<br />)
      breaks: true,        // Convert '\n' in paragraphs into <br>
      linkify: true,       // Autoconvert URL-like text to links
      typographer: true,   // Enable some language-neutral replacement + quotes beautification
      highlight: (str, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(str, { language: lang }).value;
          } catch (error) {
            logger.error(`Failed to highlight code block with language ${lang}:`, error);
          }
        }
        return ''; // Use default escaping
      }
    });
  }

  /**
   * Process an HTML document and convert it to a clean markdown format
   */
  async processDocument(documentId: string, html: string, metadata: any = {}): Promise<string> {
    try {
      // Clean the HTML content first
      const cleanedHtml = this.cleanHtml(html);
      
      // Convert the cleaned HTML to Markdown
      const markdown = this.convertToMarkdown(cleanedHtml);
      
      // Extract additional metadata from the document
      const extractedMetadata = this.extractMetadata(cleanedHtml, markdown);
      
      // Merge extracted metadata with provided metadata
      const mergedMetadata = {
        ...extractedMetadata,
        ...metadata,
      };
      
      // Chunk the document for efficient storage and retrieval
      const chunks = this.chunkDocument(markdown, mergedMetadata);
      
      // Create embeddings for chunks and store them
      await this.createChunkEmbeddings(chunks, documentId);
      
      // Update the document with processed markdown and metadata
      await this.documentService.updateDocument(documentId, {
        content: markdown,
        metadata: mergedMetadata,
      });
      
      return markdown;
    } catch (error) {
      logger.error(`Error processing document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Clean HTML content by removing unnecessary elements and attributes
   */
  private cleanHtml(html: string): string {
    try {
      // Use JSDOM to parse HTML
      const dom = new JSDOM(html);
      const { document } = dom.window;
      
      // Find and remove navigation elements
      const navigationSelectors = [
        'nav', 
        'header', 
        'footer', 
        '.navigation', 
        '.nav', 
        '.menu',
        '.sidebar',
        '#sidebar',
        '#navigation',
        '.site-header',
        '.site-footer'
      ];
      
      navigationSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      });
      
      // Remove script and style tags
      ['script', 'style', 'iframe', 'noscript'].forEach(tag => {
        const elements = document.querySelectorAll(tag);
        elements.forEach(el => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      });
      
      // Remove analytics, tracking, and ad-related elements
      const adSelectors = [
        '[id*="google"]',
        '[id*="ad-"]',
        '[id*="analytics"]',
        '[class*="ad-"]',
        '[class*="advertisement"]',
        '[data-ad]'
      ];
      
      adSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (el.parentNode) {
              el.parentNode.removeChild(el);
            }
          });
        } catch (error) {
          // Some complex selectors might fail, we can safely ignore those
          logger.debug(`Failed to query selector: ${selector}`);
        }
      });
      
      // Return the cleaned HTML
      return dom.serialize();
    } catch (error) {
      logger.error('Error cleaning HTML:', error);
      return html; // Return original HTML if cleaning fails
    }
  }

  /**
   * Convert HTML to Markdown using Turndown
   */
  private convertToMarkdown(html: string): string {
    const markdown = this.turndownService.turndown(html);
    return this.normalizeMarkdown(markdown);
  }

  /**
   * Normalize markdown content for consistency
   */
  private normalizeMarkdown(markdown: string): string {
    let normalized = markdown;
    
    // Fix common markdown inconsistencies
    normalized = this.fixConsecutiveHeadings(normalized);
    normalized = this.fixExcessiveNewlines(normalized);
    normalized = this.fixListSpacing(normalized);
    normalized = this.standardizeLinks(normalized);
    
    return normalized;
  }
  
  /**
   * Fix cases where headings are directly adjacent without content between them
   */
  private fixConsecutiveHeadings(markdown: string): string {
    // Add a line break between consecutive headings
    return markdown.replace(/^(#{1,6} .+?)(\n)(#{1,6} .+?)$/gm, '$1\n$2$3');
  }
  
  /**
   * Remove excessive newlines to normalize spacing
   */
  private fixExcessiveNewlines(markdown: string): string {
    // Replace 3+ consecutive newlines with just 2
    return markdown.replace(/\n{3,}/g, '\n\n');
  }
  
  /**
   * Fix spacing around lists for better readability
   */
  private fixListSpacing(markdown: string): string {
    // Ensure there's a blank line before lists
    let normalized = markdown.replace(/([^\n])\n([-*+] )/g, '$1\n\n$2');
    
    // Ensure there's proper indentation for nested lists
    normalized = normalized.replace(/\n([-*+] .*)\n\s*([-*+] )/g, '\n$1\n    $2');
    
    return normalized;
  }
  
  /**
   * Standardize link formats in markdown
   */
  private standardizeLinks(markdown: string): string {
    // Convert HTML links to markdown format
    let normalized = markdown.replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, '[$2]($1)');
    
    // Fix link references: [text] [ref] -> [text][ref]
    normalized = normalized.replace(/\[([^\]]+)\] \[([^\]]+)\]/g, '[$1][$2]');
    
    return normalized;
  }

  /**
   * Configure how code blocks are processed
   */
  private configureCodeBlocks(): void {
    // Add rule for handling <pre><code> blocks with language detection
    this.turndownService.addRule('fencedCodeBlocks', {
      filter: function(node) {
        return (
          node.nodeName === 'PRE' &&
          node.firstChild !== null &&
          node.firstChild.nodeName === 'CODE'
        );
      },
      replacement: function(content, node) {
        const code = node.firstChild as HTMLElement;
        let language = '';
        
        // Try to detect language from class
        if (code.classList && code.classList.length > 0) {
          for (let i = 0; i < code.classList.length; i++) {
            const className = code.classList[i];
            if (
              className.startsWith('language-') ||
              className.startsWith('lang-')
            ) {
              language = className.replace(/^(language-|lang-)/, '');
              break;
            }
          }
        }
        
        // Clean up the content - remove leading/trailing whitespace
        const cleanContent = content.trim();
        
        // Return fenced code block with language (if detected)
        return `\n\`\`\`${language}\n${cleanContent}\n\`\`\`\n`;
      }
    });
  }

  /**
   * Configure how tables are processed
   */
  private configureTables(): void {
    // Use a standard table handling approach with clean headers and content
    this.turndownService.addRule('tableSimple', {
      filter: 'table',
      replacement: function(content, node) {
        // Create a markdown table string
        let markdown = '\n';
        
        // Convert the node to a DOM element and get all rows
        const rows = Array.from(node.querySelectorAll('tr'));
        if (!rows || rows.length === 0) {
          return content; // Fall back to default handling
        }
        
        // Process header row if it exists
        const headerRow = rows[0];
        const headerCells = Array.from(headerRow.querySelectorAll('th'));
        
        if (headerCells && headerCells.length > 0) {
          // Process as a table with headers
          const headers = headerCells.map(cell => cell.textContent?.trim() || ' ');
          
          // Add header row
          markdown += '| ' + headers.join(' | ') + ' |\n';
          
          // Add separator row
          markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
          
          // Process data rows (skip the first row if it's all headers)
          for (let i = headerCells.length === headerRow.children.length ? 1 : 0; i < rows.length; i++) {
            const row = rows[i];
            const cells = Array.from(row.querySelectorAll('td'));
            
            if (cells && cells.length > 0) {
              const rowData = cells.map(cell => cell.textContent?.trim() || ' ');
              
              // Pad with empty cells if needed
              while (rowData.length < headers.length) {
                rowData.push(' ');
              }
              
              markdown += '| ' + rowData.join(' | ') + ' |\n';
            }
          }
        } else {
          // Process as a table without explicit headers
          // Use the first row as header
          const firstRow = rows[0];
          const firstRowCells = Array.from(firstRow.querySelectorAll('td'));
          
          if (firstRowCells && firstRowCells.length > 0) {
            // Use first row data as column headers
            const headers = firstRowCells.map(cell => cell.textContent?.trim() || ' ');
            
            // Add header row (from first data row)
            markdown += '| ' + headers.join(' | ') + ' |\n';
            
            // Add separator row
            markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
            
            // Add remaining rows
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              const cells = Array.from(row.querySelectorAll('td'));
              
              if (cells && cells.length > 0) {
                const rowData = cells.map(cell => cell.textContent?.trim() || ' ');
                
                // Pad with empty cells if needed
                while (rowData.length < headers.length) {
                  rowData.push(' ');
                }
                
                markdown += '| ' + rowData.join(' | ') + ' |\n';
              }
            }
          } else {
            // Fall back to default handling
            return content;
          }
        }
        
        return markdown + '\n';
      }
    });
  }

  /**
   * Extract metadata from HTML and markdown content
   */
  private extractMetadata(html: string, markdown: string): MetadataExtracted {
    try {
      const dom = new JSDOM(html);
      const { document } = dom.window;
      
      // Extract title
      const titleElement = document.querySelector('title') || document.querySelector('h1');
      const title = titleElement ? titleElement.textContent?.trim() || '' : '';
      
      // Extract headings
      const headings: { level: number; text: string; id?: string }[] = [];
      for (let i = 1; i <= 6; i++) {
        const elements = document.querySelectorAll(`h${i}`);
        elements.forEach(el => {
          headings.push({
            level: i,
            text: el.textContent?.trim() || '',
            id: el.id || undefined
          });
        });
      }
      
      // Extract code blocks
      const codeBlocks: { language: string; code: string }[] = [];
      const preCodeElements = document.querySelectorAll('pre code');
      preCodeElements.forEach(el => {
        let language = '';
        if (el.classList && el.classList.length > 0) {
          for (let i = 0; i < el.classList.length; i++) {
            const className = el.classList[i];
            if (className.startsWith('language-') || className.startsWith('lang-')) {
              language = className.replace(/^(language-|lang-)/, '');
              break;
            }
          }
        }
        
        codeBlocks.push({
          language,
          code: el.textContent?.trim() || ''
        });
      });
      
      // Count tables
      const tableCount = document.querySelectorAll('table').length;
      
      // Count sections (approximately by looking at heading levels)
      const sectionCount = headings.length;
      
      // Extract links
      const links: { text: string; href: string }[] = [];
      const linkElements = document.querySelectorAll('a[href]');
      linkElements.forEach(el => {
        const href = el.getAttribute('href') || '';
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          links.push({
            text: el.textContent?.trim() || '',
            href
          });
        }
      });
      
      // Extract package and version metadata from meta tags
      const packageMeta = document.querySelector('meta[name="package"]');
      const versionMeta = document.querySelector('meta[name="version"]');
      
      return {
        title,
        headings,
        codeBlocks,
        tableCount,
        sectionCount,
        links,
        package: packageMeta?.getAttribute('content') || undefined,
        version: versionMeta?.getAttribute('content') || undefined,
        type: 'documentation',
        tags: ['auto-generated']
      };
    } catch (error) {
      logger.error('Error extracting metadata:', error);
      // Return minimal metadata in case of error
      return {
        title: '',
        headings: [],
        codeBlocks: [],
        tableCount: 0,
        sectionCount: 0,
        links: [],
        type: 'documentation',
        tags: ['auto-generated']
      };
    }
  }

  /**
   * Split document into chunks for efficient storage and retrieval
   */
  private chunkDocument(markdown: string, metadata: any): DocumentChunk[] {
    const strategy = config.chunking.strategy;

    if (strategy === 'fixed') {
      return this.chunkDocumentFixedSize(
        markdown, 
        metadata, 
        config.chunking.fixedChunkSize, 
        config.chunking.fixedChunkOverlap
      );
    } else { // Default to headings strategy
      return this.chunkDocumentByHeadings(markdown, metadata);
    }
  }

  /**
   * Chunk document using fixed-size chunks with overlap.
   */
  private chunkDocumentFixedSize(
    markdown: string, 
    docMetadata: any, 
    chunkSize: number, 
    overlap: number
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let startIndex = 0;
    let chunkIndex = 0;

    if (chunkSize <= overlap) {
      logger.error('Chunk size must be greater than overlap. Using full document as one chunk.');
      return [{
        content: markdown,
        metadata: {
          title: docMetadata.title || 'Untitled Document',
          order: 0,
          type: 'content',
        }
      }];
    }

    while (startIndex < markdown.length) {
      const endIndex = Math.min(startIndex + chunkSize, markdown.length);
      const chunkContent = markdown.substring(startIndex, endIndex);
      
      chunks.push({
        content: chunkContent,
        metadata: {
          title: docMetadata.title || 'Untitled Document',
          chunkIndex: chunkIndex,
          start: startIndex,
          end: endIndex,
          order: chunkIndex,
          type: 'content'
        }
      });
      
      chunkIndex++;
      startIndex += chunkSize - overlap;
      
      // Prevent infinite loop if overlap is too large or chunk size too small
      if (startIndex >= markdown.length || chunkSize - overlap <= 0) {
        break;
      }
    }
    
    return chunks;
  }

  /**
   * Chunk document by splitting based on headings.
   * (Renamed from chunkDocument)
   */
  private chunkDocumentByHeadings(markdown: string, metadata: any): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // Split the markdown by headings to create logical sections
    const sections = this.splitByHeadings(markdown);
    
    // Create a document hierarchy based on headings
    const hierarchy = this.createDocumentHierarchy(sections);
    
    // Process each section
    sections.forEach((section, index) => {
      // Determine section heading (if any)
      const headingMatch = section.match(/^(#+)\s+(.+)$/m);
      const headingLevel = headingMatch ? headingMatch[1].length : 0;
      const sectionHeading = headingMatch ? headingMatch[2].trim() : undefined;
      
      // Determine parent relationships based on heading levels
      const parentHeading = this.findParentHeading(hierarchy, headingLevel, index);
      
      // Extract code blocks from the section
      const codeBlockRegex = /```([a-z]*)\n([\s\S]*?)```/g;
      let match;
      let position = 0;
      
      // Add the main content chunk for this section
      chunks.push({
        content: section,
        metadata: {
          title: metadata.title || 'Untitled Document',
          sectionHeading,
          parentHeading,
          headingLevel,
          sectionIndex: index,
          order: index,
          type: 'content'
        }
      });
      
      // Process code blocks separately
      while ((match = codeBlockRegex.exec(section)) !== null) {
        const language = match[1] || 'text';
        const code = match[2];
        
        // Only create separate chunks for substantive code blocks
        if (code.trim().length > 50) {
          chunks.push({
            content: code,
            metadata: {
              title: metadata.title || 'Untitled Document',
              sectionHeading,
              parentHeading,
              headingLevel,
              language,
              sectionIndex: index,
              order: index + (position * 0.1),
              type: 'code'
            }
          });
          position++;
        }
      }
      
      // Process tables separately
      const tableRegex = /\|[^\n]+\|\n\|(?:[-:]+\|)+\n(\|[^\n]+\|\n)+/g;
      position = 0;
      
      while ((match = tableRegex.exec(section)) !== null) {
        chunks.push({
          content: match[0],
          metadata: {
            title: metadata.title || 'Untitled Document',
            sectionHeading,
            parentHeading,
            headingLevel,
            sectionIndex: index,
            order: index + (position * 0.1),
            type: 'table'
          }
        });
        position++;
      }
    });
    
    return chunks;
  }

  /**
   * Create a document hierarchy based on headings and their levels
   */
  private createDocumentHierarchy(sections: string[]): Array<{heading: string, level: number, index: number}> {
    const hierarchy: Array<{heading: string, level: number, index: number}> = [];
    
    sections.forEach((section, index) => {
      const headingMatch = section.match(/^(#+)\s+(.+)$/m);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const heading = headingMatch[2].trim();
        hierarchy.push({ heading, level, index });
      } else {
        // For sections without headings, treat as level 0 (top level)
        hierarchy.push({ heading: '', level: 0, index });
      }
    });
    
    return hierarchy;
  }
  
  /**
   * Find the parent heading for a given section based on heading level hierarchy
   */
  private findParentHeading(
    hierarchy: Array<{heading: string, level: number, index: number}>, 
    currentLevel: number, 
    currentIndex: number
  ): string {
    // If this is a top-level heading or not a heading, it has no parent
    if (currentLevel <= 1) {
      return '';
    }
    
    // Look backwards through the hierarchy to find the nearest heading with a level one above this one
    for (let i = currentIndex - 1; i >= 0; i--) {
      const entry = hierarchy[i];
      if (entry.level > 0 && entry.level < currentLevel) {
        return entry.heading;
      }
    }
    
    return '';
  }

  /**
   * Split markdown content by headings to create sections
   */
  private splitByHeadings(markdown: string): string[] {
    // Split by heading markers (# or ## or ### etc.)
    const headingRegex = /^(#{1,6}\s+.+)$/gm;
    const sections: string[] = [];
    let lastIndex = 0;
    let match;
    
    // Look for matches to the heading regex pattern
    while ((match = headingRegex.exec(markdown)) !== null) {
      // If this isn't the first match, add the preceding content as a section
      if (match.index > lastIndex) {
        sections.push(markdown.substring(lastIndex, match.index).trim());
      }
      
      // Start the new section with this heading
      lastIndex = match.index;
    }
    
    // Add the final section
    if (lastIndex < markdown.length) {
      sections.push(markdown.substring(lastIndex).trim());
    }
    
    // If no headings were found, just return the entire document as one section
    if (sections.length === 0) {
      sections.push(markdown);
    }
    
    return sections;
  }

  /**
   * Create embeddings for document chunks and store them in the database
   * @param chunks The document chunks to create embeddings for
   * @param documentId The ID of the parent document
   */
  private async createChunkEmbeddings(chunks: DocumentChunk[], documentId: string): Promise<void> {
    try {
      // Skip embedding creation if no chunks
      if (!chunks.length) {
        return;
      }

      // Configuration for Ollama API - Now sourced from config
      const ollamaApiUrl = config.ollama.apiUrl;
      const ollamaModel = config.ollama.embedModel;

      // Embedding function using Ollama API
      const createEmbedding = async (text: string): Promise<number[]> => {
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const response = await axios.post(ollamaApiUrl, {
              model: ollamaModel,
              prompt: text,
            });
            
            if (response.data && response.data.embedding) {
              return response.data.embedding;
            } else {
              // This indicates a problem with Ollama's response format, unlikely to be fixed by retry
              throw new Error('Invalid response structure from Ollama API');
            }
          } catch (error: any) { // Added type annotation for error
            logger.warn(`Ollama API request failed (Attempt ${attempt}/${maxRetries})`, {
              // Safely access error properties
              errorMessage: error.message,
              axiosErrorCode: error.code, // Common axios error code
              responseStatus: error.response?.status,
              responseData: error.response?.data,
              chunkStart: text.substring(0, 50) + '...'
            });

            if (attempt === maxRetries) {
              // If it's the last attempt, rethrow the error to be caught by the batch processing loop
              logger.error(`Ollama API request failed after ${maxRetries} attempts.`, { 
                chunkStart: text.substring(0, 100) + '...',
                finalErrorMessage: error.message,
                finalAxiosErrorCode: error.code,
                finalResponseStatus: error.response?.status
              });
              throw error; // Rethrow the final error
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
        // Should not be reached if retries fail, as the error is rethrown
        // Adding a fallback throw to satisfy TypeScript's need for a return/throw path
        throw new Error('Embedding generation failed after multiple retries.'); 
      };

      // Process chunks in batches
      const batchSize = 10; // Consider adjusting based on Ollama performance/limits
      const chunksWithEmbeddings = [];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        // Note: Running embeddings sequentially per batch to avoid overwhelming Ollama
        // If Ollama handles concurrent requests well, Promise.all could be used here.
        for (const chunk of batchChunks) {
          try {
            const embedding = await createEmbedding(chunk.content);
            chunksWithEmbeddings.push({
              ...chunk,
              embedding
            });
          } catch (batchError) {
            // Log the error for the specific chunk but continue processing the rest of the batch/document
            logger.error(`Failed to generate embedding for a chunk in document ${documentId}, skipping chunk.`, { chunkContentStart: chunk.content.substring(0, 50) });
            // Optionally, you could add the chunk without an embedding or mark it somehow
          }
        }
        // Optional: Add a small delay between batches if needed
        // await new Promise(resolve => setTimeout(resolve, 100)); 
      }

      // Store chunks that successfully received embeddings
      if (chunksWithEmbeddings.length > 0) {
        await this.chunkService.createManyChunks(
          chunksWithEmbeddings.map(chunk => ({
            documentId,
            content: chunk.content,
            embedding: chunk.embedding, // This now comes from Ollama
            metadata: chunk.metadata
          })), 
          documentId
        );
        logger.info(`Successfully created ${chunksWithEmbeddings.length} chunk embeddings for document ${documentId}`);
      } else {
        logger.warn(`No chunk embeddings were successfully generated for document ${documentId}`);
      }

    } catch (error) {
      // Catch errors from the overall process (e.g., database errors during createManyChunks)
      logger.error(`Error processing chunk embeddings for document ${documentId}:`, error);
      // Decide if this should rethrow or be handled differently
      throw error; 
    }
  }
} 
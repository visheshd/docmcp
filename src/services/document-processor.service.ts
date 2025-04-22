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
import { URL } from 'url'; // Import URL for robust path joining
// We'll dynamically import AWS dependencies to avoid errors if not installed
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockEmbeddings } from '@langchain/aws';

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
    subsectionIndex?: number;
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
  private bedrockClient?: BedrockRuntimeClient; // Type will be BedrockRuntimeClient when imported
  private embeddings?: BedrockEmbeddings; // Type will be BedrockEmbeddings when imported

  constructor(prismaClient?: PrismaClient, documentService?: DocumentService, chunkService?: ChunkService) {
    this.prisma = prismaClient || getMainPrismaClient();
    this.chunkService = chunkService || new ChunkService(this.prisma);
    this.documentService = documentService || new DocumentService(this.prisma);
    
    // Initialize AWS Bedrock client if configured and AWS is enabled
    this.initializeBedrockClient();
    
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
   * Initialize AWS Bedrock client if the necessary configuration exists
   * and the AWS SDK is available
   */
  private initializeBedrockClient(): void {
    try {
      // The AWS config is already in the config file
      const awsConfig = config.aws;
      const embedProvider = config.embedding?.provider;
      
      // Add debug log to show the current AWS configuration
      logger.debug(`AWS Bedrock configuration: ${JSON.stringify({
        provider: embedProvider,
        region: awsConfig?.region,
        accessKeyIdPresent: !!awsConfig?.accessKeyId,
        secretAccessKeyPresent: !!awsConfig?.secretAccessKey,
        accessKeyIdIsDefault: awsConfig?.accessKeyId === 'your-access-key-id',
        secretAccessKeyIsDefault: awsConfig?.secretAccessKey === 'your-secret-access-key',
        embeddingDimensions: config.aws?.embeddingDimensions,
      })}`);
      
      if (embedProvider !== 'bedrock' || 
          !awsConfig || 
          !awsConfig.accessKeyId || 
          !awsConfig.secretAccessKey ||
          awsConfig.accessKeyId === 'your-access-key-id' ||  // Check for default placeholder values
          awsConfig.secretAccessKey === 'your-secret-access-key') {
        logger.warn('AWS Bedrock embedding provider is not properly configured. Please check your environment variables.');
        return;
      }
      
      // Import the required libraries
      const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
      const { BedrockEmbeddings } = require('@langchain/aws');
      
      // Initialize the Bedrock client
      this.bedrockClient = new BedrockRuntimeClient({
        region: awsConfig.region,
        credentials: {
          accessKeyId: awsConfig.accessKeyId,
          secretAccessKey: awsConfig.secretAccessKey
        }
      });
      
      // Initialize Bedrock embeddings with the chosen model
      this.embeddings = new BedrockEmbeddings({
        client: this.bedrockClient,
        model: 'amazon.titan-embed-text-v1', // Default to this model if not specified
      });
      
      logger.info('AWS Bedrock embedding client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AWS Bedrock client:', error);
      logger.warn('Make sure you have installed @aws-sdk/client-bedrock-runtime and @langchain/aws packages');
    }
  }

  /**
   * Create an embedding for a text string using AWS Bedrock
   * with retry logic to handle transient failures
   */
  async createEmbedding(text: string): Promise<number[]> {
    const maxRetries = 3;
    let retryDelay = 1000; // 1 second base delay
    // Bedrock has an 8192 token limit - set MUCH lower max to force pre-truncation
    const MAX_TOKENS = 3500; // Drastically reduced limit

    if (!this.embeddings) {
      throw new Error('AWS Bedrock embedding client not initialized. Check your configuration.');
    }

    // Estimate token count (more conservative estimate: 3 chars = 1 token)
    const estimatedTokens = Math.ceil(text.length / 3);
    
    // If text is likely too large (based on our new stricter MAX_TOKENS), truncate it
    let processedText = text;
    if (estimatedTokens > MAX_TOKENS) {
      logger.warn(`Text likely exceeds STRICT token limit (est. ${estimatedTokens} tokens > ${MAX_TOKENS}). Applying pre-emptive truncation.`);
      // Truncate to approximately MAX_TOKENS * 3 chars
      processedText = text.substring(0, MAX_TOKENS * 3);
      logger.debug(`Truncated text from ${text.length} to ${processedText.length} characters (${Math.ceil(processedText.length / 3)} est. tokens)`);
    } else {
      logger.debug(`Text estimated tokens (${estimatedTokens}) is within strict limit (${MAX_TOKENS}). No pre-emptive truncation.`);
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Sending embedding request to AWS Bedrock, attempt ${attempt} with ${Math.ceil(processedText.length / 3)} est. tokens`);
        
        // Use LangChain's BedrockEmbeddings to get the embedding
        const result = await this.embeddings.embedQuery(processedText);
        
        // Verify dimensions match what we expect
        if (config.aws?.embeddingDimensions && 
            result.length !== config.aws.embeddingDimensions) {
          logger.warn(`Expected ${config.aws.embeddingDimensions} dimensions but got ${result.length}`);
        }
        
        return result;
      } catch (error: any) {
        const isTokenLimitError = error.message && 
          (error.message.includes("Too many input tokens") || 
           error.message.includes("token limit"));
        
        logger.warn(`AWS Bedrock embedding request failed (Attempt ${attempt}/${maxRetries})`, {
          errorMessage: error.message,
          errorCode: error.code,
          errorType: error.$metadata?.httpStatusCode,
          isTokenLimitError,
          textLength: processedText.length,
          estimatedTokens: Math.ceil(processedText.length / 3),
          chunkStart: processedText.substring(0, 50) + '...'
        });

        // If we're hitting token limits, try more aggressive truncation
        if (isTokenLimitError) {
          // Reduce text size further for next attempt (if not the last attempt)
          if (attempt < maxRetries) {
            const previousLength = processedText.length;
            // More aggressive truncation - reduce by 50% instead of 30%
            processedText = processedText.substring(0, Math.floor(processedText.length * 0.5));
            logger.debug(`Token limit exceeded. Aggressively truncating text from ${previousLength} to ${processedText.length} characters (${Math.ceil(processedText.length / 3)} est. tokens)`);
          }
        }

        if (attempt === maxRetries) {
          logger.error(`AWS Bedrock embedding request failed after ${maxRetries} attempts.`, { 
            chunkStart: processedText.substring(0, 100) + '...',
            finalErrorMessage: error.message,
            finalLength: processedText.length,
            finalEstimatedTokens: Math.ceil(processedText.length / 3)
          });
          throw error;
        }

        // Exponential backoff for retries
        const backoffTime = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
    
    throw new Error('Embedding generation failed after multiple retries.');
  }

  /**
   * Process an HTML document and convert it to a clean markdown format
   */
  async processDocument(documentId: string, html: string, metadata: any = {}): Promise<string> {
    try {
      // 1. Clean the HTML fragment (using existing method)
      const cleanedHtmlFragment = this.cleanHtml(html);

      // 2. Wrap the cleaned fragment in basic HTML structure
      //    Ensures Turndown receives a full document context, though it often handles fragments fine.
      const wrappedHtml = `<html><body>${cleanedHtmlFragment}</body></html>`;
      logger.debug('Wrapped cleaned HTML fragment before Markdown conversion.'); // Optional log

      // 3. Convert the wrapped HTML to Markdown
      const markdown = this.convertToMarkdown(wrappedHtml);

      // 4. Extract additional metadata from the *original* cleaned HTML fragment
      //    (Metadata extraction works better on HTML DOM than raw Markdown)
      const extractedMetadata = this.extractMetadata(cleanedHtmlFragment, markdown); // Pass cleaned fragment here

      // 5. Merge extracted metadata with provided metadata
      const mergedMetadata = {
        ...extractedMetadata,
        ...metadata,
      };

      // 6. Chunk the resulting Markdown document
      const chunks = this.chunkDocument(markdown, mergedMetadata);
      
      // 7. Create embeddings for chunks and store them
      await this.createChunkEmbeddings(chunks, documentId);
      
      // 8. Update the document record with the final generated Markdown and metadata
      await this.documentService.updateDocument(documentId, {
        metadata: mergedMetadata,
      });
      logger.info(`Document ${documentId} processed successfully. Updated metadata.`);
      
      // Return the generated markdown
      return markdown;
    } catch (error) {
      logger.error(`Error processing document ${documentId}:`, error);
      // Update document status to reflect error - if status field exists
      // For now, just log the error, re-throw to let job handler manage status
      // await this.documentService.updateDocument(documentId, {
      //   status: 'failed',
      //   error: `Processing failed: ${error instanceof Error ? error.message : String(error)}`,
      //   processedAt: new Date(),
      // }).catch(updateErr => logger.error(`Failed to update document status after error for ${documentId}:`, updateErr));
      throw error; // Re-throw to handle at job level
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
    chunkSize: number = 6000, // Reduced default chunk size
    overlap: number = 200     // Reduced default overlap
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let startIndex = 0;
    let chunkIndex = 0;
    
    // Apply chunk size from config or use the default reduced size
    const configChunkSize = config.chunking.fixedChunkSize || chunkSize;
    const configOverlap = config.chunking.fixedChunkOverlap || overlap;
    
    // Make sure chunk size is safe for token limits (approx 4 chars per token)
    // Bedrock has an 8192 token limit, so we aim for ~7000 tokens max
    const SAFE_TOKENS = 7000;
    const adjustedChunkSize = Math.min(configChunkSize, SAFE_TOKENS * 4);
    
    if (adjustedChunkSize < configChunkSize) {
      logger.debug(`Reducing configured chunk size from ${configChunkSize} to ${adjustedChunkSize} to fit token limits`);
    }

    if (adjustedChunkSize <= configOverlap) {
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
      const endIndex = Math.min(startIndex + adjustedChunkSize, markdown.length);
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
      startIndex += adjustedChunkSize - configOverlap;
      
      // Prevent infinite loop if overlap is too large or chunk size too small
      if (startIndex >= markdown.length || adjustedChunkSize - configOverlap <= 0) {
        break;
      }
    }
    
    return chunks;
  }

  /**
   * Chunk document by splitting based on headings.
   * Large sections will be further split to meet token limits.
   */
  private chunkDocumentByHeadings(markdown: string, metadata: any): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // Split the markdown by headings to create logical sections
    const sections = this.splitByHeadings(markdown);
    
    // Create a document hierarchy based on headings
    const hierarchy = this.createDocumentHierarchy(sections);
    
    // Bedrock has an 8192 token limit, we aim for ~5000 tokens max (more conservative)
    const MAX_SECTION_TOKENS = 5000;
    const MAX_SECTION_CHARS = MAX_SECTION_TOKENS * 3; // More conservative: 3 chars per token
    
    logger.debug(`Chunking document with title "${metadata.title || 'Untitled'}" into sections. ${sections.length} sections detected.`);
    
    // Process each section
    sections.forEach((section, index) => {
      // Determine section heading (if any)
      const headingMatch = section.match(/^(#+)\\s+(.+)$/m); 
      const headingLevel = headingMatch ? headingMatch[1].length : 0;
      const sectionHeading = headingMatch ? headingMatch[2].trim() : undefined;
      
      // Determine parent relationships based on heading levels
      const parentHeading = this.findParentHeading(hierarchy, headingLevel, index);
      
      // Function to add a chunk, splitting if necessary
      const addChunk = (content: string, type: 'content' | 'code' | 'table', orderOffset: number, language?: string) => {
        if (content.length <= MAX_SECTION_CHARS || type !== 'content') {
          // If content is within limits or not a main content chunk, add it directly
          chunks.push({
            content: content,
            metadata: {
              title: metadata.title || 'Untitled Document',
              sectionHeading,
              parentHeading,
              headingLevel,
              sectionIndex: index,
              language: type === 'code' ? language : undefined,
              order: index + orderOffset,
              type: type
            }
          });
        } else {
          // If content chunk is too large, split it
          logger.debug(`Content chunk within section "${sectionHeading || 'Untitled Section'}" is too large (${content.length} chars). Splitting.`);
          
          const numSubsections = Math.ceil(content.length / MAX_SECTION_CHARS);
          const subsectionSize = Math.ceil(content.length / numSubsections);
          
          for (let i = 0; i < numSubsections; i++) {
            const start = i * subsectionSize;
            const end = Math.min((i + 1) * subsectionSize, content.length);
            const subsectionContent = content.substring(start, end);
            
            chunks.push({
              content: subsectionContent,
              metadata: {
                title: metadata.title || 'Untitled Document',
                sectionHeading,
                parentHeading,
                headingLevel,
                sectionIndex: index,
                subsectionIndex: i, // Mark as a subsection
                order: index + orderOffset + (i * 0.01), // Keep subsections ordered
                type: 'content'
              }
            });
          }
        }
      };

      // Add the main content chunk(s) for this section
      addChunk(section.substring(headingMatch ? headingMatch[0].length : 0).trim(), 'content', 0);
            
      // Extract code blocks from the section and add them
      const codeBlockRegex = /```([a-z]*)\\n([\\s\\S]*?)```/g;
      let match;
      let position = 0.1; // Start code blocks slightly after main content
      
      while ((match = codeBlockRegex.exec(section)) !== null) {
        const language = match[1] || 'text';
        const code = match[2];
        
        if (code.trim().length > 50) {
          addChunk(code, 'code', position, language);
          position += 0.1;
        }
      }
      
      // Process tables separately
      const tableRegex = /\\|[^\\n]+\\|\\n\\|(?:[-:]+\\|)+\\n(\\|[^\\n]+\\|\\n)+/g;
      // Reset position for tables, starting after code blocks
      position = Math.ceil(position); 
      
      while ((match = tableRegex.exec(section)) !== null) {
         addChunk(match[0], 'table', position);
         position += 0.1;
      }
    });
    
    logger.debug(`Created ${chunks.length} chunks from document with title "${metadata.title || 'Untitled'}"`);
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

      // Check if AWS Bedrock is initialized
      if (!this.embeddings) {
        throw new Error('AWS Bedrock embedding client not initialized. Check your configuration.');
      }

      // Process chunks in batches
      const batchSize = 5; // Smaller batch size to avoid rate limits
      const chunksWithEmbeddings = [];
      let successCount = 0;
      let errorCount = 0;

      logger.info(`Starting embedding generation for ${chunks.length} chunks from document ${documentId}`);

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        // Process each chunk sequentially to avoid overwhelming the API
        for (const chunk of batchChunks) {
          try {
            // Add a small delay between requests to avoid rate limiting
            if (i > 0 || batchChunks.indexOf(chunk) > 0) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            logger.debug(`Generating embedding for chunk ${chunksWithEmbeddings.length + 1}/${chunks.length} from document ${documentId}`);
            const embedding = await this.createEmbedding(chunk.content);
            
            chunksWithEmbeddings.push({
              ...chunk,
              embedding
            });
            
            successCount++;
          } catch (error: any) {
            errorCount++;
            // Provide detailed error information to help diagnose issues
            logger.error(`Failed to generate embedding for a chunk in document ${documentId}, skipping chunk.`, { 
              chunkContentStart: chunk.content.substring(0, 100),
              chunkContentLength: chunk.content.length,
              chunkType: chunk.metadata.type,
              errorMessage: error.message,
              errorCode: error.code,
              errorType: error.$metadata?.httpStatusCode
            });
            
            // If too many consecutive errors, consider backing off
            if (errorCount > 5 && errorCount === i + batchChunks.indexOf(chunk) + 1) {
              logger.warn(`Encountered ${errorCount} consecutive embedding errors. Adding longer backoff delay.`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second backoff
            }
          }
        }
        
        // Add a small delay between batches to avoid overwhelming the API
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Store chunks that successfully received embeddings
      if (chunksWithEmbeddings.length > 0) {
        await this.chunkService.createManyChunks(
          chunksWithEmbeddings.map(chunk => ({
            documentId,
            content: chunk.content,
            embedding: chunk.embedding,
            metadata: chunk.metadata
          })), 
          documentId
        );
        logger.info(`Successfully created ${chunksWithEmbeddings.length}/${chunks.length} chunk embeddings for document ${documentId}`);
      } else {
        logger.warn(`No chunk embeddings were successfully generated for document ${documentId}`);
      }

      // Log embedding statistics
      logger.info(`Embedding generation complete for document ${documentId}: ${successCount} successful, ${errorCount} failed`);

    } catch (error: any) {
      // Catch errors from the overall process
      logger.error(`Error processing chunk embeddings for document ${documentId}:`, {
        error: error.message,
        stack: error.stack,
        chunksCount: chunks.length
      });
      throw error;
    }
  }
}
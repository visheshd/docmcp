import { Document, DocumentCreateData } from './types';

/**
 * Interface for document processing.
 * Implementations handle the creation, retrieval, and organization of 
 * documents extracted during crawling.
 */
export interface IDocumentProcessor {
  /**
   * Create a new document record
   * @param data Data for the document to create
   * @returns The created document
   */
  createDocument(data: DocumentCreateData): Promise<Document>;
  
  /**
   * Find a recent document for a URL
   * This is used to avoid recrawling recently processed pages
   * @param url The URL to find a document for
   * @param age Maximum age in days to consider a document recent
   * @returns The document if found, null otherwise
   */
  findRecentDocument(url: string, age: number): Promise<Document | null>;
  
  /**
   * Copy an existing document for a new job
   * This is useful for creating references to existing content without duplicating storage
   * @param existingDocument The document to copy
   * @param jobId The ID of the job to associate the copy with
   * @param level The crawl depth level of the copy
   * @returns The copied document
   */
  copyDocument(existingDocument: Document, jobId: string, level: number): Promise<Document>;
} 
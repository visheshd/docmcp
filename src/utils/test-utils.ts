import { PrismaClient } from '../generated/prisma';

/**
 * Utility for creating test documents with standard fields populated
 */
export function createTestDocument(overrides = {}) {
  return {
    id: 'doc-test-id',
    url: 'https://example.com/docs',
    title: 'Test Document',
    content: 'Test content',
    metadata: { package: 'test', version: '1.0.0' },
    crawlDate: new Date(),
    level: 1,
    parentDocumentId: null,
    jobId: 'job-test-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Utility for creating test jobs with standard fields populated
 */
export function createTestJob(overrides = {}) {
  return {
    id: 'job-test-id',
    url: 'https://example.com/docs',
    status: 'COMPLETED',
    type: 'crawl',
    stage: 'finalizing',
    progress: 100,
    startDate: new Date(),
    endDate: new Date(),
    error: null,
    errorCount: 0,
    stats: { pagesProcessed: 10, pagesSkipped: 0, totalChunks: 20 },
    itemsTotal: 10,
    itemsProcessed: 10,
    itemsFailed: 0,
    itemsSkipped: 0,
    name: 'Test Documentation',
    tags: ['test', 'example'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Utility for creating test chunks with standard fields populated
 */
export function createTestChunk(overrides = {}) {
  return {
    id: 'chunk-test-id',
    documentId: 'doc-test-id',
    content: 'Test chunk content',
    embedding: [],
    metadata: { title: 'Test Chunk', order: 1 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
} 
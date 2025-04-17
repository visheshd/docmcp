import { listDocumentationTool } from '../services/mcp-tools/list-documentation.tool';
import { getTestPrismaClient, setupTestDatabase, teardownTestDatabase } from './utils/testDb';
import { getPrismaClient } from '../config/database';
import { PrismaClient } from '../generated/prisma';

// Mock the database config to use our test client
jest.mock('../config/database', () => ({
  getPrismaClient: jest.fn()
}));

describe('list_documentation tool', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Set up the test database once for all tests
    await setupTestDatabase();
    prisma = getTestPrismaClient();
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);
  });

  afterAll(async () => {
    // Clean up after all tests
    await teardownTestDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty documents array when no documents exist', async () => {
    // Setup: No documents exist in the test database
    // (This is a clean database so we don't need to add anything)
    
    // Execute
    const result = await listDocumentationTool.handler({});
    
    // Verify
    expect(result.documents).toEqual([]);
    expect(result.pagination.totalItems).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
    expect(result.statistics).toEqual([]);
  });
  
  it('should apply tag filters correctly', async () => {
    // Setup: Use a spy to verify the filter
    const findManySpy = jest.spyOn(prisma.document, 'findMany');
    
    // Execute
    await listDocumentationTool.handler({
      tags: ['react', 'javascript']
    });
    
    // Verify the filter was applied correctly
    expect(findManySpy).toHaveBeenCalled();
    const callArgs = findManySpy.mock.calls[0][0] as any;
    expect(callArgs.where).toHaveProperty('job.tags.hasSome');
    expect(callArgs.where.job.tags.hasSome).toEqual(['react', 'javascript']);
  });
  
  it('should apply status filter correctly', async () => {
    // Setup: Use a spy to verify the filter
    const findManySpy = jest.spyOn(prisma.document, 'findMany');
    
    // Execute
    await listDocumentationTool.handler({
      status: 'completed'
    });
    
    // Verify the filter was applied correctly
    expect(findManySpy).toHaveBeenCalled();
    const callArgs = findManySpy.mock.calls[0][0] as any;
    expect(callArgs.where).toHaveProperty('job.status');
    expect(callArgs.where.job.status).toEqual('completed'); // Updated to lowercase to match enum values
  });
  
  it('should apply pagination correctly', async () => {
    // Setup: Use a spy to verify pagination params
    const findManySpy = jest.spyOn(prisma.document, 'findMany');
    
    // Execute
    await listDocumentationTool.handler({
      page: 2,
      pageSize: 20
    });
    
    // Verify pagination was applied correctly
    expect(findManySpy).toHaveBeenCalled();
    const callArgs = findManySpy.mock.calls[0][0] as any;
    expect(callArgs.skip).toBe(20); // (page-1) * pageSize
    expect(callArgs.take).toBe(20);
  });
  
  it('should cap pageSize to maximum of 50', async () => {
    // Setup: Use a spy to verify pageSize capping
    const findManySpy = jest.spyOn(prisma.document, 'findMany');
    
    // Execute
    await listDocumentationTool.handler({
      pageSize: 100
    });
    
    // Verify pageSize was capped
    expect(findManySpy).toHaveBeenCalled();
    const callArgs = findManySpy.mock.calls[0][0] as any;
    expect(callArgs.take).toBe(50);
  });
  
  it('should apply sorting correctly', async () => {
    // Setup: Use a spy to verify sorting
    const findManySpy = jest.spyOn(prisma.document, 'findMany');
    
    // Execute
    await listDocumentationTool.handler({
      sortBy: 'title',
      sortDirection: 'asc'
    });
    
    // Verify sorting was applied correctly
    expect(findManySpy).toHaveBeenCalled();
    const callArgs = findManySpy.mock.calls[0][0] as any;
    expect(callArgs.orderBy).toEqual({ title: 'asc' });
  });
}); 
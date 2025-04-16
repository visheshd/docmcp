import { PrismaClient, Prisma } from '../generated/prisma';
import logger from '../utils/logger';

// Environment-specific database URL
const getDatabaseUrl = () => {
  if (process.env.NODE_ENV === 'test') {
    return process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/docmcp_test';
  }
  return process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/docmcp';
};

// Prisma client options based on environment
const getPrismaOptions = (): Prisma.PrismaClientOptions => {
  const options: Prisma.PrismaClientOptions = {
    datasourceUrl: getDatabaseUrl(),
    log: process.env.NODE_ENV === 'test' ? [] : [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'info', emit: 'event' },
      { level: 'warn', emit: 'event' }
    ] as Prisma.LogDefinition[]
  };
  return options;
};

let prisma: PrismaClient | null = null;

// Create a singleton instance of PrismaClient
export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient(getPrismaOptions());
    
    // Add logging middleware for non-test environments
    if (process.env.NODE_ENV !== 'test') {
      (prisma as any).$on('query' as any, (e: Prisma.QueryEvent) => {
        logger.debug('Query: ' + e.query);
        logger.debug('Params: ' + e.params);
        logger.debug('Duration: ' + e.duration + 'ms');
      });

      (prisma as any).$on('error' as any, (e: Prisma.LogEvent) => {
        logger.error('Database error: ' + e.message);
        logger.error('Target: ' + e.target);
      });
    }
  }
  return prisma;
}

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const initializeDatabase = async (retryCount = 0): Promise<PrismaClient> => {
  try {
    const prisma = getPrismaClient();
    
    // Test connection
    await prisma.$connect();
    logger.info('Database connection initialized');

    if (process.env.NODE_ENV !== 'test') {
      // Only run these in non-test environments since test DB is managed by test utilities
      try {
        // Verify pgvector extension
        await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
        logger.info('pgvector extension initialized');

        // Create vector index for chunks table
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_chunk_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);`;
        logger.info('Vector index created');
      } catch (error) {
        logger.error('Error initializing database extensions:', error);
        throw error;
      }
    }

    return prisma;
  } catch (error) {
    logger.error(`Error initializing database connection (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
    
    if (retryCount < MAX_RETRIES) {
      logger.info(`Retrying in ${RETRY_DELAY/1000} seconds...`);
      await sleep(RETRY_DELAY);
      return initializeDatabase(retryCount + 1);
    }
    
    logger.error('Max retries reached. Failed to initialize database connection.');
    throw error;
  }
};

// Helper for tests to reset the client
export const resetPrismaClient = () => {
  if (prisma) {
    prisma.$disconnect();
    prisma = null;
  }
};

// Export default instance for backwards compatibility
export default getPrismaClient(); 
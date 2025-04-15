import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

// Create a singleton instance of PrismaClient
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
});

// Add logging middleware
prisma.$on('query', (e: any) => {
  logger.debug('Query: ' + e.query);
  logger.debug('Duration: ' + e.duration + 'ms');
});

prisma.$on('error', (e: any) => {
  logger.error('Prisma Error:', e.message);
});

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const initializeDatabase = async (retryCount = 0): Promise<PrismaClient> => {
  try {
    await prisma.$connect();
    logger.info('Database connection initialized');

    // Verify pgvector extension
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
    logger.info('pgvector extension initialized');

    // Create vector index for chunks table
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_chunk_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);`;
    logger.info('Vector index created');

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

export default prisma; 
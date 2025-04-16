import { PrismaClient } from '../../generated/prisma';
import { execSync } from 'child_process';
import { join } from 'path';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/docmcp_test';

let prisma: PrismaClient;

/**
 * Initialize a new PrismaClient instance for testing
 */
function getPrismaClient() {
  if (!prisma) {
    // Run prisma generate first
    
    console.log('Initializing Prisma client...');
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
      log: ['error'],
    });
  }
  return prisma;
}

/**
 * Clear all tables in the database except _prisma_migrations
 */
async function clearDatabase() {
  const prisma = getPrismaClient();
  const tableNames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname='public'
  `;

  for (const { tablename } of tableNames) {
    if (tablename !== '_prisma_migrations') {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
    }
  }
}

/**
 * Set up test database:
 * 1. Run migrations to ensure schema is up to date
 * 2. Initialize Prisma client and connect
 * 3. Create vector extension
 * 4. Clear all tables except migrations
 * 5. Return initialized PrismaClient
 */
export async function setupTestDatabase() {
  try {
    console.log('Setting up test database...');
    
    // Run migrations first
    console.log('Running migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    
    // Initialize client after migrations
    const prisma = getPrismaClient();

    // Ensure pgvector extension is created in the test database
    try {
      await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
      console.log('pgvector extension created in test database.');
    } catch (extError) {
      console.error('Error creating pgvector extension:', extError);
      // Decide if we should throw or just warn
      // throw extError; 
    }
    
    // Clear all tables except _prisma_migrations
    console.log('Clearing database...');
    await clearDatabase();

    // Explicitly (re)create vector index after clearing (might be redundant but ensures it exists)
    try {
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);`;
      console.log('HNSW index on chunks(embedding) created/ensured.');
      // Analyze the table to update statistics for the query planner
      await prisma.$executeRaw`ANALYZE chunks;`; 
      console.log('Analyzed chunks table.');
    } catch (indexError) {
      console.error('Error creating HNSW index or analyzing table:', indexError);
      // Decide if we should throw or just warn
      // throw indexError;
    }
    
    return prisma;
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  }
}

/**
 * Clean up test database connection
 */
export async function teardownTestDatabase() {
  if (prisma) {
    await prisma.$disconnect();
  }
}

/**
 * Get the current PrismaClient instance
 */
export function getTestPrismaClient() {
  return getPrismaClient();
} 
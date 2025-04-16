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
    console.log('Running prisma generate...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    
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
 * 3. Create vector extension and index
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
    
    // Clear all tables except _prisma_migrations
    console.log('Clearing database...');
    await clearDatabase();
    
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
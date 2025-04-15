import { PrismaClient } from '../../generated/prisma';
import { execSync } from 'child_process';
import { join } from 'path';

// Ensure we have required environment variables
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/docmcp_test';

// Initialize PrismaClient with test configuration
let prisma: PrismaClient;

export const setupTestDatabase = async () => {
  try {
    // Run migrations first to ensure tables exist
    execSync('npx prisma migrate deploy', {
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
      },
    });

    // Initialize PrismaClient after migrations
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    // Connect to the database
    await prisma.$connect();

    // Then clear all tables except migrations
    const tableNames = await prisma.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    for (const { tablename } of tableNames) {
      if (tablename !== '_prisma_migrations') {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
      }
    }

    
    return prisma;
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  }
};

export const teardownTestDatabase = async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
};

export const getTestPrismaClient = () => {
  if (!prisma) {
    throw new Error('PrismaClient not initialized. Call setupTestDatabase first.');
  }
  return prisma;
};

// Helper to clear all tables between tests
export const clearDatabase = async () => {
  if (!prisma) {
    throw new Error('PrismaClient not initialized. Call setupTestDatabase first.');
  }

  const tableNames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  for (const { tablename } of tableNames) {
    if (tablename !== '_prisma_migrations') {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
    }
  }

}; 
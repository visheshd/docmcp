import { config } from 'dotenv';
import { setupTestDatabase, teardownTestDatabase, getTestPrismaClient } from './utils/testDb';

// Load environment variables
config();

// Set test environment
process.env.NODE_ENV = 'test';

const prisma = getTestPrismaClient();

// Set up database before all tests
beforeAll(async () => {
  await setupTestDatabase();
});

// Clean tables before each test
beforeEach(async () => {
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
});

// Clean up after all tests
afterAll(async () => {
  await teardownTestDatabase();
}); 
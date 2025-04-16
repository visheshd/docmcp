import { config } from 'dotenv';
import { setupTestDatabase, teardownTestDatabase } from './utils/testDb';

// Load environment variables
config();

// Set test environment
process.env.NODE_ENV = 'test';

// Set up database before all tests
beforeAll(async () => {
  await setupTestDatabase();
});

// Clean up after all tests
afterAll(async () => {
  await teardownTestDatabase();
}); 
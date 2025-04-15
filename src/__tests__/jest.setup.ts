import { config } from 'dotenv';
import { resolve } from 'path';
import { setupTestDatabase, teardownTestDatabase } from './utils/testDb';

// Load test environment variables
config({ path: resolve(__dirname, '../../.env.test') });

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Setup test database
  await setupTestDatabase();
}, 30000); // Increase timeout for database setup

afterAll(async () => {
  await teardownTestDatabase();
}); 
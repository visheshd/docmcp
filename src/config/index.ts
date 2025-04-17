import dotenv from 'dotenv';
import logger from '../utils/logger';

// Load environment variables
dotenv.config();

const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  security: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },
  ollama: {
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434/api/embeddings',
    embedModel: process.env.OLLAMA_EMBED_MODEL || 'granite-embedding:30m',
  },
  // Add chunking configuration
  chunking: {
    strategy: process.env.CHUNKING_STRATEGY || 'headings', // 'headings' or 'fixed'
    fixedChunkSize: Number(process.env.FIXED_CHUNK_SIZE) || 1000, // Characters
    fixedChunkOverlap: Number(process.env.FIXED_CHUNK_OVERLAP) || 100, // Characters
  },
};

// Validate required environment variables
const requiredEnvVars: string[] = [];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

export default config; 
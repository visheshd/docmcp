import logger from '../utils/logger';

// Load environment variables only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  try {
    const dotenv = require('dotenv'); // Use require for conditional loading
    dotenv.config();
  } catch (error) {
    logger.warn('dotenv module not found, skipping .env file loading.');
    // Optional: Handle the error further if needed
  }
}

const config = {
  projectName: process.env.PROJECT_NAME || 'DocMCP',
  projectVersion: process.env.PROJECT_VERSION || '0.1.0',
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
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'bedrock',
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 1536,
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    embeddingDimensions: Number(process.env.AWS_EMBEDDING_DIMENSIONS) || 1536,
  },
  ollama: {
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434/api/embed',
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
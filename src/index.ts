import express, { Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import config from './config';
import logger from './utils/logger';

// --- Tool Imports (Actual implementations) ---
import { sampleToolSchema, sampleToolHandler } from './services/mcp-tools/sample.tool';
import { addDocumentationSchema, addDocumentationHandler } from './services/mcp-tools/add-documentation.tool';
import { getJobStatusSchema, getJobStatusHandler } from './services/mcp-tools/get-job-status.tool';
import { listDocumentationSchema, listDocumentationHandler } from './services/mcp-tools/list-documentation.tool';
import { queryDocumentationSchema, queryDocumentationHandler } from './services/mcp-tools/query-documentation.tool';
// --- End Tool Imports ---

async function bootstrap() {
  // 1. Create Express app
  const app = express();

  // 2. Basic Middleware
  app.use(cors()); // Use basic CORS for now
  // We might need more specific CORS for SSE later if issues arise
  app.use(express.json()); // For the POST /messages endpoint

  // 3. Instantiate McpServer
  const mcpServer = new McpServer({
    name: config.projectName,
    version: config.projectVersion,
  });

  // 4. Register tools
  try {
    mcpServer.tool('sample_tool', sampleToolSchema, sampleToolHandler);
    mcpServer.tool('add_documentation', addDocumentationSchema, addDocumentationHandler);
    mcpServer.tool('get_job_status', getJobStatusSchema, getJobStatusHandler);
    mcpServer.tool('list_documentation', listDocumentationSchema, listDocumentationHandler);
    mcpServer.tool('query_documentation', queryDocumentationSchema, queryDocumentationHandler);
    logger.info('MCP tools registered with SDK server.');
  } catch (error) {
    logger.error('Error registering MCP tools with SDK:', error);
    process.exit(1);
  }

  // 5. Transport Management
  const transports: { [sessionId: string]: SSEServerTransport } = {};

  // 6. Define Routes
  
  // Health Check
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // SSE Connection Endpoint
  app.get('/mcp', async (req: Request, res: Response) => {
    try {
      // Path for POST messages, matching the client expectation
      const messagesPath = '/mcp/messages'; 
      const transport = new SSEServerTransport(messagesPath, res);
      const sessionId = transport.sessionId;
      transports[sessionId] = transport;
      logger.info(`SSE connection established, session: ${sessionId}`);

      res.on('close', () => {
        logger.info(`SSE connection closed, session: ${sessionId}`);
        delete transports[sessionId];
        transport.close(); // Ensure transport resources are cleaned up
      });

      await mcpServer.connect(transport);
      logger.info(`McpServer connected to transport for session: ${sessionId}`);

    } catch (error) {
        logger.error('Error establishing SSE connection:', error);
        if (!res.headersSent) {
            res.status(500).send('Failed to establish SSE connection');
        }
    }
  });

  // Incoming Messages Endpoint
  app.post('/mcp/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (transport) {
      logger.debug(`Received POST message for session: ${sessionId}`);
      await transport.handlePostMessage(req, res);
    } else {
      logger.warn(`No active SSE transport found for session ID: ${sessionId}`);
      res.status(400).json({ success: false, error: 'No transport found for sessionId. Connection may have closed.' });
    }
  });
  
  // Optional: Catch-all for 404
  app.use((req, res) => {
    if (!res.headersSent) {
        res.status(404).json({ error: 'Not Found' });
    }
  });

  // 7. Create HTTP Server and Start Listening
  const httpServer = http.createServer(app);

  httpServer.listen(config.server.port, () => {
    logger.info(`HTTP server listening on port ${config.server.port}`);
    logger.info(`Health check available at http://localhost:${config.server.port}/health`);
    logger.info(`MCP SSE endpoint available at http://localhost:${config.server.port}/mcp`);
  });

  // Handle server errors
  httpServer.on('error', (error) => {
    logger.error('HTTP server error:', error);
    process.exit(1);
  });
}

// Handle top-level errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  console.error(error);
  process.exit(1);
});

bootstrap().catch((error) => {
  logger.error('Failed to bootstrap application:', error);
  process.exit(1);
}); 
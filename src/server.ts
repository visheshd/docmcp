import express, { Request, Response } from 'express';
import { randomUUID } from "node:crypto";
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { CallToolResult, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from './inmemory-event-store';

/**
 * This example server demonstrates backwards compatibility with both:
 * 1. The deprecated HTTP+SSE transport (protocol version 2024-11-05)
 * 2. The Streamable HTTP transport (protocol version 2025-03-26)
 * 
 * It maintains a single MCP server instance but exposes two transport options:
 * - /mcp: The new Streamable HTTP endpoint (supports GET/POST/DELETE)
 * - /sse: The deprecated SSE endpoint for older clients (GET to establish stream)
 * - /messages: The deprecated POST endpoint for older clients (POST to send messages)
 */


const server = new McpServer({
  name: 'backwards-compatible-server',
  version: '1.0.0',
}, { capabilities: { logging: {} } });

// Register a simple tool that sends notifications over time
server.tool(
  'start-notification-stream',
  'Starts sending periodic notifications for testing resumability',
  {
    interval: z.number().describe('Interval in milliseconds between notifications').default(100),
    count: z.number().describe('Number of notifications to send (0 for 100)').default(50),
  },
  async ({ interval, count }, { sendNotification }): Promise<CallToolResult> => {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    let counter = 0;

    while (count === 0 || counter < count) {
      counter++;
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Periodic notification #${counter} at ${new Date().toISOString()}`
          }
        });
      }
      catch (error) {
        console.error("Error sending notification:", error);
      }
      // Wait for the specified interval
      await sleep(interval);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Started sending periodic notifications every ${interval}ms`,
        }
      ],
    };
  }
);

// Create Express application
const app = express();
app.use(express.json());

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport | SSEServerTransport> = {};

//=============================================================================
// STREAMABLE HTTP TRANSPORT (PROTOCOL VERSION 2025-03-26)
//=============================================================================

// Handle POST requests for initialization and JSON-RPC messages
app.post('/mcp', async (req: Request, res: Response) => {
  console.log(`Received POST request to /mcp`);
  console.log('Request body:', JSON.stringify(req.body));
  
  try {
    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    
    if (sessionId && transports[sessionId]) {
      // Existing session
      const existingTransport = transports[sessionId];
      if (existingTransport instanceof StreamableHTTPServerTransport) {
        // Handle request with existing transport
        await existingTransport.handleRequest(req, res, req.body);
      } else {
        // Wrong transport type
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session exists but uses a different transport protocol',
          },
          id: null,
        });
      }
    } else if (!sessionId && req.body?.method === 'initialize') {
      // New initialization request
      console.log('Creating new StreamableHTTPServerTransport');
      const eventStore = new InMemoryEventStore();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore,
        onsessioninitialized: (sid) => {
          console.log(`StreamableHTTP session initialized with ID: ${sid}`);
          transports[sid] = transport;
        }
      });
      
      // Set up onclose handler to clean up transport when closed
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}, removing from transports map`);
          delete transports[sid];
        }
      };
      
      // Connect transport to server
      await server.connect(transport);
      
      // Handle the initialization request
      await transport.handleRequest(req, res, req.body);
    } else {
      // Invalid request
      console.log('Invalid request: Missing session ID or not an initialization request');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Missing session ID or not an initialization request',
        },
        id: null,
      });
    }
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Handle GET requests for SSE streams
app.get('/mcp', async (req: Request, res: Response) => {
  console.log(`Received GET request to /mcp for SSE stream`);
  
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    if (!(transport instanceof StreamableHTTPServerTransport)) {
      res.status(400).send('Session exists but uses a different transport protocol');
      return;
    }
    
    console.log(`Establishing SSE stream for session ${sessionId}`);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling SSE request:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

// Handle DELETE requests for session termination
app.delete('/mcp', async (req: Request, res: Response) => {
  console.log(`Received DELETE request to /mcp for session termination`);
  
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    if (!(transport instanceof StreamableHTTPServerTransport)) {
      res.status(400).send('Session exists but uses a different transport protocol');
      return;
    }
    
    console.log(`Terminating session ${sessionId}`);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling session termination:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

//=============================================================================
// DEPRECATED HTTP+SSE TRANSPORT (PROTOCOL VERSION 2024-11-05)
//=============================================================================

app.get('/sse', async (req: Request, res: Response) => {
  console.log('Received GET request to /sse (deprecated SSE transport)');
  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  let transport: SSEServerTransport;
  const existingTransport = transports[sessionId];
  if (existingTransport instanceof SSEServerTransport) {
    // Reuse existing transport
    transport = existingTransport;
  } else {
    // Transport exists but is not a SSEServerTransport (could be StreamableHTTPServerTransport)
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: Session exists but uses a different transport protocol',
      },
      id: null,
    });
    return;
  }
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backwards compatible MCP server listening on port ${PORT}`);
  console.log(`
==============================================
SUPPORTED TRANSPORT OPTIONS:

1. Streamable Http(Protocol version: 2025-03-26)
   Endpoint: /mcp
   Methods: GET, POST, DELETE
   Usage: 
     - Initialize with POST to /mcp
     - Establish SSE stream with GET to /mcp
     - Send requests with POST to /mcp
     - Terminate session with DELETE to /mcp

2. Http + SSE (Protocol version: 2024-11-05)
   Endpoints: /sse (GET) and /messages (POST)
   Usage:
     - Establish SSE stream with GET to /sse
     - Send requests with POST to /messages?sessionId=<id>
==============================================
`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');

  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  await server.close();
  console.log('Server shutdown complete');
  process.exit(0);
}); 
// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

// Log environment variables (excluding sensitive values)
console.log('Environment variables loaded. NODE_ENV:', process.env.NODE_ENV);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Create an MCP server
const server = new McpServer({
  name: "stdio-server",
  version: "1.0.0"
}, { capabilities: { logging: {} } });

// Register a simple tool that sends notifications over time
server.tool(
  'start-notification-stream',
  'Starts sending periodic notifications for testing resumability',
  {
    interval: z.number().describe('Interval in milliseconds between notifications').default(100),
    count: z.number().describe('Number of notifications to send (0 for unlimited)').default(50),
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

// Add a simple addition tool
server.tool(
  "add",
  "Simple addition function",
  { 
    a: z.number().describe("First number"), 
    b: z.number().describe("Second number") 
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: `The sum is: ${a + b}` }]
  })
);

// Add a greeting tool
server.tool(
  "greet",
  "Simple greeting function",
  { 
    name: z.string().describe("Name to greet").default("User") 
  },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }]
  })
);

// Add a multi-greet tool that also sends notifications
server.tool(
  "multi-greet",
  "Greeting tool with notifications",
  { 
    name: z.string().describe("Name to greet").default("User") 
  },
  async ({ name }, { sendNotification }) => {
    // Send a couple of notifications
    await sendNotification({
      method: "notifications/message",
      params: {
        level: "info",
        data: `Preparing greeting for ${name}...`
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    await sendNotification({
      method: "notifications/message",
      params: {
        level: "info",
        data: `Greeting ready for ${name}!`
      }
    });

    return {
      content: [{ type: "text", text: `Hello, ${name}! This greeting came with notifications.` }]
    };
  }
);

// Set up connection close handler
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Shutting down...');
  await server.close();
  process.exit(0);
});

// Initialize and start the server
async function startServer() {
  console.log("Starting MCP stdio server...");
  console.log("This server communicates through stdin/stdout.");
  console.log("Use the test client to connect to this server.");

  // Create a transport that uses stdin/stdout
  const transport = new StdioServerTransport();
  
  // Connect the server to the transport
  await server.connect(transport);
}

// Start the server
startServer().catch(error => {
  console.error("Error starting server:", error);
  process.exit(1);
}); 
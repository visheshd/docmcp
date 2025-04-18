// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

// Log environment variables (excluding sensitive values)
console.log('Environment variables loaded. NODE_ENV:', process.env.NODE_ENV);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Import MCP tools
import { sampleToolSchema, sampleToolHandler } from './services/mcp-tools/sample.tool.js';
import { getJobStatusSchema, getJobStatusHandler } from './services/mcp-tools/get-job-status.tool.js';
import { addDocumentationSchema, addDocumentationHandler } from './services/mcp-tools/add-documentation.tool.js';
import { listDocumentationSchema, listDocumentationHandler } from './services/mcp-tools/list-documentation.tool.js';
import { queryDocumentationSchema, queryDocumentationHandler } from './services/mcp-tools/query-documentation.tool.js';

// Create an MCP server
const server = new McpServer({
  name: "stdio-server",
  version: "1.0.0"
}, { capabilities: { logging: {} } });

// Register MCP tools from the services/mcp-tools directory
// Sample tool
server.tool(
  "sample",
  "Sample echo tool for demonstration purposes",
  sampleToolSchema,
  sampleToolHandler
);

// Get job status tool
server.tool(
  "get-job-status",
  "Check the status and progress of a job in the system",
  getJobStatusSchema,
  getJobStatusHandler
);

// Add documentation tool
server.tool(
  "add-documentation",
  "Add documentation to the knowledge base",
  addDocumentationSchema,
  addDocumentationHandler
);

// List documentation tool
server.tool(
  "list-documentation",
  "List available documentation in the knowledge base",
  listDocumentationSchema,
  listDocumentationHandler
);

// Query documentation tool
server.tool(
  "query-documentation",
  "Query the knowledge base for relevant documentation",
  queryDocumentationSchema,
  queryDocumentationHandler
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
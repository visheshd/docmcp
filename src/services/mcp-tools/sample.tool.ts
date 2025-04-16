import { MCPFunction, MCPTool, MCPToolRegistry } from '../../types/mcp';
import logger from '../../utils/logger';

/**
 * Sample MCP tool implementation to demonstrate the tool registration pattern
 */

// Define the tool function schema following OpenAI Function Calling format
const sampleToolFunction: MCPFunction = {
  name: 'sample_tool',
  description: 'A sample tool for demonstration purposes',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A message to echo back'
      },
      count: {
        type: 'number',
        description: 'Number of times to repeat the message'
      }
    },
    required: ['message']
  }
};

// Implement the tool handler
const sampleToolHandler = async (params: { message: string; count?: number }) => {
  logger.info(`Sample tool called with message: ${params.message}`);
  
  const count = params.count || 1;
  const response = Array(count).fill(params.message).join(' ');
  
  return {
    echo: response,
    timestamp: new Date().toISOString()
  };
};

// Create the MCP tool
const sampleTool: MCPTool = {
  function: sampleToolFunction,
  handler: sampleToolHandler
};

// Register the tool
export const registerSampleTool = () => {
  MCPToolRegistry.registerTool(sampleTool);
  logger.info('Sample tool registered');
};

export default sampleTool; 
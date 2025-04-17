import { z } from 'zod';
import logger from '../../utils/logger';

/**
 * Sample MCP tool implementation to demonstrate the tool registration pattern
 */

// Define Zod schema for parameters (ZodRawShape)
export const sampleToolSchema = {
  message: z.string().describe('A message to echo back'),
  count: z.number().optional().describe('Number of times to repeat the message')
};

// Explicitly define the type for the handler parameters
type SampleToolParams = {
  message: string;
  count?: number;
};

// Define the handler function matching SDK expectations
export const sampleToolHandler = async (params: SampleToolParams) => {
  logger.info(`Sample tool called with message: ${params.message}`);

  const count = params.count || 1;
  const response = Array(count).fill(params.message).join(' ');

  // Return value MUST match the SDK's expected structure precisely
  return {
    content: [
      {
        type: 'text' as const, // Ensure type is literal 'text'
        text: response
      }
    ]
    // Optionally include metadata or error status if needed by SDK structure
    // isError: false,
    // _meta: { timestamp: new Date().toISOString() }
  };
};

// Remove old MCPTool definition and registration function
// // Define the tool function schema following OpenAI Function Calling format
// const sampleToolFunction: MCPFunction = { ... };
// // Create the MCP tool
// const sampleTool: MCPTool = { ... };
// // Register the tool
// export const registerSampleTool = () => { ... };
// export default sampleTool; 
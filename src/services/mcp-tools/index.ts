import { registerSampleTool } from './sample.tool';
import { registerAddDocumentationTool } from './add-documentation.tool';
import { registerGetJobStatusTool } from './get-job-status.tool';
import { queryDocumentationTool } from './query-documentation.tool';
import { MCPToolRegistry } from '../../types/mcp';
import logger from '../../utils/logger';

/**
 * Register all MCP tools
 * This function should be called during application startup
 */
export const registerAllTools = () => {
  logger.info('Registering MCP tools...');
  
  // Register all tools here
  registerSampleTool();
  registerAddDocumentationTool();
  registerGetJobStatusTool();
  
  // Register query documentation tool directly since it doesn't have a register function
  try {
    MCPToolRegistry.registerTool(queryDocumentationTool);
    logger.info('Registered query_documentation tool');
  } catch (error) {
    logger.warn('Query documentation tool not registered: ', error);
  }
  
  logger.info('All MCP tools registered successfully');
};

export default registerAllTools; 
import { registerSampleTool } from './sample.tool';
import logger from '../../utils/logger';

/**
 * Register all MCP tools
 * This function should be called during application startup
 */
export const registerAllTools = () => {
  logger.info('Registering MCP tools...');
  
  // Register all tools here
  registerSampleTool();
  
  // Add more tool registrations here as they are implemented
  // Example: registerAddDocumentationTool();
  // Example: registerQueryDocumentationTool();
  
  logger.info('All MCP tools registered successfully');
};

export default registerAllTools; 
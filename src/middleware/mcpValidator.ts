import { Request, Response, NextFunction } from 'express';
import { MCPRequest, MCPToolRegistry } from '../types/mcp';
import logger from '../utils/logger';

export const validateMCPRequest = (req: Request, res: Response, next: NextFunction) => {
  const mcpReq = req as MCPRequest;
  
  // Validate request body structure
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({
      success: false,
      error: 'Invalid request body'
    });
    return next(new Error('Invalid request body'));
  }

  const { name, parameters } = req.body;

  // Validate tool name
  if (!name || typeof name !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Tool name is required and must be a string'
    });
    return next(new Error('Tool name is required and must be a string'));
  }

  // Check if tool exists
  const tool = MCPToolRegistry.getTool(name);
  if (!tool) {
    res.status(404).json({
      success: false,
      error: `Tool '${name}' not found`
    });
    return next(new Error(`Tool '${name}' not found`));
  }

  // Validate parameters
  if (!parameters || typeof parameters !== 'object') {
    res.status(400).json({
      success: false,
      error: 'Parameters must be an object'
    });
    return next(new Error('Parameters must be an object'));
  }

  // Check required parameters
  const required = tool.function.parameters.required || [];
  const missing = required.filter(param => !(param in parameters));
  if (missing.length > 0) {
    res.status(400).json({
      success: false,
      error: `Missing required parameters: ${missing.join(', ')}`
    });
    return next(new Error(`Missing required parameters: ${missing.join(', ')}`));
  }

  // Store validated tool call in request
  mcpReq.toolCall = {
    name,
    parameters
  };

  logger.debug(`Validated MCP tool call: ${name}`);
  next();
}; 
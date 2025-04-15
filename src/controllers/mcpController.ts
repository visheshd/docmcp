import { Request, Response } from 'express';
import { MCPRequest, MCPToolRegistry } from '../types/mcp';
import logger from '../utils/logger';

export const listFunctions = (req: Request, res: Response) => {
  const functions = MCPToolRegistry.getAllTools();
  res.json({
    success: true,
    data: { functions }
  });
};

export const handleToolCall = async (req: Request, res: Response) => {
  try {
    const mcpReq = req as MCPRequest;
    const { toolCall } = mcpReq;

    if (!toolCall) {
      throw new Error('Tool call not found in request');
    }

    const tool = MCPToolRegistry.getTool(toolCall.name);
    if (!tool) {
      throw new Error(`Tool '${toolCall.name}' not found`);
    }

    logger.debug(`Executing tool: ${toolCall.name}`);
    const result = await tool.handler(toolCall.parameters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error handling tool call:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}; 
import { Request, Response } from 'express';
import { MCPToolRegistry, MCPTool, MCPRequest } from '../../types/mcp';
import { validateMCPRequest } from '../../middleware/mcpValidator';

describe('MCPValidator Middleware', () => {
  let mockRequest: Partial<MCPRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  const mockTool: MCPTool = {
    function: {
      name: 'test_tool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: {
          param1: {
            type: 'string',
            description: 'Required parameter'
          }
        },
        required: ['param1']
      }
    },
    handler: async (params: any) => ({ result: 'success' })
  };

  beforeEach(() => {
    mockRequest = {
      body: {
        name: 'test_tool',
        parameters: { param1: 'test' }
      }
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    nextFunction = jest.fn();

    // Clear and reset registry
    // @ts-ignore - accessing private property for testing
    MCPToolRegistry.tools = new Map();
    MCPToolRegistry.registerTool(mockTool);
  });

  it('should pass validation for valid request', () => {
    validateMCPRequest(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalledWith();
    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(mockResponse.json).not.toHaveBeenCalled();
  });

  it('should fail for missing request body', () => {
    mockRequest.body = undefined;

    validateMCPRequest(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid request body'
    });
    expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should fail for missing tool name', () => {
    mockRequest.body = { parameters: {} };

    validateMCPRequest(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Tool name is required and must be a string'
    });
    expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should fail for non-existent tool', () => {
    mockRequest.body = {
      name: 'non_existent_tool',
      parameters: {}
    };

    validateMCPRequest(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Tool \'non_existent_tool\' not found'
    });
    expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should fail for missing required parameters', () => {
    mockRequest.body = {
      name: 'test_tool',
      parameters: {}
    };

    validateMCPRequest(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required parameters: param1'
    });
    expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should store validated tool call in request', () => {
    validateMCPRequest(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockRequest['toolCall']).toEqual({
      name: 'test_tool',
      parameters: { param1: 'test' }
    });
  });
}); 
import { Request, Response } from 'express';
import { MCPToolRegistry, MCPTool, MCPRequest } from '../../types/mcp';
import { listFunctions, handleToolCall } from '../../controllers/mcpController';

describe('MCP Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  const mockTool: MCPTool = {
    function: {
      name: 'test_tool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: {
          param1: {
            type: 'string',
            description: 'Test parameter'
          }
        },
        required: ['param1']
      }
    },
    handler: jest.fn().mockResolvedValue({ result: 'success' })
  };

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Clear and reset registry
    // @ts-ignore - accessing private property for testing
    MCPToolRegistry.tools = new Map();
    MCPToolRegistry.registerTool(mockTool);
  });

  describe('listFunctions', () => {
    it('should return list of available functions', () => {
      listFunctions(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          functions: [mockTool.function]
        }
      });
    });

    it('should return empty list when no tools registered', () => {
      // Clear registry
      // @ts-ignore - accessing private property for testing
      MCPToolRegistry.tools = new Map();

      listFunctions(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          functions: []
        }
      });
    });
  });

  describe('handleToolCall', () => {
    beforeEach(() => {
      (mockTool.handler as jest.Mock).mockClear();
    });

    it('should handle valid tool call successfully', async () => {
      const mcpRequest: Partial<MCPRequest> = {
        ...mockRequest,
        toolCall: {
          name: 'test_tool',
          parameters: { param1: 'test' }
        }
      };

      await handleToolCall(
        mcpRequest as Request,
        mockResponse as Response
      );

      expect(mockTool.handler).toHaveBeenCalledWith({ param1: 'test' });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { result: 'success' }
      });
    });

    it('should handle missing tool call error', async () => {
      await handleToolCall(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Tool call not found in request'
      });
    });

    it('should handle tool execution error', async () => {
      (mockTool.handler as jest.Mock).mockRejectedValue(new Error('Test error'));

      const mcpRequest: Partial<MCPRequest> = {
        ...mockRequest,
        toolCall: {
          name: 'test_tool',
          parameters: { param1: 'test' }
        }
      };

      await handleToolCall(
        mcpRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Test error'
      });
    });
  });
}); 
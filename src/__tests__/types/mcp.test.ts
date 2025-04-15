import { MCPToolRegistry, MCPTool } from '../../types/mcp';

describe('MCPToolRegistry', () => {
  beforeEach(() => {
    // Clear the registry before each test
    // @ts-ignore - accessing private property for testing
    MCPToolRegistry.tools = new Map();
  });

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
    handler: async (params: any) => ({ result: 'success' })
  };

  it('should register a tool', () => {
    MCPToolRegistry.registerTool(mockTool);
    const tool = MCPToolRegistry.getTool('test_tool');
    expect(tool).toBeDefined();
    expect(tool?.function.name).toBe('test_tool');
  });

  it('should return undefined for non-existent tool', () => {
    const tool = MCPToolRegistry.getTool('non_existent');
    expect(tool).toBeUndefined();
  });

  it('should list all registered tools', () => {
    MCPToolRegistry.registerTool(mockTool);
    const tools = MCPToolRegistry.getAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toEqual(mockTool.function);
  });

  it('should override existing tool with same name', () => {
    MCPToolRegistry.registerTool(mockTool);
    
    const updatedTool: MCPTool = {
      ...mockTool,
      function: {
        ...mockTool.function,
        description: 'Updated description'
      }
    };

    MCPToolRegistry.registerTool(updatedTool);
    const tool = MCPToolRegistry.getTool('test_tool');
    expect(tool?.function.description).toBe('Updated description');
  });
}); 
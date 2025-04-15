import { Request } from 'express';

export interface MCPFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description: string;
      items?: {
        type: string;
      };
    }>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface MCPRequest extends Request {
  toolCall?: MCPToolCall;
}

export interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface MCPTool {
  function: MCPFunction;
  handler: (params: any) => Promise<any>;
}

// Registry to store all available MCP tools
export class MCPToolRegistry {
  private static tools: Map<string, MCPTool> = new Map();

  static registerTool(tool: MCPTool) {
    MCPToolRegistry.tools.set(tool.function.name, tool);
  }

  static getTool(name: string): MCPTool | undefined {
    return MCPToolRegistry.tools.get(name);
  }

  static getAllTools(): MCPFunction[] {
    return Array.from(MCPToolRegistry.tools.values()).map(tool => tool.function);
  }
} 
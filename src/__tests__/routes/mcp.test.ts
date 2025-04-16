import request from 'supertest';
import { app } from '../../app';
import { registerAllTools } from '../../services/mcp-tools';

describe('MCP Routes', () => {
  // Register tools before tests
  beforeAll(() => {
    registerAllTools();
  });

  describe('GET /mcp/functions', () => {
    it('should return a list of available functions', async () => {
      const response = await request(app)
        .get('/mcp/functions')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data.functions)).toBe(true);
      
      // Check if our sample tool is registered
      const sampleTool = response.body.data.functions.find(
        (fn: any) => fn.name === 'sample_tool'
      );
      expect(sampleTool).toBeDefined();
      expect(sampleTool.description).toBe('A sample tool for demonstration purposes');
    });
  });

  describe('POST /mcp/call', () => {
    it('should execute a sample tool call successfully', async () => {
      const response = await request(app)
        .post('/mcp/call')
        .send({
          name: 'sample_tool',
          parameters: {
            message: 'Hello, MCP!',
            count: 3
          }
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.echo).toBe('Hello, MCP! Hello, MCP! Hello, MCP!');
      expect(response.body.data.timestamp).toBeDefined();
    });

    it('should return an error if tool name is not provided', async () => {
      const response = await request(app)
        .post('/mcp/call')
        .send({
          parameters: {
            message: 'This should fail'
          }
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return an error if required parameters are missing', async () => {
      const response = await request(app)
        .post('/mcp/call')
        .send({
          name: 'sample_tool',
          parameters: {
            // Missing required 'message' parameter
            count: 2
          }
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required parameters');
    });

    it('should return an error if tool does not exist', async () => {
      const response = await request(app)
        .post('/mcp/call')
        .send({
          name: 'nonexistent_tool',
          parameters: {
            message: 'This should fail'
          }
        })
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });
}); 
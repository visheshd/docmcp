import express from 'express';
import { listFunctions, handleToolCall } from '../controllers/mcpController';
import { validateMCPRequest } from '../middleware/mcpValidator';

const router = express.Router();

// List available MCP functions
router.get('/functions', listFunctions);

// Handle MCP tool calls
router.post('/call', validateMCPRequest, handleToolCall);

export default router; 
/**
 * Sarga Prints MCP Server — HTTP Transport Wrapper
 *
 * Exposes the MCP server over HTTP using Express.
 * Supports remote access by AI agents like Claude.ai.
 * Requires JWT authentication.
 */
import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import 'dotenv/config';

import logger from './utils/logger.js';
import { testConnection } from './config/database.js';
import { server } from './index.js';
import { authenticateToken, canExecuteTool } from './config/auth.js';

const app = express();
const PORT = process.env.HTTP_PORT || 3100;

// Security Middlewares
app.use(express.json({ limit: '10mb' }));

const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
app.use(cors({ origin: corsOrigins }));

// ─── Health Check ───────────────────────────────────────
app.get('/health', async (req, res) => {
  const db = await testConnection();
  res.json({
    status: db.connected ? 'healthy' : 'degraded',
    version: '1.0.0',
    database: db.connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ─── MCP Endpoint ───────────────────────────────────────
// We use a single variable to store the transport for this session.
// In a highly concurrent multi-tenant scenario, we would map session IDs to transports.
// For this single-tenant backend, one global transport is acceptable, or creating a new
// transport per request. We'll follow the standard MCP Express pattern.

let transport: SSEServerTransport;

app.get('/mcp', authenticateToken, async (req, res) => {
  logger.info('[MCP] Handling GET request (establishing connection)');
  transport = new SSEServerTransport('/mcp/messages', res);
  await server.connect(transport);
});

app.post('/mcp/messages', authenticateToken, async (req, res) => {
  // Extract user role from JWT
  const userRole = (req as any).user?.role;

  // We could intercept the JSON-RPC body to enforce RBAC
  // The MCP SDK handles the actual routing, so doing strict tool-level RBAC
  // requires inspecting req.body.method and req.body.params.name
  if (req.body && req.body.method === 'tools/call') {
    const toolName = req.body.params?.name;
    if (toolName && !canExecuteTool(toolName, userRole)) {
      logger.warn(`[RBAC] User with role ${userRole} denied access to tool ${toolName}`);
      res.status(403).json({
        jsonrpc: "2.0",
        id: req.body.id,
        error: { code: -32000, message: `Access denied. Role ${userRole} cannot execute ${toolName}.` }
      });
      return;
    }
  }

  logger.info(`[MCP] Handling POST request from role: ${userRole}`);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Transport not initialized");
  }
});

// Start the server
async function start() {
  const dbStatus = await testConnection();
  if (dbStatus.connected) {
    logger.info(`✅ Connected to MySQL Database (${dbStatus.latencyMs}ms)`);
  } else {
    logger.error('❌ Failed to connect to MySQL Database');
  }

  app.listen(PORT, () => {
    logger.info(`🚀 Sarga Prints MCP Server running via HTTP on port ${PORT}`);
    logger.info(`Endpoint: http://localhost:${PORT}/mcp`);
  });
}

start().catch(err => {
  logger.error('Fatal error starting HTTP server:', err);
  process.exit(1);
});

/**
 * Sarga Prints MCP Server — Main Entry Point
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import 'dotenv/config';

import logger from './utils/logger.js';
import { testConnection } from './config/database.js';

// Tool Registrations
import { registerSystemTools } from './tools/system.js';
import { registerVendorTools } from './tools/vendor.js';
import { registerInventoryTools } from './tools/inventory.js';
import { registerJobTools } from './tools/jobs.js';
import { registerCustomerTools } from './tools/customers.js';
import { registerPaymentTools } from './tools/payments.js';
import { registerAnalyticsTools } from './tools/analytics.js';

// Create MCP Server
export const server = new McpServer({
  name: 'sarga-prints-mcp',
  version: '1.0.0',
});

// Register all tool categories
registerSystemTools(server);
registerVendorTools(server);
registerInventoryTools(server);
registerJobTools(server);
registerCustomerTools(server);
registerPaymentTools(server);
registerAnalyticsTools(server);

// Start server based on transport mode
const transportMode = process.env.MCP_TRANSPORT || 'stdio';

async function start() {
  logger.info('Starting Sarga Prints MCP Server...');

  // Test DB Connection
  const dbStatus = await testConnection();
  if (dbStatus.connected) {
    logger.info(`✅ Connected to MySQL Database (${dbStatus.latencyMs}ms)`);
  } else {
    logger.error('❌ Failed to connect to MySQL Database. Tools will fail if they require DB access.');
    logger.error(dbStatus.error);
  }

  if (transportMode === 'stdio') {
    // Standard I/O transport (for local Claude Desktop)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('✅ MCP Server running on STDIO transport');
  } else if (transportMode === 'http') {
    // HTTP transport is handled by http-server.ts
    // We just export the server instance
    logger.info('HTTP mode selected. Ensure you are running via http-server.ts');
  } else {
    logger.error(`Unknown transport mode: ${transportMode}`);
    process.exit(1);
  }
}

// Only start stdio if we are the main module
// In HTTP mode, http-server.ts imports this file and handles startup
if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch(err => {
    logger.error('Fatal error starting MCP server:', err);
    process.exit(1);
  });
}

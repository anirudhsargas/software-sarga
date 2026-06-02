# Sarga Prints MCP Server

A Model Context Protocol (MCP) server for Sarga Prints, enabling AI agents (like Claude) to securely read and write data across the management system and customer website.

## Features

- **41 Tools** across 8 functional groups (Vendors, Inventory, Jobs, Customers, Payments, Analytics, Website, System).
- **Dual Transports**:
  - `stdio`: For local execution (e.g., Claude Desktop).
  - `http`: Express-based HTTP server for remote execution (e.g., Claude.ai).
- **Security**: JWT authentication, role-based access control (RBAC), and full audit logging for all writes.
- **Database**: Direct connection to Aiven MySQL with connection pooling and SSL support.

## Setup

1. Make sure Node.js (v20+) is installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
4. Fill in `.env` with your actual Aiven database credentials and JWT secrets.

## Running the Server

### Mode 1: Standard I/O (Local Claude Desktop)

This mode communicates via standard input/output. It does not require authentication since it runs locally on your machine.

```bash
# Development (uses tsx)
npm run dev

# Production
npm run build
npm run start
```

**Adding to Claude Desktop:**
Edit your `claude_desktop_config.json` (usually in `%APPDATA%\Claude` on Windows or `~/Library/Application Support/Claude` on Mac):

```json
{
  "mcpServers": {
    "sarga-prints": {
      "command": "node",
      "args": ["D:/software sarga/mcp-server/dist/index.js"],
      "env": {
        "DB_HOST": "your-aiven-host.aivencloud.com",
        "DB_PORT": "12345",
        "DB_USER": "avnadmin",
        "DB_PASSWORD": "...",
        "DB_NAME": "sarga_staging",
        "DB_SSL": "true"
      }
    }
  }
}
```

### Mode 2: HTTP Transport (Remote Access)

This mode runs an Express server, exposing the tools over HTTP. It requires a valid JWT token in the `Authorization: Bearer <token>` header.

```bash
# Development
npm run dev:http

# Production
npm run build
npm run start:http
```

The server will be available at `http://localhost:3100/mcp`.

## Project Structure

- `src/index.ts` - Main entry point and tool registry.
- `src/http-server.ts` - Express HTTP wrapper.
- `src/tools/` - Tool implementations categorized by domain.
- `src/services/` - Database querying and caching logic.
- `src/config/` - DB pool, Auth, and constants.

## Security & RBAC

- **Read Tools**: Accessible by all authenticated staff roles.
- **Write Tools**: Restricted to `Admin`, `Accountant`, and `Front Office`.
- **System Tools**: Restricted to `Admin` only.
- **Audit Logging**: All state-changing tools (create, update, record, allocate) automatically write to the `sarga_audit_logs` table.

/**
 * Sarga Prints MCP Server — MySQL Database Connection Pool
 *
 * Reuses the same Aiven MySQL config as the main backend.
 * Reads SSL cert from the server directory's aiven-ca.pem.
 */
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the CA cert: check mcp-server dir first, then fall back to server dir
function findCaCert(): Buffer | undefined {
  const candidates = [
    path.join(__dirname, '..', '..', 'aiven-ca.pem'),
    path.join(__dirname, '..', '..', '..', 'server', 'aiven-ca.pem'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      logger.info(`[DB] Using CA cert: ${candidate}`);
      return fs.readFileSync(candidate);
    }
  }

  logger.warn('[DB] No aiven-ca.pem found — SSL will use system default CA');
  return undefined;
}

const useSSL = process.env.DB_SSL === 'true';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ...(useSSL && {
    ssl: {
      ca: findCaCert(),
      rejectUnauthorized: true,
    },
  }),
});

/**
 * Test database connectivity.
 * Returns { connected: true, latencyMs } on success.
 */
export async function testConnection(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { connected: true, latencyMs: Date.now() - start };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[DB] Connection test failed:', message);
    return { connected: false, latencyMs: Date.now() - start, error: message };
  }
}

/**
 * Execute a query with timeout.
 */
export async function query<T = unknown>(
  sql: string,
  params?: unknown[],
  timeoutMs = 30_000,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${timeoutMs}`);
    const [rows] = await conn.query(sql, params);
    return rows as T;
  } finally {
    conn.release();
  }
}

/**
 * Execute multiple statements inside a transaction.
 * Auto-rolls back on error.
 */
export async function transaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Gracefully close the pool.
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('[DB] Connection pool closed');
}

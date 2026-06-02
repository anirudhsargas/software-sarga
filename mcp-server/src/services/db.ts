/**
 * Sarga Prints MCP Server — DB Query Service helpers
 */
import { pool, query, transaction } from '../config/database.js';
import type { PoolConnection } from 'mysql2/promise';
import logger from '../utils/logger.js';

/**
 * Run a SELECT and return all rows.
 */
export async function selectAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return query<T[]>(sql, params);
}

/**
 * Run a SELECT and return the first row, or null.
 */
export async function selectOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Run a COUNT query and return the numeric result.
 */
export async function count(sql: string, params?: unknown[]): Promise<number> {
  const rows = await query<Array<{ count: number }>>(sql, params);
  return rows[0]?.count ?? 0;
}

/**
 * Insert a row and return the insertId.
 */
export async function insert(sql: string, params?: unknown[]): Promise<number> {
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(sql, params);
    return (result as { insertId: number }).insertId;
  } finally {
    conn.release();
  }
}

/**
 * Run an UPDATE/DELETE and return affectedRows.
 */
export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(sql, params);
    return (result as { affectedRows: number }).affectedRows;
  } finally {
    conn.release();
  }
}

/**
 * Run multiple queries inside a transaction.
 */
export { transaction };

/**
 * Build a paginated SELECT query with total count.
 */
export async function paginatedQuery<T = Record<string, unknown>>(
  baseSql: string,
  countSql: string,
  params: unknown[],
  limit: number,
  offset: number,
): Promise<{ data: T[]; total: number; page: number; limit: number; pages: number }> {
  const [data, totalRows] = await Promise.all([
    selectAll<T>(`${baseSql} LIMIT ? OFFSET ?`, [...params, limit, offset]),
    count(countSql, params),
  ]);

  return {
    data,
    total: totalRows,
    page: Math.floor(offset / limit) + 1,
    limit,
    pages: Math.ceil(totalRows / limit),
  };
}

/**
 * Log a tool call to the audit_logs table.
 */
export async function auditLog(
  staffId: number | null,
  action: string,
  details: string,
  meta?: { entity_type?: string; entity_id?: number },
): Promise<void> {
  try {
    await insert(
      `INSERT INTO sarga_audit_logs (user_id_internal, action, details, entity_type, entity_id)
       VALUES (?, ?, ?, ?, ?)`,
      [staffId, `MCP:${action}`, details, meta?.entity_type ?? null, meta?.entity_id ?? null],
    );
  } catch (err) {
    logger.error('[Audit] Failed to write audit log:', err);
  }
}

/**
 * MCP Tools — System Operations (4 tools)
 *
 * Tools: get_system_health, get_audit_logs, list_staff, get_branch_info
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { testConnection, pool } from '../config/database.js';
import { selectAll, selectOne, count } from '../services/db.js';
import { formatToolResult, parsePagination } from '../utils/formatters.js';
import { cacheStats } from '../services/cache.js';

export function registerSystemTools(server: McpServer): void {

  // ─── 1. get_system_health ──────────────────────────────
  server.tool(
    'get_system_health',
    'Check database connectivity, pool stats, and overall system health',
    {},
    async () => {
      const dbStatus = await testConnection();

      // Pool stats
      const poolInfo = pool.pool;
      const poolStats = {
        total_connections: (poolInfo as any)?._allConnections?.length ?? 'unknown',
        free_connections: (poolInfo as any)?._freeConnections?.length ?? 'unknown',
        queue_length: (poolInfo as any)?._connectionQueue?.length ?? 'unknown',
      };

      // Recent errors from audit log
      let recentErrors: unknown[] = [];
      try {
        recentErrors = await selectAll(
          `SELECT action, details, timestamp FROM sarga_audit_logs
           WHERE action LIKE '%ERROR%' OR action LIKE '%FAIL%'
           ORDER BY timestamp DESC LIMIT 10`
        );
      } catch { /* table may not have error entries */ }

      // Cache stats
      const cache = cacheStats();

      const result = {
        status: dbStatus.connected ? 'healthy' : 'down',
        database: {
          connected: dbStatus.connected,
          latency_ms: dbStatus.latencyMs,
          error: dbStatus.error || null,
        },
        pool: poolStats,
        cache: { entries: cache.size },
        recent_errors: recentErrors,
        server_time: new Date().toISOString(),
        node_version: process.version,
      };

      return {
        content: [{ type: 'text' as const, text: formatToolResult(result) }],
      };
    },
  );

  // ─── 2. get_audit_logs ─────────────────────────────────
  server.tool(
    'get_audit_logs',
    'Retrieve recent audit trail entries. Filter by action, entity, or staff.',
    {
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(20).describe('Results per page (max 100)'),
      action_filter: z.string().optional().describe('Filter by action name (partial match)'),
      entity_type: z.string().optional().describe('Filter by entity type (vendor, job, etc.)'),
      staff_id: z.number().optional().describe('Filter by staff ID'),
    },
    async ({ page, limit, action_filter, entity_type, staff_id }) => {
      const { page: p, limit: l, offset } = parsePagination(page, limit);

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (action_filter) {
        conditions.push('a.action LIKE ?');
        params.push(`%${action_filter}%`);
      }
      if (entity_type) {
        conditions.push('a.entity_type = ?');
        params.push(entity_type);
      }
      if (staff_id) {
        conditions.push('a.user_id_internal = ?');
        params.push(staff_id);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [logs, total] = await Promise.all([
        selectAll(
          `SELECT a.id, a.action, a.details, a.entity_type, a.entity_id,
                  a.timestamp, s.name as staff_name, s.role as staff_role
           FROM sarga_audit_logs a
           LEFT JOIN sarga_staff s ON a.user_id_internal = s.id
           ${where}
           ORDER BY a.timestamp DESC
           LIMIT ? OFFSET ?`,
          [...params, l, offset],
        ),
        count(`SELECT COUNT(*) as count FROM sarga_audit_logs a ${where}`, params),
      ]);

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ logs, total, page: p, limit: l, pages: Math.ceil(total / l) }) }],
      };
    },
  );

  // ─── 3. list_staff ─────────────────────────────────────
  server.tool(
    'list_staff',
    'List all staff members with their roles, branches, and active status',
    {
      branch_id: z.number().optional().describe('Filter by branch ID'),
      role: z.string().optional().describe('Filter by role (Admin, Accountant, Front Office, Staff, etc.)'),
      active_only: z.boolean().optional().default(true).describe('Show only active staff'),
    },
    async ({ branch_id, role, active_only }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (active_only) {
        conditions.push('s.is_active = 1');
      }
      if (branch_id) {
        conditions.push('s.branch_id = ?');
        params.push(branch_id);
      }
      if (role) {
        conditions.push('s.role = ?');
        params.push(role);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const staff = await selectAll(
        `SELECT s.id, s.user_id, s.name, s.role, s.branch_id, b.name as branch_name,
                s.salary_type, s.base_salary, s.daily_rate, s.is_active, s.created_at
         FROM sarga_staff s
         LEFT JOIN sarga_branches b ON s.branch_id = b.id
         ${where}
         ORDER BY s.name`,
        params,
      );

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ staff, total: staff.length }) }],
      };
    },
  );

  // ─── 4. get_branch_info ────────────────────────────────
  server.tool(
    'get_branch_info',
    'Get details about all Sarga Prints branches (Perambra, Meppayur)',
    {
      branch_id: z.number().optional().describe('Specific branch ID (omit for all branches)'),
    },
    async ({ branch_id }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (branch_id) {
        conditions.push('id = ?');
        params.push(branch_id);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const branches = await selectAll(
        `SELECT id, name, address, phone, email, short_name, upi_id, created_at
         FROM sarga_branches ${where}
         ORDER BY id`,
        params,
      );

      // Get staff count per branch
      const staffCounts = await selectAll<{ branch_id: number; count: number }>(
        `SELECT branch_id, COUNT(*) as count FROM sarga_staff
         WHERE is_active = 1 GROUP BY branch_id`,
      );

      const staffMap = new Map(staffCounts.map(s => [s.branch_id, s.count]));
      const enriched = (branches as any[]).map(b => ({
        ...b,
        staff_count: staffMap.get(b.id) ?? 0,
      }));

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ branches: enriched }) }],
      };
    },
  );
}

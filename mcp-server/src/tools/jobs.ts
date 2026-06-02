/**
 * MCP Tools — Job Management (6 tools)
 *
 * Tools: create_job, get_job_status, update_job_status,
 *        list_jobs, allocate_job_resources, calculate_job_cost
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { selectAll, selectOne, count, insert, execute, auditLog, transaction } from '../services/db.js';
import { formatToolResult, parsePagination, formatCurrency, toSqlDate } from '../utils/formatters.js';
import { cacheInvalidate } from '../services/cache.js';

export function registerJobTools(server: McpServer): void {

  // ─── 1. create_job ─────────────────────────────────────
  server.tool(
    'create_job',
    'Create a new print job for a customer. Generates a unique job number.',
    {
      customer_id: z.number().optional().describe('Customer ID (optional for walk-in)'),
      job_name: z.string().describe('Job name/description'),
      branch_id: z.number().describe('Branch ID'),
      quantity: z.number().optional().default(1),
      unit_price: z.number().optional().default(0),
      total_amount: z.number().optional().default(0),
      advance_paid: z.number().optional().default(0),
      category: z.string().optional().describe('Product category'),
      subcategory: z.string().optional().describe('Product subcategory'),
      delivery_date: z.string().optional().describe('Expected delivery date (YYYY-MM-DD)'),
      priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional().default('Medium'),
      description: z.string().optional(),
    },
    async ({ customer_id, job_name, branch_id, quantity, unit_price, total_amount, advance_paid, category, subcategory, delivery_date, priority, description }) => {
      const result = await transaction(async (conn) => {
        // Generate job number: BR-YYMMDD-SEQ
        const today = toSqlDate(undefined);
        const dateCode = today.replace(/-/g, '').slice(2); // YYMMDD

        // Get branch short name
        const [branchRows] = await conn.query('SELECT short_name FROM sarga_branches WHERE id = ?', [branch_id]);
        const branchCode = (branchRows as any[])[0]?.short_name || 'SAR';

        // Get and increment sequence
        await conn.query(
          `INSERT INTO sarga_job_seq (branch_id, seq_date, last_seq)
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE last_seq = last_seq + 1`,
          [branch_id, today],
        );
        const [seqRows] = await conn.query(
          'SELECT last_seq FROM sarga_job_seq WHERE branch_id = ? AND seq_date = ?',
          [branch_id, today],
        );
        const seq = String((seqRows as any[])[0].last_seq).padStart(3, '0');
        const jobNumber = `${branchCode}-${dateCode}-${seq}`;

        const balance = total_amount - advance_paid;
        const paymentStatus = advance_paid >= total_amount ? 'Paid' : (advance_paid > 0 ? 'Partial' : 'Unpaid');

        const [jobResult] = await conn.query(
          `INSERT INTO sarga_jobs (customer_id, branch_id, job_number, job_name, description,
             quantity, unit_price, total_amount, advance_paid, balance_amount,
             category, subcategory, delivery_date, priority, status, payment_status, entry_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
          [customer_id || null, branch_id, jobNumber, job_name, description || null,
           quantity, unit_price, total_amount, advance_paid, balance,
           category || null, subcategory || null, delivery_date || null, priority,
           paymentStatus, today],
        );

        const jobId = (jobResult as any).insertId;

        // Record initial status in history
        await conn.query(
          `INSERT INTO sarga_job_status_history (job_id, status) VALUES (?, 'Pending')`,
          [jobId],
        );

        return { job_id: jobId, job_number: jobNumber, balance, payment_status: paymentStatus };
      });

      await auditLog(null, 'JOB_CREATE', `Created job ${result.job_number}: ${job_name}`, { entity_type: 'job', entity_id: result.job_id });
      cacheInvalidate('job');

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ success: true, ...result }),
        }],
      };
    },
  );

  // ─── 2. get_job_status ─────────────────────────────────
  server.tool(
    'get_job_status',
    'Get full details for a job including status timeline, cost breakdown, staff assignments, and customer info',
    {
      job_id: z.number().optional().describe('Job ID'),
      job_number: z.string().optional().describe('Job number (e.g., PBA-260602-001)'),
    },
    async ({ job_id, job_number }) => {
      let job: any;

      if (job_id) {
        job = await selectOne(
          `SELECT j.*, c.name as customer_name, c.mobile as customer_mobile,
                  b.name as branch_name, m.machine_name
           FROM sarga_jobs j
           LEFT JOIN sarga_customers c ON j.customer_id = c.id
           LEFT JOIN sarga_branches b ON j.branch_id = b.id
           LEFT JOIN sarga_machines m ON j.machine_id = m.id
           WHERE j.id = ?`, [job_id],
        );
      } else if (job_number) {
        job = await selectOne(
          `SELECT j.*, c.name as customer_name, c.mobile as customer_mobile,
                  b.name as branch_name, m.machine_name
           FROM sarga_jobs j
           LEFT JOIN sarga_customers c ON j.customer_id = c.id
           LEFT JOIN sarga_branches b ON j.branch_id = b.id
           LEFT JOIN sarga_machines m ON j.machine_id = m.id
           WHERE j.job_number = ?`, [job_number],
        );
      }

      if (!job) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Job not found' }) }] };
      }

      // Status timeline
      const timeline = await selectAll(
        `SELECT jsh.status, jsh.changed_at, s.name as changed_by
         FROM sarga_job_status_history jsh
         LEFT JOIN sarga_staff s ON jsh.staff_id = s.id
         WHERE jsh.job_id = ?
         ORDER BY jsh.changed_at`,
        [job.id],
      );

      // Staff assignments
      const assignments = await selectAll(
        `SELECT jsa.role, jsa.status, jsa.assigned_date, jsa.completed_date,
                s.name as staff_name
         FROM sarga_job_staff_assignments jsa
         JOIN sarga_staff s ON jsa.staff_id = s.id
         WHERE jsa.job_id = ?`,
        [job.id],
      );

      // Paper usage
      const paperUsage = await selectAll(
        `SELECT stage, paper_size, sheets_used, sheets_wasted, notes, created_at
         FROM sarga_paper_usage_logs WHERE job_id = ? ORDER BY created_at`,
        [job.id],
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ job, timeline, staff_assignments: assignments, paper_usage: paperUsage }),
        }],
      };
    },
  );

  // ─── 3. update_job_status ──────────────────────────────
  server.tool(
    'update_job_status',
    'Update a job\'s status (e.g., Pending → Printing → Completed). Records status change in history.',
    {
      job_id: z.number().describe('Job ID'),
      new_status: z.enum([
        'Pending', 'Processing', 'Designing', 'Printing', 'Cutting',
        'Lamination', 'Binding', 'Production', 'Approval Pending',
        'Completed', 'Delivered', 'Cancelled',
      ]).describe('New job status'),
      notes: z.string().optional().describe('Notes about this status change'),
    },
    async ({ job_id, new_status, notes }) => {
      const job = await selectOne<{ id: number; status: string; job_number: string }>(
        'SELECT id, status, job_number FROM sarga_jobs WHERE id = ?', [job_id],
      );
      if (!job) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Job not found' }) }] };
      }

      const oldStatus = (job as any).status;
      await execute('UPDATE sarga_jobs SET status = ? WHERE id = ?', [new_status, job_id]);

      // Record in history
      await insert(
        `INSERT INTO sarga_job_status_history (job_id, status) VALUES (?, ?)`,
        [job_id, new_status],
      );

      await auditLog(null, 'JOB_STATUS_UPDATE', `Job ${(job as any).job_number}: ${oldStatus} → ${new_status}${notes ? '. Notes: ' + notes : ''}`, { entity_type: 'job', entity_id: job_id });
      cacheInvalidate('job');

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ success: true, job_id, job_number: (job as any).job_number, old_status: oldStatus, new_status }),
        }],
      };
    },
  );

  // ─── 4. list_jobs ──────────────────────────────────────
  server.tool(
    'list_jobs',
    'List jobs with filtering by status, date range, customer, branch, or priority',
    {
      status: z.string().optional().describe('Filter by status (Pending, Printing, Completed, etc.)'),
      customer_id: z.number().optional().describe('Filter by customer ID'),
      branch_id: z.number().optional().describe('Filter by branch ID'),
      priority: z.string().optional().describe('Filter by priority (Low, Medium, High, Urgent)'),
      from_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      to_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
      overdue_only: z.boolean().optional().default(false).describe('Show only overdue jobs'),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
    },
    async ({ status, customer_id, branch_id, priority, from_date, to_date, overdue_only, page, limit }) => {
      const { page: p, limit: l, offset } = parsePagination(page, limit);
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (status) {
        conditions.push('j.status = ?');
        params.push(status);
      }
      if (customer_id) {
        conditions.push('j.customer_id = ?');
        params.push(customer_id);
      }
      if (branch_id) {
        conditions.push('j.branch_id = ?');
        params.push(branch_id);
      }
      if (priority) {
        conditions.push('j.priority = ?');
        params.push(priority);
      }
      if (from_date) {
        conditions.push('j.created_at >= ?');
        params.push(from_date);
      }
      if (to_date) {
        conditions.push('j.created_at <= ?');
        params.push(to_date + ' 23:59:59');
      }
      if (overdue_only) {
        conditions.push("j.delivery_date < CURDATE() AND j.status NOT IN ('Completed', 'Delivered', 'Cancelled')");
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [jobs, total] = await Promise.all([
        selectAll(
          `SELECT j.id, j.job_number, j.job_name, j.status, j.payment_status,
                  j.quantity, j.total_amount, j.advance_paid, j.balance_amount,
                  j.delivery_date, j.priority, j.category, j.created_at,
                  c.name as customer_name, c.mobile as customer_mobile,
                  b.name as branch_name,
                  CASE WHEN j.delivery_date < CURDATE() AND j.status NOT IN ('Completed', 'Delivered', 'Cancelled')
                       THEN DATEDIFF(CURDATE(), j.delivery_date) ELSE 0 END as days_overdue
           FROM sarga_jobs j
           LEFT JOIN sarga_customers c ON j.customer_id = c.id
           LEFT JOIN sarga_branches b ON j.branch_id = b.id
           ${where}
           ORDER BY j.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, l, offset],
        ),
        count(`SELECT COUNT(*) as count FROM sarga_jobs j ${where}`, params),
      ]);

      // Count overdue
      const overdueCount = await count(
        `SELECT COUNT(*) as count FROM sarga_jobs
         WHERE delivery_date < CURDATE() AND status NOT IN ('Completed', 'Delivered', 'Cancelled')`,
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ jobs, total, page: p, limit: l, pages: Math.ceil(total / l), overdue_count: overdueCount }),
        }],
      };
    },
  );

  // ─── 5. allocate_job_resources ─────────────────────────
  server.tool(
    'allocate_job_resources',
    'Assign staff members and machines to a job',
    {
      job_id: z.number().describe('Job ID'),
      staff_ids: z.array(z.number()).optional().describe('Staff IDs to assign'),
      machine_id: z.number().optional().describe('Machine ID to assign'),
      role: z.string().optional().default('operator').describe('Role for assigned staff'),
    },
    async ({ job_id, staff_ids, machine_id, role }) => {
      const job = await selectOne('SELECT id, job_number FROM sarga_jobs WHERE id = ?', [job_id]);
      if (!job) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Job not found' }) }] };
      }

      const assigned: string[] = [];

      // Assign staff
      if (staff_ids && staff_ids.length > 0) {
        for (const staffId of staff_ids) {
          try {
            await insert(
              `INSERT INTO sarga_job_staff_assignments (job_id, staff_id, role, status)
               VALUES (?, ?, ?, 'Pending')`,
              [job_id, staffId, role],
            );
            const staff = await selectOne<{ name: string }>('SELECT name FROM sarga_staff WHERE id = ?', [staffId]);
            assigned.push(`Staff: ${(staff as any)?.name || staffId}`);
          } catch (err: any) {
            if (err?.code === 'ER_DUP_ENTRY') {
              assigned.push(`Staff ${staffId}: already assigned`);
            } else {
              throw err;
            }
          }
        }
      }

      // Assign machine
      if (machine_id) {
        await execute('UPDATE sarga_jobs SET machine_id = ? WHERE id = ?', [machine_id, job_id]);
        const machine = await selectOne<{ machine_name: string }>('SELECT machine_name FROM sarga_machines WHERE id = ?', [machine_id]);
        assigned.push(`Machine: ${(machine as any)?.machine_name || machine_id}`);
      }

      await auditLog(null, 'JOB_ALLOCATE', `Allocated resources to job ${(job as any).job_number}: ${assigned.join(', ')}`, { entity_type: 'job', entity_id: job_id });

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ success: true, job_id, job_number: (job as any).job_number, allocations: assigned }) }],
      };
    },
  );

  // ─── 6. calculate_job_cost ─────────────────────────────
  server.tool(
    'calculate_job_cost',
    'Calculate or retrieve the full cost breakdown for a job (paper, machine, labour, overhead)',
    {
      job_id: z.number().describe('Job ID'),
    },
    async ({ job_id }) => {
      const job = await selectOne(
        `SELECT j.*, c.name as customer_name, b.name as branch_name, m.machine_name
         FROM sarga_jobs j
         LEFT JOIN sarga_customers c ON j.customer_id = c.id
         LEFT JOIN sarga_branches b ON j.branch_id = b.id
         LEFT JOIN sarga_machines m ON j.machine_id = m.id
         WHERE j.id = ?`, [job_id],
      );

      if (!job) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Job not found' }) }] };
      }

      // Paper usage cost
      const paperUsage = await selectAll<{ total_used: number; total_wasted: number }>(
        `SELECT COALESCE(SUM(sheets_used), 0) as total_used,
                COALESCE(SUM(sheets_wasted), 0) as total_wasted
         FROM sarga_paper_usage_logs WHERE job_id = ?`, [job_id],
      );

      const j = job as any;
      const paperCost = Number(j.paper_cost || 0);
      const machineCost = Number(j.machine_cost || 0);
      const labourCost = Number(j.labour_cost || 0);
      const totalCost = Number(j.total_cost || 0) || (paperCost + machineCost + labourCost);
      const revenue = Number(j.total_amount || 0);
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            job: { id: j.id, number: j.job_number, name: j.job_name, customer: j.customer_name },
            cost_breakdown: {
              paper_cost: formatCurrency(paperCost),
              machine_cost: formatCurrency(machineCost),
              labour_cost: formatCurrency(labourCost),
              total_cost: formatCurrency(totalCost),
            },
            revenue: formatCurrency(revenue),
            profit: formatCurrency(profit),
            profit_margin: `${margin.toFixed(1)}%`,
            paper_usage: {
              sheets_used: (paperUsage[0] as any)?.total_used || 0,
              sheets_wasted: (paperUsage[0] as any)?.total_wasted || 0,
            },
          }),
        }],
      };
    },
  );
}

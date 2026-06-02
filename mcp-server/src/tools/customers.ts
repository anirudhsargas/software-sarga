/**
 * MCP Tools — Customer & Orders (6 tools)
 *
 * Tools: get_customer_info, create_order, get_order_details,
 *        list_orders, list_customers, update_customer
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { selectAll, selectOne, count, insert, execute, auditLog } from '../services/db.js';
import { formatToolResult, parsePagination, formatCurrency } from '../utils/formatters.js';
import { cacheInvalidate } from '../services/cache.js';

export function registerCustomerTools(server: McpServer): void {

  // ─── 1. get_customer_info ──────────────────────────────
  server.tool(
    'get_customer_info',
    'Get full customer profile including order history, total spent, job count, and preferred services',
    {
      customer_id: z.number().optional().describe('Customer ID'),
      mobile: z.string().optional().describe('Customer mobile number'),
      include_orders: z.boolean().optional().default(false).describe('Include recent orders'),
      include_jobs: z.boolean().optional().default(false).describe('Include recent jobs'),
    },
    async ({ customer_id, mobile, include_orders, include_jobs }) => {
      let customer: any;

      if (customer_id) {
        customer = await selectOne('SELECT * FROM sarga_customers WHERE id = ?', [customer_id]);
      } else if (mobile) {
        customer = await selectOne('SELECT * FROM sarga_customers WHERE mobile = ?', [mobile]);
      }

      if (!customer) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Customer not found' }) }] };
      }

      // Spending summary
      const spending = await selectOne<{ total_spent: number; order_count: number; avg_order: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as total_spent,
                COUNT(*) as order_count,
                COALESCE(AVG(total_amount), 0) as avg_order
         FROM sarga_customer_payments WHERE customer_id = ?`,
        [customer.id],
      );

      // Job summary
      const jobSummary = await selectOne<{ total_jobs: number; active_jobs: number }>(
        `SELECT COUNT(*) as total_jobs,
                SUM(CASE WHEN status NOT IN ('Completed', 'Delivered', 'Cancelled') THEN 1 ELSE 0 END) as active_jobs
         FROM sarga_jobs WHERE customer_id = ?`,
        [customer.id],
      );

      // Last order date
      const lastOrder = await selectOne<{ last_date: string }>(
        `SELECT MAX(payment_date) as last_date FROM sarga_customer_payments WHERE customer_id = ?`,
        [customer.id],
      );

      // Most used categories
      const topCategories = await selectAll(
        `SELECT category, COUNT(*) as count FROM sarga_jobs
         WHERE customer_id = ? AND category IS NOT NULL
         GROUP BY category ORDER BY count DESC LIMIT 5`,
        [customer.id],
      );

      const result: any = {
        customer,
        summary: {
          total_spent: formatCurrency(Number((spending as any)?.total_spent || 0)),
          order_count: (spending as any)?.order_count || 0,
          avg_order_value: formatCurrency(Number((spending as any)?.avg_order || 0)),
          total_jobs: (jobSummary as any)?.total_jobs || 0,
          active_jobs: (jobSummary as any)?.active_jobs || 0,
          last_order_date: (lastOrder as any)?.last_date || null,
          preferred_services: topCategories,
        },
      };

      if (include_orders) {
        result.recent_orders = await selectAll(
          `SELECT id, customer_name, total_amount, payment_method, payment_date,
                  balance_amount, book_type, branch_id
           FROM sarga_customer_payments
           WHERE customer_id = ?
           ORDER BY payment_date DESC LIMIT 10`,
          [customer.id],
        );
      }

      if (include_jobs) {
        result.recent_jobs = await selectAll(
          `SELECT id, job_number, job_name, status, payment_status,
                  total_amount, delivery_date, priority, created_at
           FROM sarga_jobs
           WHERE customer_id = ?
           ORDER BY created_at DESC LIMIT 10`,
          [customer.id],
        );
      }

      return { content: [{ type: 'text' as const, text: formatToolResult(result) }] };
    },
  );

  // ─── 2. create_order ───────────────────────────────────
  server.tool(
    'create_order',
    'Create a customer billing record / order with payment details',
    {
      customer_id: z.number().optional().describe('Customer ID'),
      customer_name: z.string().describe('Customer name'),
      customer_mobile: z.string().optional(),
      bill_amount: z.number().describe('Bill amount before tax'),
      total_amount: z.number().describe('Total amount including tax'),
      payment_method: z.enum(['Cash', 'UPI', 'Both', 'Cheque', 'Account Transfer']).default('Cash'),
      cash_amount: z.number().optional().default(0),
      upi_amount: z.number().optional().default(0),
      advance_paid: z.number().optional().default(0),
      branch_id: z.number().describe('Branch ID'),
      description: z.string().optional(),
      payment_date: z.string().describe('Payment date (YYYY-MM-DD)'),
      book_type: z.enum(['Offset', 'Laser']).optional().default('Offset'),
      discount_percent: z.number().optional().default(0),
      order_lines: z.string().optional().describe('JSON string of order line items'),
    },
    async (args) => {
      const balance = args.total_amount - args.advance_paid;
      const netAmount = args.bill_amount * (1 - args.discount_percent / 100);
      const discountAmount = args.bill_amount * (args.discount_percent / 100);

      const id = await insert(
        `INSERT INTO sarga_customer_payments
           (customer_id, customer_name, customer_mobile, bill_amount, total_amount,
            net_amount, advance_paid, balance_amount, payment_method,
            cash_amount, upi_amount, branch_id, description, payment_date,
            book_type, discount_percent, discount_amount, order_lines)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [args.customer_id || null, args.customer_name, args.customer_mobile || null,
         args.bill_amount, args.total_amount, netAmount, args.advance_paid, balance,
         args.payment_method, args.cash_amount, args.upi_amount, args.branch_id,
         args.description || null, args.payment_date, args.book_type,
         args.discount_percent, discountAmount, args.order_lines || null],
      );

      await auditLog(null, 'ORDER_CREATE', `Created order #${id} for ${args.customer_name}: ${formatCurrency(args.total_amount)}`, { entity_type: 'customer_payment', entity_id: id });
      cacheInvalidate('order');
      cacheInvalidate('customer');

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ success: true, order_id: id, total_amount: formatCurrency(args.total_amount), balance_due: formatCurrency(balance) }),
        }],
      };
    },
  );

  // ─── 3. get_order_details ──────────────────────────────
  server.tool(
    'get_order_details',
    'Get full details for a specific customer order/payment',
    {
      order_id: z.number().describe('Order/Payment ID'),
    },
    async ({ order_id }) => {
      const order = await selectOne(
        `SELECT cp.*, b.name as branch_name
         FROM sarga_customer_payments cp
         LEFT JOIN sarga_branches b ON cp.branch_id = b.id
         WHERE cp.id = ?`,
        [order_id],
      );

      if (!order) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Order not found' }) }] };
      }

      // Find linked jobs
      const jobs = await selectAll(
        `SELECT id, job_number, job_name, status, total_amount
         FROM sarga_jobs WHERE payment_id = ? OR customer_id = ?`,
        [order_id, (order as any).customer_id],
      );

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ order, linked_jobs: jobs }) }],
      };
    },
  );

  // ─── 4. list_orders ────────────────────────────────────
  server.tool(
    'list_orders',
    'List customer orders/payments with filtering by date, customer, branch, payment method, or book type',
    {
      customer_id: z.number().optional(),
      branch_id: z.number().optional(),
      payment_method: z.string().optional(),
      book_type: z.string().optional().describe('Offset or Laser'),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      has_balance: z.boolean().optional().describe('Only orders with outstanding balance'),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
    },
    async ({ customer_id, branch_id, payment_method, book_type, from_date, to_date, has_balance, page, limit }) => {
      const { page: p, limit: l, offset } = parsePagination(page, limit);
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (customer_id) { conditions.push('cp.customer_id = ?'); params.push(customer_id); }
      if (branch_id) { conditions.push('cp.branch_id = ?'); params.push(branch_id); }
      if (payment_method) { conditions.push('cp.payment_method = ?'); params.push(payment_method); }
      if (book_type) { conditions.push('cp.book_type = ?'); params.push(book_type); }
      if (from_date) { conditions.push('cp.payment_date >= ?'); params.push(from_date); }
      if (to_date) { conditions.push('cp.payment_date <= ?'); params.push(to_date); }
      if (has_balance) { conditions.push('cp.balance_amount > 0'); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [orders, total] = await Promise.all([
        selectAll(
          `SELECT cp.id, cp.customer_name, cp.customer_mobile, cp.total_amount,
                  cp.advance_paid, cp.balance_amount, cp.payment_method,
                  cp.payment_date, cp.book_type, cp.branch_id, cp.description,
                  b.name as branch_name
           FROM sarga_customer_payments cp
           LEFT JOIN sarga_branches b ON cp.branch_id = b.id
           ${where}
           ORDER BY cp.payment_date DESC
           LIMIT ? OFFSET ?`,
          [...params, l, offset],
        ),
        count(`SELECT COUNT(*) as count FROM sarga_customer_payments cp ${where}`, params),
      ]);

      // Revenue total
      const revTotal = await selectOne<{ revenue: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as revenue FROM sarga_customer_payments cp ${where}`,
        params,
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ orders, total, page: p, limit: l, pages: Math.ceil(total / l), total_revenue: formatCurrency(Number((revTotal as any)?.revenue || 0)) }),
        }],
      };
    },
  );

  // ─── 5. list_customers ─────────────────────────────────
  server.tool(
    'list_customers',
    'Search and list customers. Filter by name, mobile, type, or branch.',
    {
      search: z.string().optional().describe('Search by name or mobile'),
      type: z.enum(['Walk-in', 'Retail', 'Offset', 'all']).optional().default('all'),
      branch_id: z.number().optional(),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
    },
    async ({ search, type, branch_id, page, limit }) => {
      const { page: p, limit: l, offset } = parsePagination(page, limit);
      const conditions: string[] = ["client_type = 'customer'"];
      const params: unknown[] = [];

      if (search) {
        conditions.push('(name LIKE ? OR mobile LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }
      if (type && type !== 'all') { conditions.push('type = ?'); params.push(type); }
      if (branch_id) { conditions.push('branch_id = ?'); params.push(branch_id); }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const [customers, total] = await Promise.all([
        selectAll(
          `SELECT id, mobile, name, type, email, gst, address, branch_id, created_at
           FROM sarga_customers ${where}
           ORDER BY name LIMIT ? OFFSET ?`,
          [...params, l, offset],
        ),
        count(`SELECT COUNT(*) as count FROM sarga_customers ${where}`, params),
      ]);

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ customers, total, page: p, limit: l, pages: Math.ceil(total / l) }) }],
      };
    },
  );

  // ─── 6. update_customer ────────────────────────────────
  server.tool(
    'update_customer',
    'Update customer details (name, email, address, GST, etc.)',
    {
      customer_id: z.number().describe('Customer ID'),
      name: z.string().optional(),
      mobile: z.string().optional(),
      email: z.string().optional(),
      gst: z.string().optional(),
      address: z.string().optional(),
      type: z.enum(['Walk-in', 'Retail', 'Offset']).optional(),
    },
    async (args) => {
      const { customer_id, ...updates } = args;
      const customer = await selectOne('SELECT id, name FROM sarga_customers WHERE id = ?', [customer_id]);
      if (!customer) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Customer not found' }) }] };
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) { sets.push(`${key} = ?`); params.push(value); }
      }
      if (sets.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No updates provided' }) }] };
      }

      params.push(customer_id);
      await execute(`UPDATE sarga_customers SET ${sets.join(', ')} WHERE id = ?`, params);

      await auditLog(null, 'CUSTOMER_UPDATE', `Updated customer ${(customer as any).name}`, { entity_type: 'customer', entity_id: customer_id });
      cacheInvalidate('customer');

      const updated = await selectOne('SELECT * FROM sarga_customers WHERE id = ?', [customer_id]);
      return { content: [{ type: 'text' as const, text: formatToolResult({ success: true, customer: updated }) }] };
    },
  );
}

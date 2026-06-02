/**
 * MCP Tools — Payment Processing (5 tools)
 *
 * Tools: get_payment_summary, record_payment, get_receivables,
 *        get_payables, get_daily_cash_summary
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { selectAll, selectOne, count, insert, execute, auditLog, transaction } from '../services/db.js';
import { formatToolResult, formatCurrency, daysAgo } from '../utils/formatters.js';
import { cacheInvalidate } from '../services/cache.js';

export function registerPaymentTools(server: McpServer): void {

  // ─── 1. get_payment_summary ────────────────────────────
  server.tool(
    'get_payment_summary',
    'Get aggregate incoming and outgoing payments by method over a date range',
    {
      from_date: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to 30 days ago'),
      to_date: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
      branch_id: z.number().optional().describe('Filter by branch'),
    },
    async ({ from_date, to_date, branch_id }) => {
      const start = from_date || daysAgo(30);
      const end = to_date || new Date().toISOString().split('T')[0];

      const conditions = [];
      const params = [start, end];
      if (branch_id) {
        conditions.push('branch_id = ?');
        params.push(String(branch_id));
      }
      const whereStr = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

      // Incoming (Customer Payments)
      const incoming = await selectAll<{ payment_method: string; total_amount: number; count: number }>(
        `SELECT payment_method, COALESCE(SUM(total_amount), 0) as total_amount, COUNT(*) as count
         FROM sarga_customer_payments
         WHERE payment_date BETWEEN ? AND ? ${whereStr}
         GROUP BY payment_method`,
        params,
      );

      // Outgoing (Vendor Payments + General Expenses)
      // Note: General payments table uses `payment_date` and `payment_method`
      const outgoingGeneral = await selectAll<{ type: string; total_amount: number }>(
        `SELECT type, COALESCE(SUM(amount), 0) as total_amount
         FROM sarga_payments
         WHERE payment_date BETWEEN ? AND ? ${whereStr}
         GROUP BY type`,
        params,
      );

      const vendorParams = [start, end];
      // Vendor payments don't natively have branch_id unless linked, so we omit branch filter for vendors if it's strictly needed, or assume global.

      const outgoingVendor = await selectOne<{ total_amount: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total_amount
         FROM vendor_payments
         WHERE payment_date BETWEEN ? AND ?`,
        vendorParams,
      );

      const incomingTotal = incoming.reduce((sum, row) => sum + Number(row.total_amount), 0);
      const outgoingTotal = outgoingGeneral.reduce((sum, row) => sum + Number(row.total_amount), 0) + Number((outgoingVendor as any)?.total_amount || 0);

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            period: { from: start, to: end },
            incoming_payments: {
              by_method: incoming,
              total: formatCurrency(incomingTotal),
            },
            outgoing_payments: {
              general_by_type: outgoingGeneral,
              vendor_payments: formatCurrency(Number((outgoingVendor as any)?.total_amount || 0)),
              total: formatCurrency(outgoingTotal),
            },
            net_cash_flow: formatCurrency(incomingTotal - outgoingTotal),
          }),
        }],
      };
    },
  );

  // ─── 2. record_payment ─────────────────────────────────
  server.tool(
    'record_payment',
    'Record a general outgoing payment (Utility, Salary, Rent, Other)',
    {
      branch_id: z.number().describe('Branch ID'),
      type: z.enum(['Utility', 'Salary', 'Rent', 'Other']).describe('Expense type'),
      payee_name: z.string().describe('Who is being paid'),
      amount: z.number().positive().describe('Payment amount'),
      payment_method: z.enum(['Cash', 'UPI', 'Cheque', 'Account Transfer', 'Bank Transfer']).default('Cash'),
      payment_date: z.string().describe('Payment date (YYYY-MM-DD)'),
      reference_number: z.string().optional(),
      description: z.string().optional(),
    },
    async (args) => {
      const id = await insert(
        `INSERT INTO sarga_payments (branch_id, type, payee_name, amount, payment_method, payment_date, reference_number, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [args.branch_id, args.type, args.payee_name, args.amount, args.payment_method, args.payment_date, args.reference_number || null, args.description || null],
      );

      await auditLog(null, 'PAYMENT_CREATE', `Recorded ${args.type} payment to ${args.payee_name}: ${formatCurrency(args.amount)}`, { entity_type: 'payment', entity_id: id });

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ success: true, payment_id: id, amount: formatCurrency(args.amount) }) }],
      };
    },
  );

  // ─── 3. get_receivables ────────────────────────────────
  server.tool(
    'get_receivables',
    'Get outstanding customer receivables (money owed to us) with aging analysis',
    {
      branch_id: z.number().optional().describe('Filter by branch'),
    },
    async ({ branch_id }) => {
      const params: unknown[] = [];
      const branchFilter = branch_id ? 'AND branch_id = ?' : '';
      if (branch_id) params.push(branch_id);

      // Using the credit_customers table directly
      const creditCustomers = await selectAll(
        `SELECT c.id, c.customer_name, c.customer_phone, c.credit_limit, c.current_balance, b.name as branch_name
         FROM sarga_credit_customers c
         LEFT JOIN sarga_branches b ON c.branch_id = b.id
         WHERE c.current_balance > 0 ${branchFilter}
         ORDER BY c.current_balance DESC`,
        params,
      );

      // Also grab unpaid walk-in orders (balances on payments)
      const unpaidOrders = await selectAll(
        `SELECT id, customer_name, customer_mobile, balance_amount as balance, payment_date,
                DATEDIFF(CURDATE(), payment_date) as days_overdue
         FROM sarga_customer_payments
         WHERE balance_amount > 0 AND customer_id IS NULL ${branchFilter}
         ORDER BY balance_amount DESC`,
        params,
      );

      const totalCreditBalance = (creditCustomers as any[]).reduce((sum, c) => sum + Number(c.current_balance), 0);
      const totalUnpaidOrders = (unpaidOrders as any[]).reduce((sum, o) => sum + Number(o.balance), 0);

      // Aging (based on credit ledger for customers)
      const aging = {
        '0-30_days': 0,
        '31-60_days': 0,
        '61-90_days': 0,
        'over_90_days': 0,
      };

      for (const order of unpaidOrders as any[]) {
        if (order.days_overdue <= 30) aging['0-30_days'] += Number(order.balance);
        else if (order.days_overdue <= 60) aging['31-60_days'] += Number(order.balance);
        else if (order.days_overdue <= 90) aging['61-90_days'] += Number(order.balance);
        else aging['over_90_days'] += Number(order.balance);
      }

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            total_receivables: formatCurrency(totalCreditBalance + totalUnpaidOrders),
            credit_accounts: {
              total: formatCurrency(totalCreditBalance),
              customers: creditCustomers,
            },
            unpaid_walkins: {
              total: formatCurrency(totalUnpaidOrders),
              orders: unpaidOrders,
              aging_analysis: {
                '0-30_days': formatCurrency(aging['0-30_days']),
                '31-60_days': formatCurrency(aging['31-60_days']),
                '61-90_days': formatCurrency(aging['61-90_days']),
                'over_90_days': formatCurrency(aging['over_90_days']),
              },
            },
          }),
        }],
      };
    },
  );

  // ─── 4. get_payables ───────────────────────────────────
  server.tool(
    'get_payables',
    'Get outstanding vendor payables (money we owe) with aging analysis',
    {},
    async () => {
      const payables = await selectAll(
        `SELECT v.id as vendor_id, v.name as vendor_name,
                vi.id as invoice_id, vi.invoice_number, vi.amount, vi.paid_amount,
                (vi.amount - vi.paid_amount) as balance,
                vi.invoice_date, vi.due_date,
                DATEDIFF(CURDATE(), vi.due_date) as days_overdue
         FROM vendor_invoices vi
         JOIN vendors v ON vi.vendor_id = v.id
         WHERE vi.status IN ('pending', 'partial', 'overdue') AND (vi.amount - vi.paid_amount) > 0
         ORDER BY vi.due_date ASC`,
      );

      const totalPayable = (payables as any[]).reduce((sum, p) => sum + Number(p.balance), 0);
      const overdueTotal = (payables as any[]).filter(p => p.days_overdue > 0).reduce((sum, p) => sum + Number(p.balance), 0);

      const aging = {
        'not_due': 0,
        '1-15_days_overdue': 0,
        '16-30_days_overdue': 0,
        'over_30_days_overdue': 0,
      };

      for (const p of payables as any[]) {
        if (p.days_overdue <= 0) aging.not_due += Number(p.balance);
        else if (p.days_overdue <= 15) aging['1-15_days_overdue'] += Number(p.balance);
        else if (p.days_overdue <= 30) aging['16-30_days_overdue'] += Number(p.balance);
        else aging.over_30_days_overdue += Number(p.balance);
      }

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            total_payables: formatCurrency(totalPayable),
            total_overdue: formatCurrency(overdueTotal),
            aging_analysis: {
              not_due: formatCurrency(aging.not_due),
              '1-15_days_overdue': formatCurrency(aging['1-15_days_overdue']),
              '16-30_days_overdue': formatCurrency(aging['16-30_days_overdue']),
              'over_30_days_overdue': formatCurrency(aging.over_30_days_overdue),
            },
            invoices: payables,
          }),
        }],
      };
    },
  );

  // ─── 5. get_daily_cash_summary ─────────────────────────
  server.tool(
    'get_daily_cash_summary',
    'Get cash position by branch and book type (Offset, Laser, Other) for a specific date',
    {
      report_date: z.string().optional().describe('Date (YYYY-MM-DD), defaults to today'),
      branch_id: z.number().optional().describe('Filter by branch'),
    },
    async ({ report_date, branch_id }) => {
      const date = report_date || new Date().toISOString().split('T')[0];
      const params: unknown[] = [date];
      const branchFilter = branch_id ? 'AND branch_id = ?' : '';
      if (branch_id) params.push(branch_id);

      // Offset Daily Report
      const offsetReport = await selectAll(
        `SELECT branch_id, opening_balance, closing_balance, total_collected, total_expenses, status
         FROM sarga_daily_report_offset
         WHERE report_date = ? ${branchFilter}`,
        params,
      );

      // Machine Daily Report (Laser / Other)
      const machineReport = await selectAll(
        `SELECT branch_id, machine_id, book_type, total_cash, total_credit, total_amount, status
         FROM sarga_daily_report_machine
         WHERE report_date = ? ${branchFilter}`,
        params,
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            report_date: date,
            offset_cash_books: offsetReport,
            machine_cash_books: machineReport,
          }),
        }],
      };
    },
  );
}

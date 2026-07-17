/**
 * MCP Tools — Vendor Management (6 tools)
 *
 * Tools: list_vendors, get_vendor_details, create_vendor_transaction,
 *        get_vendor_ledger, update_vendor, reconcile_vendor_account
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { selectAll, selectOne, count, insert, execute, paginatedQuery, auditLog, transaction } from '../services/db.js';
import { formatToolResult, parsePagination, formatCurrency, startOfMonth, endOfMonth } from '../utils/formatters.js';
import { cached, cacheInvalidate } from '../services/cache.js';

export function registerVendorTools(server: McpServer): void {

  // ─── 1. list_vendors ───────────────────────────────────
  server.tool(
    'list_vendors',
    'List all vendors with their spend summary, pending amounts, and overdue invoices. Search by name, filter by category.',
    {
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
      search: z.string().optional().describe('Search by vendor name, contact person, or phone'),
      category: z.string().optional().describe('Filter by category (paper, ink, plates, chemicals, machinery, etc.)'),
      active_only: z.boolean().optional().default(true),
    },
    async ({ page, limit, search, category, active_only }) => {
      const { page: p, limit: l, offset } = parsePagination(page, limit);
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (active_only) {
        conditions.push('v.is_active = TRUE');
      }
      if (search) {
        conditions.push('(v.name LIKE ? OR v.contact_person LIKE ? OR v.phone LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (category) {
        conditions.push('v.category = ?');
        params.push(category);
      }

      const som = startOfMonth();
      const eom = endOfMonth();
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const vendors = await selectAll(
        `SELECT
           v.id, v.name, v.contact_person, v.phone, v.email, v.gst_number, v.city,
           v.category, v.vendor_code, v.credit_days, v.credit_limit,
           COALESCE(SUM(CASE WHEN vi.invoice_date BETWEEN ? AND ? THEN vi.total_amount ELSE 0 END), 0) as this_month_spend,
           COALESCE(SUM(vi.total_amount - COALESCE(vi.paid_amount, 0)), 0) as pending_amount,
           COUNT(vi.id) as total_invoices,
           COUNT(CASE WHEN COALESCE(vi.paid_amount, 0) < vi.total_amount AND vi.due_date < CURDATE() THEN 1 END) as overdue_invoices
         FROM vendors v
         LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id
         ${where}
         GROUP BY v.id
         ORDER BY v.name
         LIMIT ? OFFSET ?`,
        [som, eom, ...params, l, offset],
      );

      const total = await count(
        `SELECT COUNT(DISTINCT v.id) as count FROM vendors v ${where}`,
        params,
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ vendors, total, page: p, limit: l, pages: Math.ceil(total / l) }),
        }],
      };
    },
  );

  // ─── 2. get_vendor_details ─────────────────────────────
  server.tool(
    'get_vendor_details',
    'Get full details for a specific vendor including recent invoices, payments, and spend trend',
    {
      vendor_id: z.number().describe('Vendor ID'),
    },
    async ({ vendor_id }) => {
      const vendor = await selectOne(
        `SELECT v.*,
                COALESCE(SUM(vi.total_amount), 0) as total_spend,
                COALESCE(SUM(vi.total_amount - COALESCE(vi.paid_amount, 0)), 0) as pending_amount,
                COUNT(vi.id) as total_invoices
         FROM vendors v
         LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id
         WHERE v.id = ?
         GROUP BY v.id`,
        [vendor_id],
      );

      if (!vendor) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Vendor not found', vendor_id }) }] };
      }

      // Recent invoices
      const invoices = await selectAll(
        `SELECT id, invoice_number, invoice_date, due_date, amount, paid_amount, status, branch
         FROM vendor_invoices WHERE vendor_id = ?
         ORDER BY invoice_date DESC LIMIT 10`,
        [vendor_id],
      );

      // Recent payments
      const payments = await selectAll(
        `SELECT vp.id, vp.amount, vp.payment_date, vp.payment_mode, vp.reference_number,
                vi.invoice_number
         FROM vendor_payments vp
         JOIN vendor_invoices vi ON vp.vendor_invoice_id = vi.id
         WHERE vp.vendor_id = ?
         ORDER BY vp.payment_date DESC LIMIT 10`,
        [vendor_id],
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ vendor, recent_invoices: invoices, recent_payments: payments }),
        }],
      };
    },
  );

  // ─── 3. create_vendor_transaction ──────────────────────
  server.tool(
    'create_vendor_transaction',
    'Record a vendor invoice or payment. For invoices, creates a new invoice record. For payments, records payment against an existing invoice.',
    {
      vendor_id: z.number().describe('Vendor ID'),
      transaction_type: z.enum(['invoice', 'payment']).describe('Type of transaction'),
      amount: z.number().positive().describe('Transaction amount'),
      date: z.string().describe('Transaction date (YYYY-MM-DD)'),
      invoice_number: z.string().optional().describe('Invoice number (for invoices)'),
      invoice_id: z.number().optional().describe('Invoice ID to pay against (for payments)'),
      payment_mode: z.string().optional().default('cash').describe('Payment mode: cash, upi, cheque, bank_transfer'),
      reference_number: z.string().optional().describe('Check number, UPI ref, etc.'),
      branch: z.string().optional().default('common').describe('Branch: perambra, meppayur, common'),
      notes: z.string().optional(),
    },
    async ({ vendor_id, transaction_type, amount, date, invoice_number, invoice_id, payment_mode, reference_number, branch, notes }) => {
      // Verify vendor exists
      const vendor = await selectOne('SELECT id, name, credit_days FROM vendors WHERE id = ? AND is_active = TRUE', [vendor_id]);
      if (!vendor) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Vendor not found' }) }] };
      }

      if (transaction_type === 'invoice') {
        // Calculate due date
        const invoiceDate = new Date(date);
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + ((vendor as any).credit_days || 0));

        const id = await insert(
          `INSERT INTO vendor_invoices (vendor_id, invoice_number, invoice_date, due_date, amount, branch, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [vendor_id, invoice_number || null, date, dueDate.toISOString().split('T')[0], amount, branch, notes || null],
        );

        await auditLog(null, 'VENDOR_INVOICE_CREATE', `Created invoice ${invoice_number || id} for ${(vendor as any).name}: ${formatCurrency(amount)}`, { entity_type: 'vendor_invoice', entity_id: id });
        cacheInvalidate('vendor');

        return { content: [{ type: 'text' as const, text: formatToolResult({ success: true, invoice_id: id, vendor_name: (vendor as any).name }) }] };

      } else {
        // Payment — must specify invoice_id
        if (!invoice_id) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'invoice_id is required for payments' }) }] };
        }

        const result = await transaction(async (conn) => {
          const [invoiceRows] = await conn.query('SELECT * FROM vendor_invoices WHERE id = ?', [invoice_id]);
          const inv = (invoiceRows as any[])[0];
          if (!inv) throw new Error('Invoice not found');

          const balanceDue = inv.amount - inv.paid_amount;
          if (amount > balanceDue) throw new Error(`Payment exceeds balance due of ${formatCurrency(balanceDue)}`);

          const [payResult] = await conn.query(
            `INSERT INTO vendor_payments (vendor_invoice_id, vendor_id, amount, payment_date, payment_mode, reference_number, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [invoice_id, vendor_id, amount, date, payment_mode, reference_number || null, notes || null],
          );

          const newPaid = inv.paid_amount + amount;
          const newStatus = newPaid >= inv.amount ? 'paid' : (new Date(inv.due_date) < new Date() ? 'overdue' : 'partial');

          await conn.query('UPDATE vendor_invoices SET paid_amount = ?, status = ? WHERE id = ?', [newPaid, newStatus, invoice_id]);

          return { payment_id: (payResult as any).insertId, new_balance: inv.amount - newPaid, invoice_status: newStatus };
        });

        await auditLog(null, 'VENDOR_PAYMENT_CREATE', `Recorded payment of ${formatCurrency(amount)} against invoice #${invoice_id}`, { entity_type: 'vendor_payment', entity_id: result.payment_id });
        cacheInvalidate('vendor');

        return { content: [{ type: 'text' as const, text: formatToolResult({ success: true, ...result }) }] };
      }
    },
  );

  // ─── 4. get_vendor_ledger ──────────────────────────────
  server.tool(
    'get_vendor_ledger',
    'Get a date-range ledger for a vendor showing all invoices and payments with running balance',
    {
      vendor_id: z.number().describe('Vendor ID'),
      from_date: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to 6 months ago'),
      to_date: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
    },
    async ({ vendor_id, from_date, to_date }) => {
      const vendor = await selectOne('SELECT id, name FROM vendors WHERE id = ?', [vendor_id]);
      if (!vendor) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Vendor not found' }) }] };
      }

      const today = new Date().toISOString().split('T')[0];
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const from = from_date || sixMonthsAgo.toISOString().split('T')[0];
      const to = to_date || today;

      // Get invoices and payments as ledger entries
      const invoices = await selectAll(
        `SELECT 'invoice' as entry_type, invoice_date as date, invoice_number as reference,
                CONCAT('Invoice: ', COALESCE(notes, '')) as description,
                amount as debit, 0 as credit
         FROM vendor_invoices
         WHERE vendor_id = ? AND invoice_date BETWEEN ? AND ?`,
        [vendor_id, from, to],
      );

      const payments = await selectAll(
        `SELECT 'payment' as entry_type, vp.payment_date as date,
                COALESCE(vp.reference_number, CONCAT('Pay#', vp.id)) as reference,
                CONCAT('Payment (', vp.payment_mode, '): ', COALESCE(vi.invoice_number, '')) as description,
                0 as debit, vp.amount as credit
         FROM vendor_payments vp
         JOIN vendor_invoices vi ON vp.vendor_invoice_id = vi.id
         WHERE vp.vendor_id = ? AND vp.payment_date BETWEEN ? AND ?`,
        [vendor_id, from, to],
      );

      // Merge and sort by date
      const ledger = [...(invoices as any[]), ...(payments as any[])]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate running balance
      let balance = 0;
      let totalDebit = 0;
      let totalCredit = 0;
      for (const entry of ledger) {
        totalDebit += Number(entry.debit);
        totalCredit += Number(entry.credit);
        balance += Number(entry.debit) - Number(entry.credit);
        entry.running_balance = balance;
      }

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            vendor: vendor,
            period: { from, to },
            ledger,
            summary: { total_debit: totalDebit, total_credit: totalCredit, closing_balance: balance },
          }),
        }],
      };
    },
  );

  // ─── 5. update_vendor ──────────────────────────────────
  server.tool(
    'update_vendor',
    'Update vendor contact information, credit terms, or category',
    {
      vendor_id: z.number().describe('Vendor ID'),
      name: z.string().optional(),
      contact_person: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      gst_number: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      category: z.string().optional(),
      credit_days: z.number().optional(),
      credit_limit: z.number().optional(),
      notes: z.string().optional(),
    },
    async (args) => {
      const { vendor_id, ...updates } = args;

      const vendor = await selectOne('SELECT id, name FROM vendors WHERE id = ? AND is_active = TRUE', [vendor_id]);
      if (!vendor) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Vendor not found' }) }] };
      }

      // Build dynamic SET clause
      const sets: string[] = [];
      const params: unknown[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          sets.push(`${key} = ?`);
          params.push(value);
        }
      }

      if (sets.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No updates provided' }) }] };
      }

      params.push(vendor_id);
      const affected = await execute(`UPDATE vendors SET ${sets.join(', ')} WHERE id = ?`, params);

      await auditLog(null, 'VENDOR_UPDATE', `Updated vendor ${(vendor as any).name}: ${sets.map(s => s.split(' =')[0]).join(', ')}`, { entity_type: 'vendor', entity_id: vendor_id });
      cacheInvalidate('vendor');

      const updated = await selectOne('SELECT * FROM vendors WHERE id = ?', [vendor_id]);

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ success: true, affected_rows: affected, vendor: updated }) }],
      };
    },
  );

  // ─── 6. reconcile_vendor_account ───────────────────────
  server.tool(
    'reconcile_vendor_account',
    'Compare system balance with a vendor statement balance to find discrepancies',
    {
      vendor_id: z.number().describe('Vendor ID'),
      statement_balance: z.number().describe('Balance as per vendor statement (positive = we owe them)'),
      as_of_date: z.string().optional().describe('Statement date (YYYY-MM-DD), defaults to today'),
    },
    async ({ vendor_id, statement_balance, as_of_date }) => {
      const today = as_of_date || new Date().toISOString().split('T')[0];

      const vendor = await selectOne('SELECT id, name FROM vendors WHERE id = ?', [vendor_id]);
      if (!vendor) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Vendor not found' }) }] };
      }

      // System balance: total invoiced - total paid
      const systemData = await selectOne<{ total_invoiced: number; total_paid: number }>(
        `SELECT
           COALESCE(SUM(vi.amount), 0) as total_invoiced,
           COALESCE(SUM(vi.paid_amount), 0) as total_paid
         FROM vendor_invoices vi
         WHERE vi.vendor_id = ? AND vi.invoice_date <= ?`,
        [vendor_id, today],
      );

      const totalInvoiced = Number((systemData as any)?.total_invoiced || 0);
      const totalPaid = Number((systemData as any)?.total_paid || 0);
      const systemBalance = totalInvoiced - totalPaid;
      const discrepancy = Math.abs(systemBalance - statement_balance);

      // Find unmatched / potentially problematic invoices
      const unpaidInvoices = await selectAll(
        `SELECT id, invoice_number, invoice_date, due_date, amount, paid_amount, status
         FROM vendor_invoices
         WHERE vendor_id = ? AND paid_amount < amount AND invoice_date <= ?
         ORDER BY invoice_date`,
        [vendor_id, today],
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            vendor: vendor,
            as_of_date: today,
            system_balance: systemBalance,
            statement_balance,
            discrepancy,
            matches: discrepancy < 0.01,
            total_invoiced: totalInvoiced,
            total_paid: totalPaid,
            unpaid_invoices: unpaidInvoices,
            unpaid_count: (unpaidInvoices as any[]).length,
          }),
        }],
      };
    },
  );
}

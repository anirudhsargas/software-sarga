/**
 * MCP Tools — Analytics & Reports (4 tools)
 *
 * Tools: get_sales_analytics, get_inventory_valuation,
 *        generate_profit_loss_report, get_business_dashboard
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { selectAll, selectOne } from '../services/db.js';
import { formatToolResult, formatCurrency, daysAgo } from '../utils/formatters.js';

export function registerAnalyticsTools(server: McpServer): void {

  // ─── 1. get_sales_analytics ────────────────────────────
  server.tool(
    'get_sales_analytics',
    'Get revenue breakdown by branch, product category, and top customers',
    {
      from_date: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to 30 days ago'),
      to_date: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
    },
    async ({ from_date, to_date }) => {
      const start = from_date || daysAgo(30);
      const end = to_date || new Date().toISOString().split('T')[0];

      // Total Revenue
      const totalRev = await selectOne<{ revenue: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as revenue
         FROM sarga_customer_payments WHERE payment_date BETWEEN ? AND ?`,
        [start, end],
      );

      // Revenue by Branch
      const byBranch = await selectAll(
        `SELECT b.name as branch, COALESCE(SUM(cp.total_amount), 0) as revenue, COUNT(cp.id) as order_count
         FROM sarga_customer_payments cp
         LEFT JOIN sarga_branches b ON cp.branch_id = b.id
         WHERE cp.payment_date BETWEEN ? AND ?
         GROUP BY b.id`,
        [start, end],
      );

      // Revenue by Category (from jobs)
      const byCategory = await selectAll(
        `SELECT category, COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as job_count
         FROM sarga_jobs
         WHERE DATE(created_at) BETWEEN ? AND ? AND category IS NOT NULL
         GROUP BY category ORDER BY revenue DESC LIMIT 10`,
        [start, end],
      );

      // Top Customers
      const topCustomers = await selectAll(
        `SELECT customer_name, COALESCE(SUM(total_amount), 0) as total_spent, COUNT(*) as orders
         FROM sarga_customer_payments
         WHERE payment_date BETWEEN ? AND ? AND customer_name IS NOT NULL
         GROUP BY customer_name ORDER BY total_spent DESC LIMIT 10`,
        [start, end],
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            period: { from: start, to: end },
            total_revenue: formatCurrency(Number((totalRev as any)?.revenue || 0)),
            by_branch: byBranch,
            top_categories: byCategory,
            top_customers: topCustomers,
          }),
        }],
      };
    },
  );

  // ─── 2. get_inventory_valuation ────────────────────────
  server.tool(
    'get_inventory_valuation',
    'Get total stock value breakdown by category and branch',
    {},
    async () => {
      // General Inventory Value
      const retailVal = await selectOne<{ val: number }>(
        `SELECT COALESCE(SUM(quantity * cost_price), 0) as val FROM sarga_inventory WHERE item_type = 'Retail'`,
      );
      const consVal = await selectOne<{ val: number }>(
        `SELECT COALESCE(SUM(quantity * cost_price), 0) as val FROM sarga_inventory WHERE item_type = 'Consumable'`,
      );

      // Dedicated Consumables Value
      const dedicatedConsVal = await selectOne<{ val: number }>(
        `SELECT COALESCE(SUM(quantity_in_stock * unit_cost), 0) as val FROM consumables_inventory`,
      );

      // Paper Inventory Value
      const paperVal = await selectOne<{ val: number }>(
        `SELECT COALESCE(SUM(ream_count * purchase_price_per_ream), 0) as val FROM sarga_paper_inventory`,
      );

      const totalVal = Number((retailVal as any)?.val || 0) +
                       Number((consVal as any)?.val || 0) +
                       Number((dedicatedConsVal as any)?.val || 0) +
                       Number((paperVal as any)?.val || 0);

      // Value by Category (General)
      const byCategory = await selectAll(
        `SELECT category, COALESCE(SUM(quantity * cost_price), 0) as value
         FROM sarga_inventory GROUP BY category ORDER BY value DESC`,
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            total_valuation: formatCurrency(totalVal),
            breakdown: {
              retail_products: formatCurrency(Number((retailVal as any)?.val || 0)),
              consumables_general: formatCurrency(Number((consVal as any)?.val || 0)),
              consumables_dedicated: formatCurrency(Number((dedicatedConsVal as any)?.val || 0)),
              paper_stock: formatCurrency(Number((paperVal as any)?.val || 0)),
            },
            by_category: byCategory,
          }),
        }],
      };
    },
  );

  // ─── 3. generate_profit_loss_report ────────────────────
  server.tool(
    'generate_profit_loss_report',
    'Generate a simple P&L statement (Revenue - COGS - Expenses = Net Profit)',
    {
      from_date: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to 1st of current month'),
      to_date: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
    },
    async ({ from_date, to_date }) => {
      const today = new Date();
      const start = from_date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      const end = to_date || today.toISOString().split('T')[0];

      // Revenue (Invoiced to customers)
      const revenueData = await selectOne<{ total: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as total
         FROM sarga_customer_payments WHERE payment_date BETWEEN ? AND ?`,
        [start, end],
      );
      const revenue = Number((revenueData as any)?.total || 0);

      // COGS (Cost of goods sold based on Jobs)
      const cogsData = await selectOne<{ total_cost: number }>(
        `SELECT COALESCE(SUM(total_cost), 0) as total_cost
         FROM sarga_jobs WHERE DATE(created_at) BETWEEN ? AND ?`,
        [start, end],
      );
      // Fallback: sum of components if total_cost is 0
      const cogsFallbackData = await selectOne<{ paper: number; machine: number; labour: number }>(
        `SELECT COALESCE(SUM(paper_cost), 0) as paper,
                COALESCE(SUM(machine_cost), 0) as machine,
                COALESCE(SUM(labour_cost), 0) as labour
         FROM sarga_jobs WHERE DATE(created_at) BETWEEN ? AND ?`,
        [start, end],
      );

      const cogs = Number((cogsData as any)?.total_cost || 0) > 0
        ? Number((cogsData as any)?.total_cost || 0)
        : Number((cogsFallbackData as any)?.paper || 0) + Number((cogsFallbackData as any)?.machine || 0) + Number((cogsFallbackData as any)?.labour || 0);

      const grossProfit = revenue - cogs;

      // Operating Expenses
      const expensesData = await selectAll<{ type: string; total: number }>(
        `SELECT type, COALESCE(SUM(amount), 0) as total
         FROM sarga_payments WHERE payment_date BETWEEN ? AND ?
         GROUP BY type`,
        [start, end],
      );
      const expensesTotal = expensesData.reduce((sum, row) => sum + Number(row.total), 0);

      // Net Profit
      const netProfit = grossProfit - expensesTotal;

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            period: { from: start, to: end },
            revenue: formatCurrency(revenue),
            cost_of_goods_sold: formatCurrency(cogs),
            gross_profit: formatCurrency(grossProfit),
            gross_margin_percent: revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) + '%' : '0%',
            operating_expenses: {
              breakdown: expensesData,
              total: formatCurrency(expensesTotal),
            },
            net_profit: formatCurrency(netProfit),
            net_margin_percent: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) + '%' : '0%',
          }),
        }],
      };
    },
  );

  // ─── 4. get_business_dashboard ─────────────────────────
  server.tool(
    'get_business_dashboard',
    'Get high-level KPIs for a quick business overview (Today & This Month)',
    {},
    async () => {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = `${today.split('-')[0]}-${today.split('-')[1]}-01`;

      // Today's Sales
      const todaySales = await selectOne<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
         FROM sarga_customer_payments WHERE payment_date = ?`, [today],
      );

      // Month's Sales
      const monthSales = await selectOne<{ total: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as total
         FROM sarga_customer_payments WHERE payment_date >= ?`, [monthStart],
      );

      // Active Jobs
      const activeJobs = await selectOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM sarga_jobs
         WHERE status NOT IN ('Completed', 'Delivered', 'Cancelled')`,
      );

      // Overdue Jobs
      const overdueJobs = await selectOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM sarga_jobs
         WHERE delivery_date < CURDATE() AND status NOT IN ('Completed', 'Delivered', 'Cancelled')`,
      );

      // Outstanding Receivables
      const receivables = await selectOne<{ total: number }>(
        `SELECT COALESCE(SUM(balance_amount), 0) as total FROM sarga_customer_payments WHERE balance_amount > 0`,
      );

      // Outstanding Payables
      const payables = await selectOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount - paid_amount), 0) as total FROM vendor_invoices WHERE status != 'paid'`,
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            date: today,
            today_performance: {
              sales_revenue: formatCurrency(Number((todaySales as any)?.total || 0)),
              orders_taken: (todaySales as any)?.count || 0,
            },
            mtd_performance: {
              sales_revenue: formatCurrency(Number((monthSales as any)?.total || 0)),
            },
            operations: {
              active_jobs: (activeJobs as any)?.count || 0,
              overdue_jobs: (overdueJobs as any)?.count || 0,
            },
            financials: {
              total_receivables: formatCurrency(Number((receivables as any)?.total || 0)),
              total_payables: formatCurrency(Number((payables as any)?.total || 0)),
            },
          }),
        }],
      };
    },
  );
}

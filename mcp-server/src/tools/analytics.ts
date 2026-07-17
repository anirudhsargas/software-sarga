/**
 * MCP Tools — Analytics & Reports (5 tools)
 *
 * Tools: get_sales_analytics, get_inventory_valuation,
 *        generate_profit_loss_report, get_business_dashboard,
 *        get_product_sales_velocity
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

  // ─── 5. get_product_sales_velocity ───────────────────────
  server.tool(
    'get_product_sales_velocity',
    'Analyze product sales frequency — top sellers and dormant products — from order line items',
    {
      product_id: z.number().optional().describe('Get sales detail for a specific product'),
      category: z.string().optional().describe('Filter by product category (from order_lines)'),
      branch_id: z.number().optional().describe('Filter payments by branch'),
      dormant_days_threshold: z.number().optional().default(60).describe('Flag products with no sale in this many days'),
      from_date: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to 90 days ago'),
      to_date: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
      limit: z.number().optional().default(20).describe('Max results (max 50)'),
    },
    async ({ product_id, category, branch_id, dormant_days_threshold, from_date, to_date, limit }) => {
      const start = from_date || daysAgo(90);
      const end = to_date || new Date().toISOString().split('T')[0];
      const maxLimit = Math.min(limit || 20, 50);

      const conditions: string[] = [];
      const params: unknown[] = [];

      conditions.push('cp.order_lines IS NOT NULL');
      conditions.push("cp.order_lines != '[]'");
      conditions.push('cp.payment_date BETWEEN ? AND ?');
      params.push(start, end);

      if (branch_id) {
        conditions.push('cp.branch_id = ?');
        params.push(branch_id);
      }

      const payments = await selectAll(
        `SELECT cp.id, cp.payment_date, cp.order_lines
         FROM sarga_customer_payments cp
         WHERE ${conditions.join(' AND ')}
         ORDER BY cp.payment_date DESC`,
        params,
      );

      const productMap = new Map<string, {
        product_id: number | null;
        product_name: string;
        sales_count: number;
        revenue: number;
        last_sold_date: string;
        category: string | null;
      }>();

      for (const payment of payments as any[]) {
        let lines: Array<Record<string, unknown>>;
        try {
          lines = typeof payment.order_lines === 'string'
            ? JSON.parse(payment.order_lines)
            : (payment.order_lines || []);
        } catch {
          continue;
        }
        if (!Array.isArray(lines)) continue;

        for (const line of lines) {
          if (!line) continue;
          if (product_id && line.product_id !== product_id) continue;
          if (category && line.category && String(line.category).toLowerCase() !== category.toLowerCase()) continue;

          const pid = line.product_id != null ? Number(line.product_id) : null;
          const pname = String(line.product_name || line.job_name || 'Unknown Product');
          const key = pid !== null ? `id:${pid}` : `name:${pname}`;
          const qty = Math.max(Number(line.quantity) || 0, 1);
          const amt = Number(line.total_amount) || 0;

          const existing = productMap.get(key);
          if (existing) {
            existing.sales_count += qty;
            existing.revenue += amt;
            if (payment.payment_date > existing.last_sold_date) {
              existing.last_sold_date = payment.payment_date;
            }
          } else {
            productMap.set(key, {
              product_id: pid,
              product_name: pname,
              sales_count: qty,
              revenue: amt,
              last_sold_date: payment.payment_date,
              category: line.category ? String(line.category) : null,
            });
          }
        }
      }

      if (productMap.size === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: formatToolResult({
              top_sellers: [],
              dormant_products: [],
              period: { from: start, to: end },
            }),
          }],
        };
      }

      // Enrich with product catalog + inventory info
      const productIds = new Set<number>();
      for (const agg of productMap.values()) {
        if (agg.product_id !== null) productIds.add(agg.product_id);
      }

      const productLookup = new Map<number, Record<string, unknown>>();
      if (productIds.size > 0) {
        const idList = [...productIds];
        const products = await selectAll(
          `SELECT p.id, p.name, p.product_code, p.subcategory_id, p.is_physical_product,
                  p.inventory_item_id, sc.name as category_name, ss.name as subcategory_name,
                  i.name as inventory_name, i.sku, i.quantity as stock_quantity,
                  i.reorder_level, i.sell_price
           FROM sarga_products p
           LEFT JOIN sarga_product_subcategories ss ON p.subcategory_id = ss.id
           LEFT JOIN sarga_product_categories sc ON ss.category_id = sc.id
           LEFT JOIN sarga_inventory i ON p.inventory_item_id = i.id
           WHERE p.id IN (${idList.map(() => '?').join(',')})`,
          idList,
        );
        for (const prod of products as any[]) {
          productLookup.set(prod.id, prod);
        }
      }

      const today = new Date().toISOString().split('T')[0];
      const allProducts: Array<Record<string, unknown>> = [];

      for (const agg of productMap.values()) {
        const cat = agg.product_id !== null ? productLookup.get(agg.product_id) : null;
        const daysSince = Math.floor(
          (new Date(today).getTime() - new Date(agg.last_sold_date).getTime()) / (1000 * 60 * 60 * 24),
        );

        allProducts.push({
          product_id: agg.product_id,
          product_name: agg.product_name,
          category: cat?.category_name || agg.category,
          subcategory: cat?.subcategory_name || null,
          sales_count: agg.sales_count,
          revenue: Math.round(agg.revenue * 100) / 100,
          last_sold_date: agg.last_sold_date,
          days_since_last_sale: daysSince,
          is_physical_product: cat?.is_physical_product === 1 || cat?.is_physical_product === '1',
          sku: cat?.sku || null,
          current_stock: cat?.stock_quantity != null ? Number(cat.stock_quantity) : null,
          reorder_level: cat?.reorder_level != null ? Number(cat.reorder_level) : null,
        });
      }

      const dormantThreshold = dormant_days_threshold ?? 60;
      const topSellers = [...allProducts]
        .sort((a, b) => (b.sales_count as number) - (a.sales_count as number))
        .slice(0, maxLimit);

      const dormantProducts = [...allProducts]
        .filter(p => (p.days_since_last_sale as number) >= dormantThreshold)
        .sort((a, b) => (b.days_since_last_sale as number) - (a.days_since_last_sale as number))
        .slice(0, maxLimit);

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            top_sellers: topSellers,
            dormant_products: dormantProducts,
            period: { from: start, to: end },
          }),
        }],
      };
    },
  );
}

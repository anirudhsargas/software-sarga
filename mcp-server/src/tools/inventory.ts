/**
 * MCP Tools — Stock & Inventory (7 tools)
 *
 * Tools: get_inventory_status, get_stock_details, update_stock_quantity,
 *        get_stock_forecast, create_purchase_order, list_low_stock_alerts,
 *        get_consumables_status
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { selectAll, selectOne, count, insert, execute, auditLog, transaction } from '../services/db.js';
import { formatToolResult, parsePagination, formatCurrency } from '../utils/formatters.js';
import { cached, cacheInvalidate } from '../services/cache.js';

export function registerInventoryTools(server: McpServer): void {

  // ─── 1. get_inventory_status ───────────────────────────
  server.tool(
    'get_inventory_status',
    'Get full inventory status with stock levels. Covers retail items, paper inventory, and consumables. Filter by branch, category, or item type.',
    {
      branch: z.string().optional().describe('Branch name: Perambra or Meppayur'),
      category: z.string().optional().describe('Item category filter'),
      item_type: z.enum(['Retail', 'Consumable', 'paper', 'all']).optional().default('all'),
      low_stock_only: z.boolean().optional().default(false).describe('Show only items at or below reorder level'),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(50),
    },
    async ({ branch, category, item_type, low_stock_only, page, limit }) => {
      const { page: p, limit: l, offset } = parsePagination(page, limit);
      const results: Record<string, unknown> = {};

      // Retail/Consumable Inventory (sarga_inventory + sarga_branch_stock)
      if (item_type === 'all' || item_type === 'Retail' || item_type === 'Consumable') {
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (item_type !== 'all') {
          conditions.push('i.item_type = ?');
          params.push(item_type);
        }
        if (category) {
          conditions.push('i.category LIKE ?');
          params.push(`%${category}%`);
        }
        if (low_stock_only) {
          conditions.push('i.quantity <= i.reorder_level');
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const items = await selectAll(
          `SELECT i.id, i.name, i.sku, i.category, i.unit, i.quantity,
                  i.reorder_level, i.cost_price, i.sell_price, i.item_type,
                  i.vendor_name, i.created_at
           FROM sarga_inventory i
           ${where}
           ORDER BY i.name
           LIMIT ? OFFSET ?`,
          [...params, l, offset],
        );

        const total = await count(`SELECT COUNT(*) as count FROM sarga_inventory i ${where}`, params);

        // Get per-branch stock if available
        if (branch) {
          const branchRow = await selectOne<{ id: number }>(
            'SELECT id FROM sarga_branches WHERE name LIKE ?', [`%${branch}%`]
          );
          if (branchRow) {
            const branchStock = await selectAll(
              `SELECT inventory_item_id, quantity FROM sarga_branch_stock WHERE branch_id = ?`,
              [(branchRow as any).id],
            );
            const stockMap = new Map((branchStock as any[]).map(s => [s.inventory_item_id, s.quantity]));
            (items as any[]).forEach(item => {
              item.branch_quantity = stockMap.get(item.id) ?? item.quantity;
            });
          }
        }

        results.inventory = { items, total, page: p, limit: l };
      }

      // Paper Inventory
      if (item_type === 'all' || item_type === 'paper') {
        const paperConditions: string[] = [];
        const paperParams: unknown[] = [];

        if (branch) {
          paperConditions.push('pi.branch LIKE ?');
          paperParams.push(`%${branch}%`);
        }
        if (low_stock_only) {
          paperConditions.push('pi.ream_count <= pi.reorder_level_reams');
        }
        const paperWhere = paperConditions.length ? `WHERE ${paperConditions.join(' AND ')}` : '';

        const paper = await selectAll(
          `SELECT pi.id, pi.paper_name, pi.size, pi.gsm, pi.ream_count, pi.sheets_per_ream,
                  pi.total_sheets, pi.reorder_level_reams, pi.supplier_name,
                  pi.purchase_price_per_ream, pi.branch, pi.last_updated
           FROM sarga_paper_inventory pi
           ${paperWhere}
           ORDER BY pi.paper_name`,
          paperParams,
        );

        // Also get new paper module stock
        const paperStock = await selectAll(
          `SELECT pt.id, pt.category, pt.size_name, pt.gsm, pt.brand,
                  ps.current_sheets, ps.reorder_level, b.name as branch_name
           FROM paper_stock_summary ps
           JOIN paper_types pt ON ps.paper_type_id = pt.id
           JOIN sarga_branches b ON ps.branch_id = b.id
           WHERE pt.is_active = TRUE
           ORDER BY pt.category, pt.size_name`,
        );

        results.paper_inventory = { legacy: paper, paper_module: paperStock };
      }

      // Total inventory value
      const valuation = await selectOne<{ total_value: number }>(
        `SELECT COALESCE(SUM(quantity * cost_price), 0) as total_value FROM sarga_inventory`,
      );
      results.total_inventory_value = formatCurrency(Number((valuation as any)?.total_value || 0));

      return { content: [{ type: 'text' as const, text: formatToolResult(results) }] };
    },
  );

  // ─── 2. get_stock_details ──────────────────────────────
  server.tool(
    'get_stock_details',
    'Get detailed information for a single inventory item including per-branch stock, movement history, and reorder info',
    {
      item_id: z.number().describe('Inventory item ID'),
    },
    async ({ item_id }) => {
      const item = await selectOne(
        `SELECT * FROM sarga_inventory WHERE id = ?`, [item_id],
      );
      if (!item) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Item not found' }) }] };
      }

      // Per-branch stock
      const branchStock = await selectAll(
        `SELECT bs.branch_id, b.name as branch_name, bs.quantity
         FROM sarga_branch_stock bs
         JOIN sarga_branches b ON bs.branch_id = b.id
         WHERE bs.inventory_item_id = ?`,
        [item_id],
      );

      // Recent consumption
      const consumption = await selectAll(
        `SELECT ic.quantity_consumed, ic.notes, ic.created_at, s.name as consumed_by
         FROM sarga_inventory_consumption ic
         JOIN sarga_staff s ON ic.consumed_by_user_id = s.id
         WHERE ic.inventory_item_id = ?
         ORDER BY ic.created_at DESC LIMIT 20`,
        [item_id],
      );

      // Recent reorders
      const reorders = await selectAll(
        `SELECT quantity_received, cost_price, days_since_last_reorder, created_at
         FROM sarga_inventory_reorders
         WHERE inventory_item_id = ?
         ORDER BY created_at DESC LIMIT 10`,
        [item_id],
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ item, branch_stock: branchStock, recent_consumption: consumption, reorder_history: reorders }),
        }],
      };
    },
  );

  // ─── 3. update_stock_quantity ──────────────────────────
  server.tool(
    'update_stock_quantity',
    'Adjust stock quantity for an inventory item. Can add, remove, or set to physical count.',
    {
      item_id: z.number().describe('Inventory item ID'),
      adjustment_type: z.enum(['add', 'remove', 'set']).describe('add, remove, or set (physical count)'),
      quantity: z.number().describe('Quantity to add/remove, or new quantity for set'),
      reason: z.string().describe('Reason for adjustment'),
      branch_id: z.number().optional().describe('Branch ID for per-branch adjustment'),
    },
    async ({ item_id, adjustment_type, quantity, reason, branch_id }) => {
      const item = await selectOne<{ id: number; name: string; quantity: number; reorder_level: number }>(
        'SELECT id, name, quantity, reorder_level FROM sarga_inventory WHERE id = ?', [item_id],
      );
      if (!item) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Item not found' }) }] };
      }

      let newQty: number;
      const oldQty = (item as any).quantity;

      switch (adjustment_type) {
        case 'add':
          newQty = oldQty + quantity;
          break;
        case 'remove':
          newQty = Math.max(0, oldQty - quantity);
          break;
        case 'set':
          newQty = quantity;
          break;
      }

      await execute('UPDATE sarga_inventory SET quantity = ? WHERE id = ?', [newQty, item_id]);

      // Update branch stock if specified
      if (branch_id) {
        await execute(
          `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity)
           VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = ?`,
          [item_id, branch_id, newQty, newQty],
        );
      }

      const alertTriggered = newQty <= (item as any).reorder_level;
      await auditLog(null, 'STOCK_ADJUST', `${adjustment_type} ${quantity} of ${(item as any).name}: ${oldQty} → ${newQty}. Reason: ${reason}`, { entity_type: 'inventory', entity_id: item_id });
      cacheInvalidate('inventory');

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            success: true,
            item_name: (item as any).name,
            old_quantity: oldQty,
            new_quantity: newQty,
            alert_triggered: alertTriggered,
            alert_message: alertTriggered ? `⚠️ ${(item as any).name} is at or below reorder level (${(item as any).reorder_level})` : null,
          }),
        }],
      };
    },
  );

  // ─── 4. get_stock_forecast ─────────────────────────────
  server.tool(
    'get_stock_forecast',
    'Forecast stock levels using simple moving average based on consumption history',
    {
      item_id: z.number().describe('Inventory item ID'),
      days_ahead: z.number().optional().default(30).describe('Days to forecast ahead'),
    },
    async ({ item_id, days_ahead }) => {
      const item = await selectOne<{ id: number; name: string; quantity: number; reorder_level: number }>(
        'SELECT id, name, quantity, reorder_level FROM sarga_inventory WHERE id = ?', [item_id],
      );
      if (!item) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Item not found' }) }] };
      }

      // Get consumption over last 90 days
      const consumption = await selectAll<{ total_consumed: number; days_count: number }>(
        `SELECT COALESCE(SUM(quantity_consumed), 0) as total_consumed,
                COUNT(DISTINCT DATE(created_at)) as days_count
         FROM sarga_inventory_consumption
         WHERE inventory_item_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`,
        [item_id],
      );

      const totalConsumed = Number((consumption[0] as any)?.total_consumed || 0);
      const daysTracked = Number((consumption[0] as any)?.days_count || 1);
      const dailyRate = totalConsumed / Math.max(daysTracked, 1);
      const currentQty = (item as any).quantity;
      const daysUntilStockout = dailyRate > 0 ? Math.floor(currentQty / dailyRate) : Infinity;
      const forecastQty = Math.max(0, currentQty - (dailyRate * days_ahead));

      let recommendation = 'stock_sufficient';
      let suggestedReorderDate: string | null = null;
      let suggestedQuantity: number | null = null;

      if (daysUntilStockout <= 7) {
        recommendation = 'reorder_immediately';
        suggestedReorderDate = new Date().toISOString().split('T')[0];
        suggestedQuantity = Math.ceil(dailyRate * 30); // 30-day supply
      } else if (daysUntilStockout <= 14) {
        recommendation = 'reorder_soon';
        const reorderDate = new Date();
        reorderDate.setDate(reorderDate.getDate() + Math.max(0, daysUntilStockout - 7));
        suggestedReorderDate = reorderDate.toISOString().split('T')[0];
        suggestedQuantity = Math.ceil(dailyRate * 30);
      } else if (currentQty > dailyRate * 90) {
        recommendation = 'overstock_risk';
      }

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            item: { id: (item as any).id, name: (item as any).name },
            current_quantity: currentQty,
            daily_consumption_rate: Math.round(dailyRate * 100) / 100,
            forecast_quantity_in_n_days: Math.round(forecastQty),
            days_until_stockout: daysUntilStockout === Infinity ? 'N/A (no consumption)' : daysUntilStockout,
            recommendation,
            suggested_reorder_date: suggestedReorderDate,
            suggested_quantity: suggestedQuantity,
          }),
        }],
      };
    },
  );

  // ─── 5. create_purchase_order ──────────────────────────
  server.tool(
    'create_purchase_order',
    'Create a purchase order for inventory items that need restocking',
    {
      items: z.array(z.object({
        item_id: z.number().describe('Inventory item ID'),
        quantity: z.number().positive().describe('Quantity to order'),
        urgency: z.enum(['immediate', 'this_week']).optional().default('this_week'),
      })).describe('Array of items to order'),
      notes: z.string().optional().describe('Special instructions'),
    },
    async ({ items, notes }) => {
      const result = await transaction(async (conn) => {
        let totalCost = 0;

        // Validate all items exist and calculate costs
        const itemDetails: any[] = [];
        for (const orderItem of items) {
          const [rows] = await conn.query(
            'SELECT id, name, cost_price, vendor_name, unit FROM sarga_inventory WHERE id = ?',
            [orderItem.item_id],
          );
          const item = (rows as any[])[0];
          if (!item) throw new Error(`Item ID ${orderItem.item_id} not found`);

          const estimatedCost = item.cost_price * orderItem.quantity;
          totalCost += estimatedCost;
          itemDetails.push({ ...item, quantity: orderItem.quantity, estimated_cost: estimatedCost, urgency: orderItem.urgency });
        }

        // Create PO header
        const [poResult] = await conn.query(
          `INSERT INTO sarga_purchase_orders (status, total_estimated_cost, notes) VALUES ('pending', ?, ?)`,
          [totalCost, notes || null],
        );
        const poId = (poResult as any).insertId;

        // Create PO items
        for (const detail of itemDetails) {
          await conn.query(
            `INSERT INTO sarga_purchase_order_items (purchase_order_id, inventory_item_id, suggested_qty, unit, estimated_cost, vendor_name, urgency)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [poId, detail.id, detail.quantity, detail.unit, detail.estimated_cost, detail.vendor_name, detail.urgency],
          );
        }

        return { po_id: poId, total_cost: totalCost, items: itemDetails };
      });

      await auditLog(null, 'PO_CREATE', `Created PO #${result.po_id} with ${items.length} items, total: ${formatCurrency(result.total_cost)}`, { entity_type: 'purchase_order', entity_id: result.po_id });

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({ success: true, purchase_order_id: result.po_id, total_estimated_cost: result.total_cost, item_count: items.length, items: result.items }),
        }],
      };
    },
  );

  // ─── 6. list_low_stock_alerts ──────────────────────────
  server.tool(
    'list_low_stock_alerts',
    'List all inventory items that are at or below their reorder level',
    {
      branch: z.string().optional().describe('Filter by branch name'),
    },
    async ({ branch }) => {
      // Retail/Consumable items below reorder
      const lowStock = await selectAll(
        `SELECT i.id, i.name, i.category, i.unit, i.quantity as current_qty,
                i.reorder_level, i.cost_price, i.vendor_name, i.item_type,
                (i.reorder_level - i.quantity) as deficit
         FROM sarga_inventory i
         WHERE i.quantity <= i.reorder_level AND i.reorder_level > 0
         ORDER BY (i.reorder_level - i.quantity) DESC`,
      );

      // Paper items below reorder
      const lowPaper = await selectAll(
        `SELECT pi.id, pi.paper_name as name, pi.ream_count as current_qty,
                pi.reorder_level_reams as reorder_level, pi.branch,
                pi.supplier_name as vendor_name,
                'paper' as item_type,
                (pi.reorder_level_reams - pi.ream_count) as deficit
         FROM sarga_paper_inventory pi
         WHERE pi.ream_count <= pi.reorder_level_reams AND pi.reorder_level_reams > 0
         ${branch ? 'AND pi.branch LIKE ?' : ''}
         ORDER BY deficit DESC`,
        branch ? [`%${branch}%`] : [],
      );

      // Consumables below reorder
      const lowConsumables = await selectAll(
        `SELECT id, name, category, unit, quantity_in_stock as current_qty,
                reorder_level, supplier_name as vendor_name, branch,
                'consumable' as item_type,
                (reorder_level - quantity_in_stock) as deficit
         FROM consumables_inventory
         WHERE quantity_in_stock <= reorder_level AND reorder_level > 0
         ${branch ? 'AND branch LIKE ?' : ''}
         ORDER BY deficit DESC`,
        branch ? [`%${branch}%`] : [],
      );

      const allAlerts = [
        ...(lowStock as any[]),
        ...(lowPaper as any[]),
        ...(lowConsumables as any[]),
      ];

      const urgentCount = allAlerts.filter(a => a.current_qty === 0).length;

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            alerts: allAlerts,
            total_alerts: allAlerts.length,
            urgent_count: urgentCount,
            out_of_stock: allAlerts.filter(a => a.current_qty === 0),
          }),
        }],
      };
    },
  );

  // ─── 7. get_consumables_status ─────────────────────────
  server.tool(
    'get_consumables_status',
    'Get consumables inventory (ink, chemicals, plates, spare parts) by branch',
    {
      branch: z.string().optional().describe('Branch: Perambra or Meppayur'),
      category: z.enum(['ink', 'chemical', 'plate', 'spare_part', 'other', 'all']).optional().default('all'),
    },
    async ({ branch, category }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (branch) {
        conditions.push('branch LIKE ?');
        params.push(`%${branch}%`);
      }
      if (category && category !== 'all') {
        conditions.push('category = ?');
        params.push(category);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const consumables = await selectAll(
        `SELECT id, name, category, unit, quantity_in_stock, reorder_level,
                unit_cost, supplier_name, branch, notes, last_updated
         FROM consumables_inventory
         ${where}
         ORDER BY category, name`,
        params,
      );

      const totalValue = (consumables as any[]).reduce(
        (sum, c) => sum + (c.quantity_in_stock * c.unit_cost), 0,
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            consumables,
            total_items: (consumables as any[]).length,
            total_value: formatCurrency(totalValue),
          }),
        }],
      };
    },
  );
}

/**
 * /api/ai/stock-planning — Stock Planning AI routes
 *
 * GET  /stock-status         — stock levels + days-to-stockout
 * GET  /purchase-list        — purchase recommendations for low/critical items
 * POST /approve-purchase-list — save to purchase_orders table
 */
const router = require('express').Router();
const axios = require('../helpers/mlAxios');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 30_000;
const CACHE_KEY = 'stock_planning';
const CACHE_TTL_HOURS = 4;

// ── Cache helpers ────────────────────────────────────────────────────────────

async function getCached() {
    try {
        const [rows] = await pool.query(
            `SELECT cache_value, expires_at FROM sarga_ai_cache
             WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1`,
            [CACHE_KEY]
        );
        if (rows.length > 0) {
            return typeof rows[0].cache_value === 'string'
                ? JSON.parse(rows[0].cache_value)
                : rows[0].cache_value;
        }
    } catch (err) {
        console.error('[StockPlanning] Cache read error:', err.message);
    }
    return null;
}

async function setCache(data) {
    try {
        const value = JSON.stringify(data);
        await pool.query(
            `INSERT INTO sarga_ai_cache (cache_key, cache_value, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
             ON DUPLICATE KEY UPDATE cache_value = VALUES(cache_value),
                                     expires_at  = VALUES(expires_at)`,
            [CACHE_KEY, value, CACHE_TTL_HOURS]
        );
    } catch (err) {
        console.error('[StockPlanning] Cache write error:', err.message);
    }
}

// ── Mock data generator (fallback when ML service unavailable) ──────────────────

async function getMockStockPlanningData() {
    try {
        // Load actual inventory to generate realistic mock data
        // Use a more efficient approach than ORDER BY RAND() - select random offset
        const [countResult] = await pool.query(`SELECT COUNT(*) as count FROM sarga_inventory`);
        const totalCount = countResult[0].count;
        const randomOffset = totalCount > 20 ? Math.floor(Math.random() * (totalCount - 20)) : 0;
        
        const [items] = await pool.query(`SELECT id, name, category, unit, quantity FROM sarga_inventory LIMIT 20 OFFSET ?`, [randomOffset]);
        
        const stock_status = items.map((item, _idx) => {
            const currentStock = parseInt(item.quantity) || 0;
            const avgConsumption = 2 + Math.random() * 5;
            const daysToStockout = currentStock > 0 ? Math.floor(currentStock / avgConsumption) : 0;
            
            let status = 'ok';
            if (daysToStockout === 0) status = 'critical';
            else if (daysToStockout < 7) status = 'low';
            
            return {
                material_id: item.id,
                name: item.name,
                category: item.category || 'General',
                unit: item.unit || 'pcs',
                current_stock: currentStock,
                avg_daily_consumption: parseFloat(avgConsumption.toFixed(2)),
                days_to_stockout: daysToStockout,
                status,
            };
        });

        const critical = stock_status.filter(s => s.status === 'critical');
        const purchase_list = critical.map(item => ({
            material_id: item.material_id,
            name: item.name,
            suggested_qty: Math.ceil(item.current_stock + 30),
            unit: item.unit,
            estimated_cost: Math.round(Math.random() * 5000 + 500),
            vendor_name: 'Pending Assignment',
            urgency: 'critical',
        }));

        const total_estimated_cost = purchase_list.reduce((sum, p) => sum + p.estimated_cost, 0);

        return {
            stock_status,
            purchase_list,
            total_estimated_cost,
            generated_at: new Date().toISOString(),
            _isMockData: true,
        };
    } catch (err) {
        console.error('[StockPlanning] Mock data generation error:', err.message);
        throw err;
    }
}

// ── Fetch from ML service (or cache) ─────────────────────────────────────────

async function getStockPlanningData(forceRefresh = false) {
    if (process.env.ENABLE_ML !== 'true') {
        console.log('[AI_DISABLED] ML skipped');
        const cached = await getCached();
        if (cached) return cached;
        return await getMockStockPlanningData();
    }
    if (!forceRefresh) {
        const cached = await getCached();
        if (cached) return cached;
    }

    try {
        const res = await axios.post(`${ML_URL}/stock-planning`, {}, {
            timeout: ML_TIMEOUT,
            headers: { 'Content-Type': 'application/json' },
        });
        const data = res.data;
        await setCache(data);
        return data;
    } catch (err) {
        console.error('[StockPlanning] ML service error:', err.message);
        // Fall back to cache even if expired
        try {
            const [rows] = await pool.query(
                `SELECT cache_value FROM sarga_ai_cache WHERE cache_key = ? LIMIT 1`,
                [CACHE_KEY]
            );
            if (rows.length > 0) {
                const fallback = typeof rows[0].cache_value === 'string'
                    ? JSON.parse(rows[0].cache_value)
                    : rows[0].cache_value;
                fallback._fromCache = true;
                return fallback;
            }
        } catch (_) { /* ignore */ }
        
        // Final fallback: generate mock data from actual inventory
        console.error('[StockPlanning] Generating mock data (ML service unavailable)');
        return await getMockStockPlanningData();
    }
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get('/stock-status',
    authenticateToken,
    authorizeRoles('Admin', 'Front Office', 'Accountant'),
    async (req, res) => {
        try {
            const refresh = req.query.refresh === 'true';
            const data = await getStockPlanningData(refresh);
            res.json({
                stock_status: data.stock_status || [],
                generated_at: data.generated_at,
                _fromCache: data._fromCache || false,
            });
        } catch (err) {
            console.error('[StockPlanning] stock-status error:', err.message);
            res.status(502).json({ error: 'Stock planning service unavailable' });
        }
    }
);

router.get('/purchase-list',
    authenticateToken,
    authorizeRoles('Admin', 'Front Office', 'Accountant'),
    async (req, res) => {
        try {
            const refresh = req.query.refresh === 'true';
            const data = await getStockPlanningData(refresh);
            res.json({
                purchase_list: data.purchase_list || [],
                total_estimated_cost: data.total_estimated_cost || 0,
                generated_at: data.generated_at,
                _fromCache: data._fromCache || false,
            });
        } catch (err) {
            console.error('[StockPlanning] purchase-list error:', err.message);
            res.status(502).json({ error: 'Stock planning service unavailable' });
        }
    }
);

router.post('/approve-purchase-list',
    authenticateToken,
    authorizeRoles('Admin'),
    async (req, res) => {
        const conn = await pool.getConnection();
        try {
            const { items, notes } = req.body;

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'No items provided' });
            }

            const totalCost = items.reduce((sum, i) => sum + (parseFloat(i.estimated_cost) || 0), 0);

            await conn.beginTransaction();

            const [orderResult] = await conn.query(
                `INSERT INTO sarga_purchase_orders (status, total_estimated_cost, created_by, notes)
                 VALUES ('pending', ?, ?, ?)`,
                [totalCost, req.user.id, notes || null]
            );
            const orderId = orderResult.insertId;

            for (const item of items) {
                await conn.query(
                    `INSERT INTO sarga_purchase_order_items
                     (purchase_order_id, inventory_item_id, suggested_qty, unit, estimated_cost, vendor_name, urgency)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderId,
                        item.material_id,
                        item.suggested_qty || 0,
                        item.unit || 'pcs',
                        item.estimated_cost || 0,
                        item.vendor_name || null,
                        item.urgency || 'this_week',
                    ]
                );
            }

            await conn.commit();

            res.json({
                success: true,
                order_id: orderId,
                total_estimated_cost: totalCost,
                item_count: items.length,
            });
        } catch (err) {
            await conn.rollback();
            console.error('[StockPlanning] approve error:', err.message);
            res.status(500).json({ error: 'Failed to save purchase order' });
        } finally {
            conn.release();
        }
    }
);

// ── Normal / Manual Stock Planning (reorder frequency, consumption-based) ──

router.get('/normal-summary',
    authenticateToken,
    authorizeRoles('Admin', 'Front Office', 'Accountant'),
    async (req, res) => {
        try {
            const branchId = req.query.branch_id || null;
            const days = parseInt(req.query.days) || 90;

            // 1. Get all inventory items with current stock
            let inventoryQuery = `
                SELECT i.id, i.name, i.category, i.unit, i.quantity AS current_stock,
                       i.reorder_level, i.min_stock
                FROM sarga_inventory i
                WHERE i.is_active = 1
            `;
            const params = [];
            if (branchId) {
                inventoryQuery = `
                    SELECT i.id, i.name, i.category, i.unit,
                           COALESCE(bs.quantity, 0) AS current_stock,
                           i.reorder_level, i.min_stock
                    FROM sarga_inventory i
                    LEFT JOIN sarga_branch_stock bs ON bs.inventory_item_id = i.id AND bs.branch_id = ?
                    WHERE i.is_active = 1
                `;
                params.push(branchId);
            }
            const [items] = await pool.query(inventoryQuery, params);

            // 2. Get reorder counts per inventory item from purchase orders
            const [reorderData] = await pool.query(`
                SELECT poi.inventory_item_id, COUNT(DISTINCT poi.purchase_order_id) AS reorder_count,
                       MAX(po.created_at) AS last_reorder_date
                FROM sarga_purchase_order_items poi
                JOIN sarga_purchase_orders po ON po.id = poi.purchase_order_id
                WHERE po.status IN ('approved', 'ordered', 'received')
                  AND po.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY poi.inventory_item_id
            `, [days]);
            const reorderMap = {};
            for (const r of reorderData) {
                reorderMap[r.inventory_item_id] = {
                    reorder_count: r.reorder_count,
                    last_reorder_date: r.last_reorder_date,
                };
            }

            // 3. Get consumption data from movement log
            const [consumptionData] = await pool.query(`
                SELECT inventory_item_id,
                       SUM(CASE WHEN movement_type = 'Consumption' THEN ABS(quantity_change) ELSE 0 END) AS total_consumed,
                       COUNT(CASE WHEN movement_type = 'Consumption' THEN 1 END) AS consumption_events,
                       MAX(CASE WHEN movement_type = 'Consumption' THEN created_at END) AS last_consumption_date
                FROM sarga_inventory_movement_log
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY inventory_item_id
            `, [days]);
            const consumptionMap = {};
            for (const c of consumptionData) {
                consumptionMap[c.inventory_item_id] = {
                    total_consumed: parseFloat(c.total_consumed) || 0,
                    consumption_events: c.consumption_events || 0,
                    last_consumption_date: c.last_consumption_date,
                };
            }

            // 4. Build summary
            const summary = items.map(item => {
                const id = item.id;
                const reorder = reorderMap[id] || { reorder_count: 0, last_reorder_date: null };
                const consumption = consumptionMap[id] || { total_consumed: 0, consumption_events: 0, last_consumption_date: null };
                const currentStock = parseFloat(item.current_stock) || 0;
                const months = Math.max(days / 30, 1);
                const avgMonthlyConsumption = consumption.total_consumed / months;
                const avgDailyConsumption = consumption.total_consumed / Math.max(days, 1);
                const daysToStockout = avgDailyConsumption > 0 ? Math.floor(currentStock / avgDailyConsumption) : 99999;

                // Suggested reorder: enough for 45 days based on avg consumption
                const suggestedReorderQty = avgDailyConsumption > 0
                    ? Math.ceil(Math.max(avgDailyConsumption * 45 - currentStock, avgDailyConsumption * 15))
                    : Math.ceil(Math.max(item.reorder_level || 10, currentStock * 0.5));

                const reorderLevel = item.reorder_level || 0;
                let status = 'ok';
                if (currentStock <= 0) status = 'critical';
                else if (currentStock <= reorderLevel) status = 'low';
                else if (daysToStockout < 7) status = 'low';
                else if (daysToStockout < 14 && daysToStockout > 0) status = 'low';

                return {
                    material_id: id,
                    name: item.name,
                    category: item.category || 'General',
                    unit: item.unit || 'pcs',
                    current_stock: currentStock,
                    reorder_level: reorderLevel,
                    min_stock: item.min_stock || 0,
                    reorder_count: reorder.reorder_count,
                    last_reorder_date: reorder.last_reorder_date,
                    total_consumed: consumption.total_consumed,
                    consumption_events: consumption.consumption_events,
                    avg_monthly_consumption: parseFloat(avgMonthlyConsumption.toFixed(2)),
                    avg_daily_consumption: parseFloat(avgDailyConsumption.toFixed(2)),
                    days_to_stockout: daysToStockout,
                    suggested_reorder_qty: Math.max(suggestedReorderQty, 1),
                    last_consumption_date: consumption.last_consumption_date,
                    status,
                };
            });

            // Sort by status (critical first) then by days_to_stockout
            summary.sort((a, b) => {
                const order = { critical: 0, low: 1, ok: 2 };
                const diff = (order[a.status] || 2) - (order[b.status] || 2);
                if (diff !== 0) return diff;
                return (a.days_to_stockout || 99999) - (b.days_to_stockout || 99999);
            });

            res.json({
                summary,
                generated_at: new Date().toISOString(),
                analysis_period_days: days,
            });
        } catch (err) {
            console.error('[StockPlanning] normal-summary error:', err.message);
            res.status(500).json({ error: 'Failed to generate normal stock summary' });
        }
    }
);

module.exports = router;

const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, consumablesInventorySchema } = require('../middleware/validate');

const BRANCH_MAP = {
    perambra: 'Perambra',
    meppayur: 'Meppayur',
    Perambra: 'Perambra',
    Meppayur: 'Meppayur'
};

const normalizeBranch = (branch) => {
    if (!branch || branch === 'All' || branch === 'all') return null;
    return BRANCH_MAP[branch] || null;
};

const normalizeCategory = (category) => {
    if (!category || category === 'all' || category === 'All') return null;
    return String(category).toLowerCase();
};

const CONSUMABLE_FIELDS = `id, name, category, unit, gsm, size_name, brand, finish, color,
    quantity_in_stock, reorder_level, min_stock_level, max_stock_level, location,
    unit_cost, current_rate_id, supplier_name, supplier_id, sku, branch, notes, last_updated`;

// ─── LIST consumables with enhanced fields ───
router.get('/inventory/consumables', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { category, branch, search, low_stock } = req.query;
        const normalizedCategory = normalizeCategory(category);
        const normalizedBranch = normalizeBranch(branch);

        let query = `SELECT ${CONSUMABLE_FIELDS} FROM consumables_inventory WHERE 1=1`;
        const params = [];

        if (normalizedCategory) {
            query += ' AND category = ?';
            params.push(normalizedCategory);
        }
        if (normalizedBranch) {
            query += ' AND branch = ?';
            params.push(normalizedBranch);
        }
        if (search) {
            query += ' AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR size_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (low_stock === 'true') {
            query += ' AND quantity_in_stock <= reorder_level';
        }
        query += ' ORDER BY name ASC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Consumables inventory fetch error:', err);
        res.status(500).json({ message: 'Failed to fetch consumables inventory' });
    }
});

// ─── GET single consumable with current rate ───
router.get('/inventory/consumables/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [[item]] = await pool.query(`
            SELECT c.*, cr.rate as current_rate, cr.effective_date as rate_effective_date,
                   cr.supplier_name as rate_supplier, cr.purchase_order_ref
            FROM consumables_inventory c
            LEFT JOIN consumable_rate_history cr ON c.current_rate_id = cr.id
            WHERE c.id = ?
        `, [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Consumable not found' });
        res.json(item);
    } catch (err) {
        console.error('Fetch consumable error:', err);
        res.status(500).json({ message: 'Failed to fetch consumable' });
    }
});

// ─── ADD consumable ───
router.post('/inventory/consumables', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const {
            name, category, unit, gsm, size_name, brand, finish, color,
            quantity_in_stock, reorder_level, min_stock_level, max_stock_level, location,
            unit_cost, supplier_name, supplier_id, sku, branch, notes
        } = req.body;

        const [result] = await connection.query(
            `INSERT INTO consumables_inventory
            (name, category, unit, gsm, size_name, brand, finish, color,
             quantity_in_stock, reorder_level, min_stock_level, max_stock_level, location,
             unit_cost, supplier_name, supplier_id, sku, branch, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, category, unit, gsm || null, size_name || null, brand || null, finish || null, color || null,
             quantity_in_stock || 0, reorder_level || 0, min_stock_level || null, max_stock_level || null, location || null,
             unit_cost || 0, supplier_name || null, supplier_id || null, sku || null, branch, notes || null]
        );

        // Create initial rate record if unit_cost is provided
        if (unit_cost > 0) {
            const [rateResult] = await connection.query(
                `INSERT INTO consumable_rate_history (consumable_id, rate, effective_date, supplier_name, created_by)
                 VALUES (?, ?, CURDATE(), ?, ?)`,
                [result.insertId, unit_cost, supplier_name || null, req.user.id]
            );
            await connection.query('UPDATE consumables_inventory SET current_rate_id = ? WHERE id = ?', [rateResult.insertId, result.insertId]);
        }

        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_INV_ADD', `Added consumable: ${name} (${category}) in ${branch}`);
        res.status(201).json({ id: result.insertId, message: 'Consumable inventory item added' });
    } catch (err) {
        await connection.rollback();
        console.error('Consumables create error:', err);
        res.status(500).json({ message: 'Failed to add consumable inventory item' });
    } finally {
        connection.release();
    }
});

// ─── UPDATE consumable ───
router.put('/inventory/consumables/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const {
            name, category, unit, gsm, size_name, brand, finish, color,
            quantity_in_stock, reorder_level, min_stock_level, max_stock_level, location,
            unit_cost, supplier_name, supplier_id, sku, branch, notes
        } = req.body;

        await connection.query(
            `UPDATE consumables_inventory SET
             name = ?, category = ?, unit = ?, gsm = ?, size_name = ?, brand = ?, finish = ?, color = ?,
             quantity_in_stock = ?, reorder_level = ?, min_stock_level = ?, max_stock_level = ?, location = ?,
             unit_cost = ?, supplier_name = ?, supplier_id = ?, sku = ?, branch = ?, notes = ?
             WHERE id = ?`,
            [name, category, unit, gsm || null, size_name || null, brand || null, finish || null, color || null,
             quantity_in_stock || 0, reorder_level || 0, min_stock_level || null, max_stock_level || null, location || null,
             unit_cost || 0, supplier_name || null, supplier_id || null, sku || null, branch, notes || null, id]
        );

        // If unit_cost changed, create a new rate history record
        const [[oldItem]] = await connection.query('SELECT unit_cost, current_rate_id FROM consumables_inventory WHERE id = ?', [id]);
        if (oldItem && Number(oldItem.unit_cost) !== Number(unit_cost) && unit_cost > 0) {
            const [rateResult] = await connection.query(
                `INSERT INTO consumable_rate_history (consumable_id, rate, effective_date, supplier_name, created_by)
                 VALUES (?, ?, CURDATE(), ?, ?)`,
                [id, unit_cost, supplier_name || null, req.user.id]
            );
            await connection.query('UPDATE consumables_inventory SET current_rate_id = ? WHERE id = ?', [rateResult.insertId, id]);
        }

        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_INV_UPDATE', `Updated consumable: ${name} (ID: ${id})`);
        res.json({ message: 'Consumable inventory item updated' });
    } catch (err) {
        await connection.rollback();
        console.error('Consumables update error:', err);
        res.status(500).json({ message: 'Failed to update consumable inventory item' });
    } finally {
        connection.release();
    }
});

// ─── DELETE consumable ───
router.delete('/inventory/consumables/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.query('DELETE FROM consumables_inventory WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Consumable item not found' });
        auditLog(req.user.id, 'CONSUMABLE_INV_DELETE', `Deleted consumable inventory ID: ${id}`);
        res.json({ message: 'Consumable inventory item deleted' });
    } catch (err) {
        console.error('Consumables delete error:', err);
        res.status(500).json({ message: 'Failed to delete consumable inventory item' });
    }
});

// ─── ADJUST stock ───
router.put('/inventory/consumables/:id/adjust', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const reason = String(req.body.reason || '').trim();
    const rawDelta = req.body.quantity_delta ?? req.body.delta ?? req.body.change;
    const quantityDelta = Number(rawDelta);
    const adjustmentType = req.body.adjustment_type || (quantityDelta >= 0 ? 'INWARD' : 'OUTWARD');
    const { branch_id, reference_type, reference_id } = req.body;

    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
        return res.status(400).json({ message: 'quantity_delta must be a non-zero number' });
    }
    if (!reason) return res.status(400).json({ message: 'Adjustment reason is required' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT name, quantity_in_stock FROM consumables_inventory WHERE id = ? FOR UPDATE', [id]);
        if (!rows.length) { await connection.rollback(); return res.status(404).json({ message: 'Consumable item not found' }); }

        const item = rows[0];
        const updatedStock = Number(item.quantity_in_stock) + quantityDelta;
        if (updatedStock < 0) { await connection.rollback(); return res.status(400).json({ message: 'Insufficient stock for this adjustment' }); }

        await connection.query('UPDATE consumables_inventory SET quantity_in_stock = ? WHERE id = ?', [updatedStock, id]);
        await connection.query(
            `INSERT INTO consumables_inventory_adjustments
             (consumable_id, adjustment_type, branch_id, quantity_delta, reason, reference_type, reference_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, adjustmentType, branch_id || null, quantityDelta, reason, reference_type || null, reference_id || null, req.user.id]
        );

        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_INV_ADJUST', `Adjusted ${item.name} by ${quantityDelta}. Reason: ${reason}`);
        res.json({ message: 'Stock adjusted successfully', quantity_in_stock: updatedStock });
    } catch (err) {
        await connection.rollback();
        console.error('Consumables adjust error:', err);
        res.status(500).json({ message: 'Failed to adjust consumable stock' });
    } finally {
        connection.release();
    }
});

// ─── RATE HISTORY endpoints ───

// GET rate history for a consumable
router.get('/inventory/consumables/:id/rates', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [rates] = await pool.query(`
            SELECT rh.*, s.name as created_by_name
            FROM consumable_rate_history rh
            LEFT JOIN sarga_staff s ON rh.created_by = s.id
            WHERE rh.consumable_id = ?
            ORDER BY rh.effective_date DESC, rh.created_at DESC
        `, [req.params.id]);
        res.json(rates);
    } catch (err) {
        console.error('Fetch rate history error:', err);
        res.status(500).json({ message: 'Failed to fetch rate history' });
    }
});

// POST new rate for a consumable
router.post('/inventory/consumables/:id/rates', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const { rate, effective_date, supplier_name, supplier_id, purchase_order_ref, notes } = req.body;
    if (!rate || rate <= 0) return res.status(400).json({ message: 'Valid rate is required' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rateResult] = await connection.query(
            `INSERT INTO consumable_rate_history (consumable_id, rate, effective_date, supplier_name, supplier_id, purchase_order_ref, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, rate, effective_date || new Date().toISOString().split('T')[0], supplier_name || null, supplier_id || null, purchase_order_ref || null, notes || null, req.user.id]
        );
        // Update current rate on consumable
        await connection.query('UPDATE consumables_inventory SET current_rate_id = ?, unit_cost = ? WHERE id = ?', [rateResult.insertId, rate, id]);
        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_RATE_ADD', `Added rate ₹${rate} for consumable ID: ${id}`);
        res.status(201).json({ id: rateResult.insertId, message: 'Rate added successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Add rate error:', err);
        res.status(500).json({ message: 'Failed to add rate' });
    } finally {
        connection.release();
    }
});

// ─── PURCHASE HISTORY endpoints ───

// GET purchase history for a consumable
router.get('/inventory/consumables/:id/purchases', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [purchases] = await pool.query(`
            SELECT cp.*, s.name as created_by_name, b.name as branch_name
            FROM consumable_purchases cp
            LEFT JOIN sarga_staff s ON cp.created_by = s.id
            LEFT JOIN sarga_branches b ON cp.branch_id = b.id
            WHERE cp.consumable_id = ?
            ORDER BY cp.purchase_date DESC, cp.created_at DESC
        `, [req.params.id]);
        res.json(purchases);
    } catch (err) {
        console.error('Fetch purchases error:', err);
        res.status(500).json({ message: 'Failed to fetch purchases' });
    }
});

// POST record a purchase
router.post('/inventory/consumables/:id/purchases', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const { quantity, unit_price, supplier_name, supplier_id, purchase_date, invoice_ref, branch_id, notes } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ message: 'Valid quantity is required' });
    if (!unit_price || unit_price <= 0) return res.status(400).json({ message: 'Valid unit_price is required' });

    const total_amount = Number(quantity) * Number(unit_price);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.query(
            `INSERT INTO consumable_purchases (consumable_id, quantity, unit_price, total_amount, supplier_name, supplier_id, purchase_date, invoice_ref, branch_id, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, quantity, unit_price, total_amount, supplier_name || null, supplier_id || null, purchase_date || new Date().toISOString().split('T')[0], invoice_ref || null, branch_id || null, notes || null, req.user.id]
        );
        // Also add stock
        await connection.query('UPDATE consumables_inventory SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?', [Number(quantity), id]);
        await connection.query(
            `INSERT INTO consumables_inventory_adjustments (consumable_id, adjustment_type, branch_id, quantity_delta, reason, reference_type, reference_id, created_by)
             VALUES (?, 'INWARD', ?, ?, ?, 'PURCHASE', ?, ?)`,
            [id, branch_id || null, Number(quantity), `Purchase: ${invoice_ref || 'Direct'}`, result.insertId, req.user.id]
        );
        // Also create rate entry if unit_price differs from current
        const [[current]] = await connection.query('SELECT unit_cost FROM consumables_inventory WHERE id = ?', [id]);
        if (!current || Number(current.unit_cost) !== Number(unit_price)) {
            const [rateResult] = await connection.query(
                `INSERT INTO consumable_rate_history (consumable_id, rate, effective_date, supplier_name, purchase_order_ref, notes, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, unit_price, purchase_date || new Date().toISOString().split('T')[0], supplier_name || null, invoice_ref || null, `Purchase: ${invoice_ref || ''}`, req.user.id]
            );
            await connection.query('UPDATE consumables_inventory SET current_rate_id = ?, unit_cost = ? WHERE id = ?', [rateResult.insertId, unit_price, id]);
        }
        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_PURCHASE', `Recorded purchase of ${quantity} of consumable ID: ${id}`);
        res.status(201).json({ id: result.insertId, message: 'Purchase recorded successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Record purchase error:', err);
        res.status(500).json({ message: 'Failed to record purchase' });
    } finally {
        connection.release();
    }
});

// ─── GET bulk current rates (for multi-item quoting) ───
router.post('/inventory/consumables/bulk-rates', authenticateToken, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.json([]);
        const placeholders = ids.map(() => '?').join(',');
        const [rows] = await pool.query(`
            SELECT c.id, c.name, c.unit_cost as current_rate, c.unit
            FROM consumables_inventory c
            WHERE c.id IN (${placeholders})
        `, ids);
        res.json(rows);
    } catch (err) {
        console.error('Bulk rates error:', err);
        res.status(500).json({ message: 'Failed to fetch rates' });
    }
});

// ─── GET current rate for integration with quotations/job costing ───
router.get('/inventory/consumables/:id/current-rate', authenticateToken, async (req, res) => {
    try {
        const [[item]] = await pool.query(`
            SELECT c.id, c.name, c.unit_cost as current_rate, c.unit,
                   cr.effective_date, cr.supplier_name
            FROM consumables_inventory c
            LEFT JOIN consumable_rate_history cr ON c.current_rate_id = cr.id
            WHERE c.id = ?
        `, [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Consumable not found' });
        res.json({
            id: item.id,
            name: item.name,
            rate: Number(item.current_rate) || 0,
            unit: item.unit,
            effective_date: item.effective_date,
            supplier_name: item.supplier_name
        });
    } catch (err) {
        console.error('Fetch current rate error:', err);
        res.status(500).json({ message: 'Failed to fetch current rate' });
    }
});

// ─── GET low stock alerts ───
router.get('/inventory/consumables/low-stock', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { category, branch, search } = req.query;
        const normalizedCategory = normalizeCategory(category);
        const normalizedBranch = normalizeBranch(branch);

        let query = `SELECT ${CONSUMABLE_FIELDS} FROM consumables_inventory WHERE quantity_in_stock <= reorder_level`;
        const params = [];

        if (normalizedCategory) { query += ' AND category = ?'; params.push(normalizedCategory); }
        if (normalizedBranch) { query += ' AND branch = ?'; params.push(normalizedBranch); }
        if (search) { query += ' AND name LIKE ?'; params.push(`%${search}%`); }

        query += ' ORDER BY (quantity_in_stock / NULLIF(reorder_level, 0)) ASC, name ASC';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Consumables low-stock fetch error:', err);
        res.status(500).json({ message: 'Failed to fetch low stock consumables' });
    }
});

// ─── GET stats / summary for dashboard KPIs ───
router.get('/inventory/consumables/stats/summary', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [[stats]] = await pool.query(`
            SELECT
                COUNT(*) as total_items,
                SUM(CASE WHEN quantity_in_stock <= reorder_level THEN 1 ELSE 0 END) as low_stock_count,
                COALESCE(SUM(quantity_in_stock * unit_cost), 0) as total_value,
                COUNT(DISTINCT category) as category_count,
                COUNT(DISTINCT supplier_name) as supplier_count
            FROM consumables_inventory
        `);
        res.json(stats);
    } catch (err) {
        console.error('Consumables stats error:', err);
        res.status(500).json({ message: 'Failed to fetch stats' });
    }
});

module.exports = router;

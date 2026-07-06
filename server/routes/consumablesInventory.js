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

router.get('/inventory/consumables', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { category, branch, search } = req.query;
        const normalizedCategory = normalizeCategory(category);
        const normalizedBranch = normalizeBranch(branch);

        let query = 'SELECT id, name, category, unit, quantity_in_stock, reorder_level, unit_cost, supplier_name, branch, notes, last_updated FROM consumables_inventory WHERE 1=1';
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
            query += ' AND name LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY name ASC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Consumables inventory fetch error:', err);
        res.status(500).json({ message: 'Failed to fetch consumables inventory' });
    }
});

router.get('/inventory/consumables/low-stock', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { category, branch, search } = req.query;
        const normalizedCategory = normalizeCategory(category);
        const normalizedBranch = normalizeBranch(branch);

        let query = 'SELECT id, name, category, unit, quantity_in_stock, reorder_level, unit_cost, supplier_name, branch, notes, last_updated FROM consumables_inventory WHERE quantity_in_stock <= reorder_level';
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
            query += ' AND name LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY quantity_in_stock ASC, name ASC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Consumables low-stock fetch error:', err);
        res.status(500).json({ message: 'Failed to fetch low stock consumables' });
    }
});

router.post('/inventory/consumables', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(consumablesInventorySchema), async (req, res) => {
    try {
        const {
            name,
            category,
            unit,
            quantity_in_stock,
            reorder_level,
            unit_cost,
            supplier_name,
            branch,
            notes
        } = req.body;

        const [result] = await pool.query(
            `INSERT INTO consumables_inventory
            (name, category, unit, quantity_in_stock, reorder_level, unit_cost, supplier_name, branch, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, category, unit, quantity_in_stock, reorder_level, unit_cost, supplier_name, branch, notes]
        );

        auditLog(req.user.id, 'CONSUMABLE_INV_ADD', `Added consumable: ${name} (${category}) in ${branch}`);
        res.status(201).json({ id: result.insertId, message: 'Consumable inventory item added' });
    } catch (err) {
        console.error('Consumables create error:', err);
        res.status(500).json({ message: 'Failed to add consumable inventory item' });
    }
});

router.put('/inventory/consumables/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(consumablesInventorySchema), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            category,
            unit,
            quantity_in_stock,
            reorder_level,
            unit_cost,
            supplier_name,
            branch,
            notes
        } = req.body;

        const [result] = await pool.query(
            `UPDATE consumables_inventory
             SET name = ?, category = ?, unit = ?, quantity_in_stock = ?, reorder_level = ?, unit_cost = ?, supplier_name = ?, branch = ?, notes = ?
             WHERE id = ?`,
            [name, category, unit, quantity_in_stock, reorder_level, unit_cost, supplier_name, branch, notes, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Consumable item not found' });
        }

        auditLog(req.user.id, 'CONSUMABLE_INV_UPDATE', `Updated consumable: ${name} (ID: ${id})`);
        res.json({ message: 'Consumable inventory item updated' });
    } catch (err) {
        console.error('Consumables update error:', err);
        res.status(500).json({ message: 'Failed to update consumable inventory item' });
    }
});

router.delete('/inventory/consumables/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.query('DELETE FROM consumables_inventory WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Consumable item not found' });
        }

        auditLog(req.user.id, 'CONSUMABLE_INV_DELETE', `Deleted consumable inventory ID: ${id}`);
        res.json({ message: 'Consumable inventory item deleted' });
    } catch (err) {
        console.error('Consumables delete error:', err);
        res.status(500).json({ message: 'Failed to delete consumable inventory item' });
    }
});

router.put('/inventory/consumables/:id/adjust', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { id } = req.params;
    const reason = String(req.body.reason || '').trim();
    const rawDelta = req.body.quantity_delta ?? req.body.delta ?? req.body.change;
    const quantityDelta = Number(rawDelta);

    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
        return res.status(400).json({ message: 'quantity_delta must be a non-zero number' });
    }

    if (!reason) {
        return res.status(400).json({ message: 'Adjustment reason is required' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT name, quantity_in_stock FROM consumables_inventory WHERE id = ? FOR UPDATE',
            [id]
        );

        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ message: 'Consumable item not found' });
        }

        const item = rows[0];
        const updatedStock = Number(item.quantity_in_stock) + quantityDelta;

        if (updatedStock < 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'Insufficient stock for this adjustment' });
        }

        await connection.query(
            'UPDATE consumables_inventory SET quantity_in_stock = ? WHERE id = ?',
            [updatedStock, id]
        );

        await connection.query(
            `INSERT INTO consumables_inventory_adjustments
             (consumable_id, quantity_delta, reason, created_by)
             VALUES (?, ?, ?, ?)`,
            [id, quantityDelta, reason, req.user.id]
        );

        await connection.commit();

        auditLog(
            req.user.id,
            'CONSUMABLE_INV_ADJUST',
            `Adjusted ${item.name} by ${quantityDelta}. Reason: ${reason}`
        );

        res.json({
            message: 'Stock adjusted successfully',
            quantity_in_stock: updatedStock
        });
    } catch (err) {
        await connection.rollback();
        console.error('Consumables adjust error:', err);
        res.status(500).json({ message: 'Failed to adjust consumable stock' });
    } finally {
        connection.release();
    }
});

module.exports = router;

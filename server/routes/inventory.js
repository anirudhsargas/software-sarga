const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, addInventorySchema } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// --- INVENTORY ROUTES (Admin Only) ---

// List Inventory
router.get('/inventory', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'), async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req);
        const usePagination = !!req.query.page;

        if (usePagination) {
            const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM sarga_inventory");
            const [rows] = await pool.query("SELECT * FROM sarga_inventory ORDER BY created_at DESC LIMIT ? OFFSET ?", [limit, offset]);
            return res.json(paginatedResponse(rows, cnt, page, limit));
        }

        const [rows] = await pool.query("SELECT * FROM sarga_inventory ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Inventory Item
router.post('/inventory', authenticateToken, authorizeRoles('Admin'), validate(addInventorySchema), async (req, res) => {
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price } = req.body;

    try {
        const [result] = await pool.query(
            `INSERT INTO sarga_inventory (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            , [
                name,
                sku || null,
                category || null,
                unit || 'pcs',
                Number(quantity) || 0,
                Number(reorder_level) || 0,
                Number(cost_price) || 0,
                Number(sell_price) || 0
            ]
        );

        auditLog(req.user.id, 'INVENTORY_ADD', `Added item ${name} (${sku || 'no-sku'})`);
        res.status(201).json({ id: result.insertId, message: 'Inventory item added' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Inventory Item
router.put('/inventory/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price } = req.body;

    try {
        await pool.query(
            `UPDATE sarga_inventory
             SET name = ?, sku = ?, category = ?, unit = ?, quantity = ?, reorder_level = ?, cost_price = ?, sell_price = ?
             WHERE id = ?`
            , [
                name,
                sku || null,
                category || null,
                unit || 'pcs',
                Number(quantity) || 0,
                Number(reorder_level) || 0,
                Number(cost_price) || 0,
                Number(sell_price) || 0,
                id
            ]
        );

        auditLog(req.user.id, 'INVENTORY_UPDATE', `Updated item ${id} (${name})`);
        res.json({ message: 'Inventory item updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Inventory Item
router.delete('/inventory/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query("DELETE FROM sarga_inventory WHERE id = ?", [id]);
        auditLog(req.user.id, 'INVENTORY_DELETE', `Deleted item ${id}`);
        res.json({ message: 'Inventory item deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;

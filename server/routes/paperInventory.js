const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');

// Auto-migrate: ensure sarga_paper_inventory table exists
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sarga_paper_inventory (
                id INT NOT NULL AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                sku VARCHAR(100) UNIQUE,
                gsm INT,
                size VARCHAR(50),
                finish VARCHAR(100),
                brand VARCHAR(100),
                sheets_per_packet INT DEFAULT 1,
                packets_in_stock DECIMAL(10, 2) DEFAULT 0,
                total_sheets AS (packets_in_stock * sheets_per_packet) VIRTUAL,
                reorder_level_packets DECIMAL(10, 2) DEFAULT 5,
                cost_per_packet DECIMAL(12, 2) DEFAULT 0,
                sell_per_sheet DECIMAL(12, 2) DEFAULT 0,
                gst_rate DECIMAL(5, 2) DEFAULT 0,
                vendor_name VARCHAR(255),
                location VARCHAR(100),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_paper_sku (sku),
                INDEX idx_paper_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `);
        console.log('[Migration] sarga_paper_inventory table ensured.');
    } catch (err) {
        console.error('[Migration Error] sarga_paper_inventory:', err.message);
    }
})();

// --- ROUTES ---

// List Paper Inventory
router.get('/paper-inventory', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sarga_paper_inventory ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        console.error('Fetch paper inventory error:', err);
        res.status(500).json({ message: 'Failed to fetch paper inventory' });
    }
});

// Get Single Item
router.get('/paper-inventory/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sarga_paper_inventory WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Paper item not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Paper Item
router.post('/paper-inventory', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { name, sku, gsm, size, finish, brand, sheets_per_packet, packets_in_stock, reorder_level_packets, cost_per_packet, sell_per_sheet, gst_rate, vendor_name, location, notes } = req.body;
    try {
        const [result] = await pool.query(
            `INSERT INTO sarga_paper_inventory 
            (name, sku, gsm, size, finish, brand, sheets_per_packet, packets_in_stock, reorder_level_packets, cost_per_packet, sell_per_sheet, gst_rate, vendor_name, location, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, sku || null, gsm || null, size || null, finish || null, brand || null, sheets_per_packet || 1, packets_in_stock || 0, reorder_level_packets || 0, cost_per_packet || 0, sell_per_sheet || 0, gst_rate || 0, vendor_name || null, location || null, notes || null]
        );
        auditLog(req.user.id, 'PAPER_INV_ADD', `Added paper: ${name}`);
        res.status(201).json({ id: result.insertId, message: 'Paper item added' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        console.error('Add paper inventory error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Paper Item
router.put('/paper-inventory/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { name, sku, gsm, size, finish, brand, sheets_per_packet, packets_in_stock, reorder_level_packets, cost_per_packet, sell_per_sheet, gst_rate, vendor_name, location, notes } = req.body;
    try {
        await pool.query(
            `UPDATE sarga_paper_inventory 
             SET name = ?, sku = ?, gsm = ?, size = ?, finish = ?, brand = ?, sheets_per_packet = ?, packets_in_stock = ?, 
                 reorder_level_packets = ?, cost_per_packet = ?, sell_per_sheet = ?, gst_rate = ?, vendor_name = ?, location = ?, notes = ?
             WHERE id = ?`,
            [name, sku || null, gsm || null, size || null, finish || null, brand || null, sheets_per_packet || 1, packets_in_stock || 0, reorder_level_packets || 0, cost_per_packet || 0, sell_per_sheet || 0, gst_rate || 0, vendor_name || null, location || null, notes || null, req.params.id]
        );
        auditLog(req.user.id, 'PAPER_INV_UPDATE', `Updated paper: ${name} (ID: ${req.params.id})`);
        res.json({ message: 'Paper item updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Paper Item
router.delete('/paper-inventory/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM sarga_paper_inventory WHERE id = ?', [req.params.id]);
        auditLog(req.user.id, 'PAPER_INV_DELETE', `Deleted paper ID: ${req.params.id}`);
        res.json({ message: 'Paper item deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Quick Stock Update (Adjustment)
router.patch('/paper-inventory/:id/stock', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Printer'), async (req, res) => {
    const { adjustment, notes } = req.body; // adjustment can be positive or negative
    try {
        const [rows] = await pool.query('SELECT packets_in_stock, name FROM sarga_paper_inventory WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
        
        const newStock = Number(rows[0].packets_in_stock) + Number(adjustment);
        if (newStock < 0) return res.status(400).json({ message: 'Insufficient stock' });

        await pool.query('UPDATE sarga_paper_inventory SET packets_in_stock = ? WHERE id = ?', [newStock, req.params.id]);
        auditLog(req.user.id, 'PAPER_INV_ADJUST', `Adjusted stock for ${rows[0].name} by ${adjustment}`, { notes });
        
        res.json({ new_stock: newStock, message: 'Stock updated' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;

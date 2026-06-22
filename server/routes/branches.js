const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog } = require('../helpers');
const { validate, branchSchema } = require('../middleware/validate');
const { redisCache } = require('../middleware/cache');
const { invalidatePattern } = require('../services/cacheService');
const logger = require('../helpers/logger');

// --- BRANCH ROUTES (Admin Only) ---

// List Branches - Cache for 5 minutes (static data)
router.get('/branches', authenticateToken, redisCache(300, 'route'), async (req, res) => {
    try {
        // Return all branches for all users (needed for dashboards to display branch names)
        const [rows] = await pool.query("SELECT id, name, address, phone, email, upi_id, short_name FROM sarga_branches ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Branch
router.post('/branches', authenticateToken, authorizeRoles('Admin'), validate(branchSchema), async (req, res) => {
    const { name, address, phone, upi_id, short_name } = req.body;
    try {
        const [result] = await pool.query(
            "INSERT INTO sarga_branches (name, address, phone, upi_id, short_name) VALUES (?, ?, ?, ?, ?)",
            [name, address, phone, upi_id || null, short_name || null]
        );
        // Invalidate cache
        invalidatePattern('route').catch(() => {});
        res.status(201).json({ id: result.insertId, message: 'Branch added successfully' });
        auditLog(req.user.id, 'BRANCH_ADD', `Added branch: ${name}`, { entity_type: 'branch', entity_id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Branch name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Branch
router.put('/branches/:id', authenticateToken, authorizeRoles('Admin'), validate(branchSchema), async (req, res) => {
    const { id } = req.params;
    const { name, address, phone, upi_id, short_name } = req.body;
    logger.info(`Updating branch ${id}:`, { name, address, phone, upi_id, short_name });
    try {
        const [result] = await pool.query(
            "UPDATE sarga_branches SET name = ?, address = ?, phone = ?, upi_id = ?, short_name = ? WHERE id = ?",
            [name, address, phone, upi_id || null, short_name || null, id]
        );
        logger.info(`Update result for branch ${id}:`, result.affectedRows, 'rows affected');
        // Invalidate cache
        invalidatePattern('route').catch(() => {});
        auditLog(req.user.id, 'BRANCH_UPDATE', `Updated branch #${id}: ${name}`, { entity_type: 'branch', entity_id: id });
        res.json({ message: 'Branch updated successfully' });
    } catch (err) {
        logger.error(`Error updating branch ${id}:`, err);
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Branch name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Branch
router.delete('/branches/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM sarga_branches WHERE id = ?", [id]);
        // Invalidate cache
        invalidatePattern('route').catch(() => {});
        auditLog(req.user.id, 'BRANCH_DELETE', `Deleted branch #${id}`, { entity_type: 'branch', entity_id: id });
        res.json({ message: 'Branch deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;


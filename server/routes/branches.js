const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog } = require('../helpers');
const { validate, branchSchema } = require('../middleware/validate');

// --- BRANCH ROUTES (Admin Only) ---

// List Branches
router.get('/branches', authenticateToken, async (req, res) => {
    try {
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            const branchId = await getUserBranchId(req.user.id);
            const [rows] = await pool.query("SELECT * FROM sarga_branches WHERE id = ?", [branchId]);
            return res.json(rows);
        }
        const [rows] = await pool.query("SELECT * FROM sarga_branches ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// Add Branch
router.post('/branches', authenticateToken, authorizeRoles('Admin'), validate(branchSchema), async (req, res) => {
    const { name, address, phone, upi_id } = req.body;
    try {
        const [result] = await pool.query(
            "INSERT INTO sarga_branches (name, address, phone, upi_id) VALUES (?, ?, ?, ?)",
            [name, address, phone, upi_id || null]
        );
        res.status(201).json({ id: result.insertId, message: 'Branch added successfully' });
        auditLog(req.user.id, 'BRANCH_ADD', `Added branch: ${name}`, { entity_type: 'branch', entity_id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Branch name already exists' });
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// Update Branch
router.put('/branches/:id', authenticateToken, authorizeRoles('Admin'), validate(branchSchema), async (req, res) => {
    const { id } = req.params;
    const { name, address, phone, upi_id } = req.body;
    console.log(`Updating branch ${id}:`, { name, address, phone, upi_id });
    try {
        const [result] = await pool.query(
            "UPDATE sarga_branches SET name = ?, address = ?, phone = ?, upi_id = ? WHERE id = ?",
            [name, address, phone, upi_id || null, id]
        );
        console.log(`Update result for branch ${id}:`, result.affectedRows, 'rows affected');
        auditLog(req.user.id, 'BRANCH_UPDATE', `Updated branch #${id}: ${name}`, { entity_type: 'branch', entity_id: id });
        res.json({ message: 'Branch updated successfully' });
    } catch (err) {
        console.error(`Error updating branch ${id}:`, err);
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Branch name already exists' });
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// Delete Branch
router.delete('/branches/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM sarga_branches WHERE id = ?", [id]);
        auditLog(req.user.id, 'BRANCH_DELETE', `Deleted branch #${id}`, { entity_type: 'branch', entity_id: id });
        res.json({ message: 'Branch deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

module.exports = router;


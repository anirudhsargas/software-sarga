const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId } = require('../helpers');
const { validate, branchSchema } = require('../middleware/validate');

// --- BRANCH ROUTES (Admin Only) ---

// List Branches
router.get('/branches', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            const [rows] = await pool.query("SELECT * FROM sarga_branches WHERE id = ?", [branchId]);
            return res.json(rows);
        }
        const [rows] = await pool.query("SELECT * FROM sarga_branches ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Branch
router.post('/branches', authenticateToken, authorizeRoles('Admin'), validate(branchSchema), async (req, res) => {
    const { name, address, phone } = req.body;
    try {
        const [result] = await pool.query(
            "INSERT INTO sarga_branches (name, address, phone) VALUES (?, ?, ?)",
            [name, address, phone]
        );
        res.status(201).json({ id: result.insertId, message: 'Branch added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Branch name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Branch
router.put('/branches/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    const { name, address, phone } = req.body;
    try {
        await pool.query(
            "UPDATE sarga_branches SET name = ?, address = ?, phone = ? WHERE id = ?",
            [name, address, phone, id]
        );
        res.json({ message: 'Branch updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Branch name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Branch
router.delete('/branches/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM sarga_branches WHERE id = ?", [id]);
        res.json({ message: 'Branch deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;

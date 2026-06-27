const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../helpers');

// Helper: determine branch scope (Admin/Accountant may pass branch_id)
const getBranchId = (user, queryBranchId) => {
    if (user.role === 'Admin' || user.role === 'Accountant') {
        return queryBranchId || user.branch_id;
    }
    return user.branch_id;
};

// GET / - list transfers (optional filters: branch_id, from_date, to_date)
router.get('/', auth.authenticate, async (req, res) => {
    try {
        const branchId = getBranchId(req.user, req.query.branch_id);
        const { from_date, to_date } = req.query;

        const params = [branchId];
        let where = ' WHERE branch_id = ?';
        if (from_date) { where += ' AND DATE(created_at) >= ?'; params.push(from_date); }
        if (to_date) { where += ' AND DATE(created_at) <= ?'; params.push(to_date); }

        const limit = parseInt(req.query.limit || '200', 10);
        const offset = parseInt(req.query.offset || '0', 10);

        const [rows] = await pool.query(`SELECT * FROM sarga_internal_transfers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching internal transfers:', err);
        res.status(500).json({ error: 'Failed to fetch internal transfers' });
    }
});

// POST / - create a transfer (Admin/Accountant only)
router.post('/', auth.authenticate, auth.requireRole(['Admin', 'Accountant', 'Front Office']), async (req, res) => {
    try {
        const { from_book_type, to_book_type, amount, note, branch_id } = req.body;
        if (!from_book_type || !to_book_type || !amount || Number(amount) <= 0) {
            return res.status(400).json({ error: 'from_book_type, to_book_type and positive amount are required' });
        }

        const branchId = getBranchId(req.user, branch_id);

        const [result] = await pool.query(
            `INSERT INTO sarga_internal_transfers (branch_id, from_book_type, to_book_type, amount, note, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [branchId, from_book_type, to_book_type, parseFloat(amount), note || null, req.user.id]
        );

        const [rows] = await pool.query('SELECT * FROM sarga_internal_transfers WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error creating transfer:', err);
        res.status(500).json({ error: 'Failed to create transfer' });
    }
});

module.exports = router;

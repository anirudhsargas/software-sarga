const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');

const BOOK_TYPES = ['Offset', 'Laser', 'Other'];

// POST /create-branch-internal-customers
// Admin-only: create three internal customer records per branch if missing
router.post('/create-branch-internal-customers', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
    try {
        const [branches] = await pool.query('SELECT id, name FROM sarga_branches');
        const created = [];

        for (const branch of branches) {
            for (const type of BOOK_TYPES) {
                const internalKey = `${type}-${branch.id}`;
                const name = `${type} ${branch.name}`;

                const [existing] = await pool.query(
                    'SELECT id FROM sarga_customers WHERE client_type = ? AND internal_branch = ? AND branch_id = ?',
                    ['internal', internalKey, branch.id]
                );

                if (!existing || existing.length === 0) {
                    // Deterministic fake mobile to avoid collisions with real mobiles
                    const fakeMobile = `99999${String(branch.id).padStart(3, '0')}${type.charAt(0).toUpperCase()}`;
                    try {
                        await pool.query(
                            'INSERT INTO sarga_customers (mobile, name, type, client_type, internal_branch, branch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
                            [fakeMobile, name, 'Walk-in', 'internal', internalKey, branch.id]
                        );
                        created.push({ branch_id: branch.id, branch_name: branch.name, book_type: type, name });
                    } catch (err) {
                        // If duplicate or other constraint, skip
                        console.warn('Failed to insert internal customer:', err.message);
                    }
                }
            }
        }

        res.json({ success: true, created });
    } catch (err) {
        console.error('Error creating branch internal customers:', err);
        res.status(500).json({ error: 'Failed to create internal customers' });
    }
});

module.exports = router;

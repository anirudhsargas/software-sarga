const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');

// Helper: determine branch scope (Admin/Accountant may pass branch_id)
const getBranchId = (user, queryBranchId) => {
    if (user.role === 'Admin' || user.role === 'Accountant') {
        return queryBranchId || user.branch_id;
    }
    return user.branch_id;
};

// GET / - list unified internal transactions (transfers + internal bills)
// Params: branch_id (optional for privileged), from, to, type=transfer|billing|all, limit, offset
router.get('/', auth.authenticate, async (req, res) => {
    try {
        const branchId = getBranchId(req.user, req.query.branch_id);
        const { from, to, type } = req.query;
        const limit = parseInt(req.query.limit || '100', 10);
        const offset = parseInt(req.query.offset || '0', 10);

        // Fetch transfers
        const transferParams = [branchId];
        let transferWhere = 'WHERE t.branch_id = ?';
        if (from) { transferWhere += ' AND DATE(t.created_at) >= ?'; transferParams.push(from); }
        if (to) { transferWhere += ' AND DATE(t.created_at) <= ?'; transferParams.push(to); }

        const [transfers] = await pool.query(
            `SELECT t.id, t.branch_id, b.name as branch_name, t.from_book_type, t.to_book_type, t.amount, t.note, t.created_by, s.name as created_by_name, t.created_at
             FROM sarga_internal_transfers t
             LEFT JOIN sarga_branches b ON t.branch_id = b.id
             LEFT JOIN sarga_staff s ON t.created_by = s.id
             ${transferWhere}
             ORDER BY t.created_at DESC
             LIMIT 1000`,
            transferParams
        );

        // Fetch internal billings
        const billingParams = [branchId];
        let billingWhere = 'WHERE cp.is_internal = 1 AND cp.branch_id = ?';
        if (from) { billingWhere += ' AND DATE(cp.payment_date) >= ?'; billingParams.push(from); }
        if (to) { billingWhere += ' AND DATE(cp.payment_date) <= ?'; billingParams.push(to); }

        const [billings] = await pool.query(
            `SELECT cp.id, cp.branch_id, b.name as branch_name, cp.customer_name, cp.internal_department, cp.description, cp.order_lines, cp.total_amount, cp.payment_date, cp.created_at, s.name as added_by
             FROM sarga_customer_payments cp
             LEFT JOIN sarga_branches b ON cp.branch_id = b.id
             LEFT JOIN sarga_staff s ON cp.verified_by = s.id
             ${billingWhere}
             ORDER BY cp.payment_date DESC, cp.created_at DESC
             LIMIT 1000`,
            billingParams
        );

        const mappedTransfers = transfers.map(t => ({
            id: `t-${t.id}`,
            orig_id: t.id,
            type: 'transfer',
            date: t.created_at,
            branch_id: t.branch_id,
            branch_name: t.branch_name,
            amount: Number(t.amount),
            from_book_type: t.from_book_type,
            to_book_type: t.to_book_type,
            note: t.note,
            created_by: t.created_by,
            created_by_name: t.created_by_name || null
        }));

        const mappedBillings = billings.map(b => {
            let order_lines = [];
            try { order_lines = JSON.parse(b.order_lines || '[]'); } catch (_) {}
            const totalPrints = order_lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            const totalSheets = order_lines.reduce((s, l) => s + (Number(l.sheets) || 0), 0);
            return {
                id: `b-${b.id}`,
                orig_id: b.id,
                type: 'billing',
                date: b.payment_date || b.created_at,
                branch_id: b.branch_id,
                branch_name: b.branch_name,
                customer_name: b.customer_name,
                internal_department: b.internal_department,
                description: b.description,
                order_lines,
                total_amount: Number(b.total_amount || 0),
                sheets: totalSheets,
                prints: totalPrints,
                added_by: b.added_by || null
            };
        });

        let combined = [];
        if (!type || type === 'all') combined = [...mappedTransfers, ...mappedBillings];
        else if (type === 'transfer') combined = mappedTransfers;
        else if (type === 'billing') combined = mappedBillings;

        combined.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total = combined.length;
        const results = combined.slice(offset, offset + limit);

        res.json({ transactions: results, total });
    } catch (err) {
        console.error('Error fetching internal transactions:', err);
        res.status(500).json({ error: 'Failed to fetch internal transactions' });
    }
});

module.exports = router;

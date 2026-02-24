const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { getUserBranchId } = require('../helpers');

// ─── FRONT OFFICE DASHBOARD ─────────────────────────────────────────
router.get('/front-office/dashboard', authenticateToken, async (req, res) => {
    try {
        const branchId = req.user.role !== 'Admin'
            ? await getUserBranchId(req.user.id)
            : req.query.branch_id || null;

        const branchWhere = branchId ? ' AND j.branch_id = ?' : '';
        const branchParams = branchId ? [branchId] : [];

        const today = new Date().toISOString().split('T')[0];

        // 1. Quick Stats (Aligned with Admin Stats) ──────────────────
        // Today's orders (New jobs created today)
        const [[todayOrders]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_jobs j WHERE DATE(j.created_at) = ? ${branchWhere}`,
            [today, ...branchParams]
        );

        // In-progress jobs (all active jobs not completed/delivered)
        const [[inProgress]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_jobs j WHERE j.status IN ('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production') ${branchWhere}`,
            branchParams
        );

        // Completed / Ready for pickup (all jobs with status 'Completed' regardless of date)
        const [[readyPickup]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_jobs j WHERE j.status = 'Completed' ${branchWhere}`,
            branchParams
        );

        // Total due (outstanding balance across all non-cancelled jobs)
        const [[totalDue]] = await pool.query(
            `SELECT COALESCE(SUM(j.balance_amount), 0) as amount
             FROM sarga_jobs j WHERE j.status != 'Cancelled' ${branchWhere}`,
            branchParams
        );

        // Today's collections
        const payBranchWhere = branchId ? ' AND p.branch_id = ?' : '';
        const [[todayCollections]] = await pool.query(
            `SELECT COALESCE(SUM(p.advance_paid), 0) as amount FROM sarga_customer_payments p WHERE DATE(p.payment_date) = ? ${payBranchWhere}`,
            [today, ...(branchId ? [branchId] : [])]
        );

        // Delivered today
        const [[deliveredToday]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_jobs j WHERE j.status = 'Delivered' AND DATE(j.updated_at) = ? ${branchWhere}`,
            [today, ...branchParams]
        );

        // 2. Active Jobs Queue ────────────────────────────────────
        const [activeJobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.total_amount, j.advance_paid, j.balance_amount,
                    j.status, j.payment_status, j.delivery_date, j.created_at, j.quantity,
                    COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
             FROM sarga_jobs j
             LEFT JOIN sarga_customers c ON j.customer_id = c.id
             WHERE j.status IN ('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production', 'Completed') ${branchWhere}
             ORDER BY
                CASE j.status
                    WHEN 'Completed' THEN 1
                    WHEN 'Processing' THEN 2
                    WHEN 'Designing' THEN 3
                    WHEN 'Pending' THEN 4
                    ELSE 5
                END,
                j.delivery_date ASC, j.created_at DESC
             LIMIT 50`,
            branchParams
        );

        // 3. Overdue Jobs (delivery_date passed, not delivered) ────
        const [overdueJobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.total_amount, j.advance_paid,
                    j.status, j.delivery_date, j.created_at,
                    COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
             FROM sarga_jobs j
             LEFT JOIN sarga_customers c ON j.customer_id = c.id
             WHERE j.delivery_date < ? AND j.status NOT IN ('Delivered', 'Cancelled') ${branchWhere}
             ORDER BY j.delivery_date ASC
             LIMIT 20`,
            [today, ...branchParams]
        );

        // 4. Due Collection ── Customers with due balances ─────────
        const custBranchWhere = branchId ? ' AND j.branch_id = ?' : '';
        const [dueCustomers] = await pool.query(
            `SELECT c.id, c.name, c.mobile,
                    COUNT(j.id) as job_count,
                    SUM(j.total_amount) as total_billed,
                    SUM(j.advance_paid) as total_paid,
                    SUM(CASE WHEN (j.total_amount - j.advance_paid) >= 1 THEN (j.total_amount - j.advance_paid) ELSE 0 END) as due_amount
             FROM sarga_customers c
             INNER JOIN sarga_jobs j ON j.customer_id = c.id AND j.status != 'Cancelled'
             WHERE 1=1 ${custBranchWhere}
             GROUP BY c.id
             HAVING due_amount >= 1
             ORDER BY due_amount DESC
             LIMIT 30`,
            branchId ? [branchId] : []
        );

        // 5. Recent Payments (today + yesterday) ──────────────────
        const [recentPayments] = await pool.query(
            `SELECT p.id, p.advance_paid as amount, p.payment_method, p.payment_date, p.created_at,
                    COALESCE(c.name, 'Walk-in') as customer_name
             FROM sarga_customer_payments p
             LEFT JOIN sarga_customers c ON p.customer_id = c.id
             WHERE p.payment_date >= DATE_SUB(?, INTERVAL 1 DAY) ${payBranchWhere}
             ORDER BY p.created_at DESC
             LIMIT 15`,
            [today, ...(branchId ? [branchId] : [])]
        );

        // 6. Status breakdown ─────────────────────────────────────
        const [statusCounts] = await pool.query(
            `SELECT j.status, COUNT(*) as count FROM sarga_jobs j WHERE j.status != 'Cancelled' ${branchWhere} GROUP BY j.status`,
            branchParams
        );
        const statusMap = {};
        statusCounts.forEach(r => statusMap[r.status] = r.count);

        res.json({
            stats: {
                today_orders: todayOrders.count || 0,
                in_progress: inProgress.count || 0,
                ready_pickup: readyPickup.count || 0,
                total_due: Number(totalDue.amount) || 0,
                today_collections: Number(todayCollections.amount) || 0,
                delivered_today: deliveredToday.count || 0
            },
            active_jobs: activeJobs.map(j => ({
                ...j,
                total_amount: Number(j.total_amount),
                advance_paid: Number(j.advance_paid),
                balance: Math.max(Number(j.total_amount) - Number(j.advance_paid), 0)
            })),
            overdue_jobs: overdueJobs.map(j => ({
                ...j,
                total_amount: Number(j.total_amount),
                advance_paid: Number(j.advance_paid),
                balance: Math.max(Number(j.total_amount) - Number(j.advance_paid), 0)
            })),
            due_customers: dueCustomers.map(c => ({
                ...c,
                total_billed: Number(c.total_billed),
                total_paid: Number(c.total_paid),
                due_amount: Number(c.due_amount)
            })),
            recent_payments: recentPayments.map(p => ({
                ...p,
                amount: Number(p.amount)
            })),
            status_counts: statusMap
        });
    } catch (err) {
        console.error('Front office dashboard error:', err);
        res.status(500).json({ message: 'Failed to load dashboard' });
    }
});

// ─── QUICK CUSTOMER SEARCH ──────────────────────────────────────────
router.get('/front-office/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    try {
        const branchId = req.user.role !== 'Admin'
            ? await getUserBranchId(req.user.id)
            : null;
        const branchWhere = branchId ? ' AND c.branch_id = ?' : '';

        const [customers] = await pool.query(
            `SELECT c.id, c.name, c.mobile, c.type,
                    (SELECT COUNT(*) FROM sarga_jobs j WHERE j.customer_id = c.id) as job_count,
                    (SELECT COALESCE(SUM(CASE WHEN (j2.total_amount - j2.advance_paid) >= 1 THEN (j2.total_amount - j2.advance_paid) ELSE 0 END), 0)
                     FROM sarga_jobs j2 WHERE j2.customer_id = c.id AND j2.status != 'Cancelled') as due_amount
             FROM sarga_customers c
             WHERE (c.name LIKE ? OR c.mobile LIKE ?) ${branchWhere}
             ORDER BY c.name ASC
             LIMIT 10`,
            [`%${q}%`, `%${q}%`, ...(branchId ? [branchId] : [])]
        );
        res.json(customers.map(c => ({ ...c, due_amount: Number(c.due_amount) })));
    } catch (err) {
        console.error('Front office search error:', err);
        res.status(500).json({ message: 'Search failed' });
    }
});

module.exports = router;

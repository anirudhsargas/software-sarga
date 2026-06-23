// --- PERFORMANCE OPTIMIZATION: Ensure these indexes exist in your DB ---
// ALTER TABLE sarga_jobs ADD INDEX idx_jobs_status (status);
// ALTER TABLE sarga_jobs ADD INDEX idx_jobs_branch_id (branch_id);
// ALTER TABLE sarga_jobs ADD INDEX idx_jobs_delivery_date (delivery_date);

const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { branchFilter } = require('../middleware/branchFilter');
const { getTodayDate } = require('../helpers');

// ─── FRONT OFFICE ATTENDANCE REMINDER (9:00 AM to 10:00 AM) ───────────────
router.get('/front-office/attendance-reminder', authenticateToken, async (req, res) => {
    try {
        const userRole = req.user.role;
        const { branchId } = await branchFilter(req);

        // This reminder is intended for Front Office users.
        if (!branchId || !['Front Office', 'front office'].includes(userRole)) {
            return res.json({
                should_remind: false,
                in_window: false,
                missing_count: 0,
                marked_count: 0,
                total_staff: 0,
                attendance_date: getTodayDate(),
                reminder_until: '10:00'
            });
        }

        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const minutesNow = (hour * 60) + minute;
        const windowStart = 9 * 60;   // 09:00
        const windowEnd = 10 * 60;    // 10:00
        const inWindow = minutesNow >= windowStart && minutesNow < windowEnd;

        const today = getTodayDate();

        // Count active branch staff who should have attendance marked.
        let rows;
        try {
            const result = await pool.query(
                `SELECT s.id, s.name, s.role, sa.status
                 FROM sarga_staff s
                 LEFT JOIN sarga_staff_attendance sa
                   ON sa.staff_id = s.id AND sa.attendance_date = ?
                 WHERE s.branch_id = ?
                   AND s.is_active = 1
                   AND s.role NOT IN ('Admin')
                 ORDER BY s.name ASC`,
                [today, branchId]
            );
            rows = result[0];
        } catch (queryErr) {
            console.error('[AttendanceReminder] Database query failed:', {
                error: queryErr.message,
                code: queryErr.code,
                errno: queryErr.errno,
                sql: queryErr.sql,
                branchId,
                today
            });
            return res.status(500).json({ 
                message: 'Failed to load attendance reminder',
                error: queryErr.message,
                code: queryErr.code 
            });
        }

        if (!Array.isArray(rows)) {
            console.error('[AttendanceReminder] Query returned non-array rows:', {
                rows,
                type: typeof rows
            });
            return res.status(500).json({ 
                message: 'Invalid query response',
                error: 'Query did not return expected array'
            });
        }

        const missing = rows.filter(r => !r.status);
        const marked = rows.filter(r => !!r.status);

        res.json({
            should_remind: inWindow && missing.length > 0,
            in_window: inWindow,
            missing_count: missing.length,
            marked_count: marked.length,
            total_staff: rows.length,
            missing_staff: missing.map(m => ({ id: m.id, name: m.name, role: m.role })),
            attendance_date: today,
            reminder_until: '10:00'
        });
    } catch (err) {
        console.error('[AttendanceReminder] Unexpected error:', {
            error: err.message,
            stack: err.stack,
            name: err.name
        });
        res.status(500).json({ 
            message: 'Failed to load attendance reminder',
            error: err.message 
        });
    }
});

// ─── FRONT OFFICE: MARK ATTENDANCE (batch or single) ─────────────────────
router.post('/front-office/attendance', authenticateToken, async (req, res) => {
    try {
        const allowedRoles = ['Admin', 'Accountant', 'Front Office', 'front office'];
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Only Admin/Accountant/Front Office can record attendance' });
        }

        const { staff_id, status, notes, time, gone_time, attendance_date } = req.body;
        if (!staff_id || !status) {
            return res.status(400).json({ message: 'staff_id and status are required' });
        }

        const validStatus = ['Present', 'Absent', 'Half Day'];
        if (!validStatus.includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Only Present, Absent, Half Day allowed.' });
        }

        const date = attendance_date || getTodayDate();

        // Prevent future dates
        const today = getTodayDate();
        if (date > today) {
            return res.status(400).json({ message: 'Cannot mark attendance for future dates.' });
        }

        const in_time = time
            ? (time.length === 5 ? time + ':00' : time)
            : (['Present', 'Half Day'].includes(status) ? new Date().toTimeString().slice(0, 8) : null);
        const out_time = gone_time
            ? (gone_time.length === 5 ? gone_time + ':00' : gone_time)
            : null;

        await pool.query(`
            INSERT INTO sarga_staff_attendance 
            (staff_id, attendance_date, status, notes, in_time, out_time, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            status = VALUES(status), 
            notes = VALUES(notes),
            in_time = COALESCE(VALUES(in_time), in_time),
            out_time = COALESCE(VALUES(out_time), out_time)
        `, [staff_id, date, status, notes || null, in_time, out_time, req.user.id]);

        // Return saved attendance row (including server `created_at`) so client has both selected and server times
        const [[saved]] = await pool.query(`
            SELECT id, staff_id, attendance_date, status, notes, in_time, out_time, work_hours, created_by, created_at
            FROM sarga_staff_attendance
            WHERE staff_id = ? AND attendance_date = ?
            LIMIT 1
        `, [staff_id, date]);

        res.json({ message: 'Attendance recorded successfully', attendance: saved || null });
    } catch (err) {
        console.error('[FrontOffice] Attendance error:', err);
        res.status(500).json({ message: 'Failed to record attendance' });
    }
});

const { paginate } = require('../helpers/pagination');

// ─── FRONT OFFICE DASHBOARD ─────────────────────────────────────────
router.get('/front-office/dashboard', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);

        const branchWhere = branchId ? ' AND j.branch_id = ?' : '';
        const branchParams = branchId ? [branchId] : [];
        const today = getTodayDate();

        // Limit dashboard queries to last 90 days for performance
        const recentWhere = ` AND j.created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)`;
        const payBranchWhere = branchId ? ' AND p.branch_id = ?' : '';
        const custBranchWhere = branchId ? ' AND j.branch_id = ?' : '';

        // Run all queries in parallel for maximum performance
        const [
            [[todayOrders]],
            [[inProgress]],
            [[readyPickup]],
            [[totalDue]],
            [[todayCollections]],
            [[deliveredToday]],
            [activeJobs],
            [overdueJobs],
            [dueCustomers],
            [recentPayments],
            [statusCounts],
        ] = await Promise.all([
            // 1. Today's orders
            pool.query(
                `SELECT COUNT(*) as count FROM sarga_jobs j WHERE DATE(j.created_at) = ? ${branchWhere}`,
                [today, ...branchParams]
            ),
            // 2. In-progress jobs
            pool.query(
                `SELECT COUNT(*) as count FROM sarga_jobs j WHERE j.status IN ('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production') ${branchWhere}`,
                branchParams
            ),
            // 3. Ready for pickup
            pool.query(
                `SELECT COUNT(*) as count FROM sarga_jobs j WHERE j.status = 'Completed' ${branchWhere}`,
                branchParams
            ),
            // 4. Total due amount
            pool.query(
                `SELECT COALESCE(SUM(j.balance_amount), 0) as amount FROM sarga_jobs j WHERE j.status != 'Cancelled' ${branchWhere}`,
                branchParams
            ),
            // 5. Today's collections
            pool.query(
                `SELECT COALESCE(SUM(p.advance_paid), 0) as amount FROM sarga_customer_payments p WHERE DATE(p.payment_date) = ? ${payBranchWhere}`,
                [today, ...(branchId ? [branchId] : [])]
            ),
            // 6. Delivered today
            pool.query(
                `SELECT COUNT(*) as count FROM sarga_jobs j WHERE j.status = 'Delivered' AND DATE(j.updated_at) = ? ${branchWhere}`,
                [today, ...branchParams]
            ),
            // 7. Active Jobs Queue (last 90 days, only needed fields)
            pool.query(
                `SELECT j.id, j.job_number, j.job_name, j.status, j.total_amount, j.balance_amount, j.delivery_date, COALESCE(c.name, 'Walk-in') as customer_name
                 FROM sarga_jobs j
                 LEFT JOIN sarga_customers c ON j.customer_id = c.id
                 WHERE j.status IN ('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production') ${branchWhere} ${recentWhere}
                 ORDER BY
                    CASE j.status
                        WHEN 'Processing' THEN 1
                        WHEN 'Designing' THEN 2
                        WHEN 'Printing' THEN 3
                        WHEN 'Pending' THEN 4
                        ELSE 5
                    END,
                    j.delivery_date ASC, j.created_at DESC
                 LIMIT 50`,
                branchParams
            ),
            // 8. Overdue Jobs (delivery_date passed, not delivered)
            pool.query(
                `SELECT j.id, j.job_number, j.job_name, j.total_amount, j.advance_paid, j.balance_amount,
                        j.status, j.delivery_date, j.created_at, j.category,
                        COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
                 FROM sarga_jobs j
                 LEFT JOIN sarga_customers c ON j.customer_id = c.id
                 WHERE j.delivery_date < ? AND j.status NOT IN ('Delivered', 'Cancelled') ${branchWhere}
                 ORDER BY j.delivery_date ASC
                 LIMIT 20`,
                [today, ...branchParams]
            ),
            // 9. Due Collection — customers with outstanding balances (last 6 months)
            pool.query(
                `SELECT c.id, c.name, c.mobile,
                        COUNT(j.id) as job_count,
                        SUM(j.total_amount) as total_billed,
                        SUM(j.advance_paid) as total_paid,
                        SUM(j.balance_amount) as due_amount
                 FROM sarga_customers c
                 INNER JOIN sarga_jobs j ON j.customer_id = c.id AND j.status != 'Cancelled'
                 WHERE j.created_at > DATE_SUB(NOW(), INTERVAL 6 MONTH) ${custBranchWhere}
                 GROUP BY c.id
                 HAVING due_amount >= 1
                 ORDER BY due_amount DESC
                 LIMIT 30`,
                branchId ? [branchId] : []
            ),
            // 10. Recent Payments (today + yesterday)
            pool.query(
                `SELECT p.id, p.advance_paid as amount, p.payment_method, p.payment_date, p.created_at,
                        COALESCE(c.name, 'Walk-in') as customer_name
                 FROM sarga_customer_payments p
                 LEFT JOIN sarga_customers c ON p.customer_id = c.id
                 WHERE p.payment_date >= DATE_SUB(?, INTERVAL 1 DAY) ${payBranchWhere}
                 ORDER BY p.created_at DESC
                 LIMIT 15`,
                [today, ...(branchId ? [branchId] : [])]
            ),
            // 11. Status breakdown
            pool.query(
                `SELECT j.status, COUNT(*) as count FROM sarga_jobs j WHERE j.status != 'Cancelled' ${branchWhere} GROUP BY j.status`,
                branchParams
            ),
        ]);

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
                balance: Number(j.balance_amount)
            })),
            overdue_jobs: overdueJobs.map(j => ({
                ...j,
                total_amount: Number(j.total_amount),
                advance_paid: Number(j.advance_paid),
                balance: Number(j.balance_amount)
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

// ─── PAGINATED ACTIVE JOBS ──────────────────────────────────────────
router.get('/front-office/active-jobs', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);
        const branchWhere = branchId ? ' AND j.branch_id = ?' : '';
        const branchParams = branchId ? [branchId] : [];
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit || 50);

        const activeStatuses = "('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production')";
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) as total FROM sarga_jobs j WHERE j.status IN ${activeStatuses} ${branchWhere}`, branchParams
        );
        const [jobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.total_amount, j.advance_paid, j.balance_amount,
                    j.status, j.payment_status, j.delivery_date, j.created_at, j.quantity, j.category,
                    COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
             FROM sarga_jobs j LEFT JOIN sarga_customers c ON j.customer_id = c.id
             WHERE j.status IN ${activeStatuses} ${branchWhere}
             ORDER BY CASE j.status WHEN 'Processing' THEN 1 WHEN 'Designing' THEN 2 WHEN 'Printing' THEN 3 WHEN 'Pending' THEN 4 ELSE 5 END, j.delivery_date ASC, j.created_at DESC
             LIMIT ? OFFSET ?`, [...branchParams, limit, offset]
        );
        res.json(response(jobs.map(j => ({ ...j, total_amount: Number(j.total_amount), advance_paid: Number(j.advance_paid), balance: Number(j.balance_amount) })), total));
    } catch (err) {
        console.error('Active jobs error:', err);
        res.status(500).json({ message: 'Failed to load active jobs' });
    }
});

// ─── PAGINATED DUE COLLECTION ───────────────────────────────────────
router.get('/front-office/due-customers', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);
        const custBranchWhere = branchId ? ' AND j.branch_id = ?' : '';
        const branchParams = branchId ? [branchId] : [];
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit || 50);

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) as total FROM (
                SELECT c.id FROM sarga_customers c
                INNER JOIN sarga_jobs j ON j.customer_id = c.id AND j.status != 'Cancelled'
                WHERE 1=1 ${custBranchWhere}
                GROUP BY c.id
                HAVING SUM(j.balance_amount) >= 1
            ) sub`, branchParams
        );
        const [rows] = await pool.query(
            `SELECT c.id, c.name, c.mobile,
                    COUNT(j.id) as job_count,
                    SUM(j.total_amount) as total_billed,
                    SUM(j.advance_paid) as total_paid,
                    SUM(j.balance_amount) as due_amount
             FROM sarga_customers c
             INNER JOIN sarga_jobs j ON j.customer_id = c.id AND j.status != 'Cancelled'
             WHERE 1=1 ${custBranchWhere}
             GROUP BY c.id
             HAVING due_amount >= 1
             ORDER BY due_amount DESC
             LIMIT ? OFFSET ?`, [...branchParams, limit, offset]
        );
        res.json(response(rows.map(c => ({ ...c, total_billed: Number(c.total_billed), total_paid: Number(c.total_paid), due_amount: Number(c.due_amount) })), total));
    } catch (err) {
        console.error('Due customers error:', err);
        res.status(500).json({ message: 'Failed to load due customers' });
    }
});

// ─── PAGINATED OVERDUE JOBS ─────────────────────────────────────────
router.get('/front-office/overdue-jobs', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);
        const branchWhere = branchId ? ' AND j.branch_id = ?' : '';
        const branchParams = branchId ? [branchId] : [];
        const today = getTodayDate();
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit || 50);

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) as total FROM sarga_jobs j WHERE j.delivery_date < ? AND j.status NOT IN ('Delivered', 'Cancelled') ${branchWhere}`,
            [today, ...branchParams]
        );
        const [jobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.total_amount, j.advance_paid, j.balance_amount,
                    j.status, j.delivery_date, j.created_at, j.category,
                    COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
             FROM sarga_jobs j LEFT JOIN sarga_customers c ON j.customer_id = c.id
             WHERE j.delivery_date < ? AND j.status NOT IN ('Delivered', 'Cancelled') ${branchWhere}
             ORDER BY j.delivery_date ASC
             LIMIT ? OFFSET ?`, [today, ...branchParams, limit, offset]
        );
        res.json(response(jobs.map(j => ({ ...j, total_amount: Number(j.total_amount), advance_paid: Number(j.advance_paid), balance: Number(j.balance_amount) })), total));
    } catch (err) {
        console.error('Overdue jobs error:', err);
        res.status(500).json({ message: 'Failed to load overdue jobs' });
    }
});

// ─── PAGINATED RECENT PAYMENTS ──────────────────────────────────────
router.get('/front-office/recent-payments', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);
        const payBranchWhere = branchId ? ' AND p.branch_id = ?' : '';
        const branchParams = branchId ? [branchId] : [];
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit || 50);

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) as total FROM sarga_customer_payments p WHERE 1=1 ${payBranchWhere}`, branchParams
        );
        const [rows] = await pool.query(
            `SELECT p.id, p.advance_paid as amount, p.payment_method, p.payment_date, p.created_at,
                    COALESCE(c.name, 'Walk-in') as customer_name
             FROM sarga_customer_payments p
             LEFT JOIN sarga_customers c ON p.customer_id = c.id
             WHERE 1=1 ${payBranchWhere}
             ORDER BY p.created_at DESC
             LIMIT ? OFFSET ?`, [...branchParams, limit, offset]
        );
        res.json(response(rows.map(p => ({ ...p, amount: Number(p.amount) })), total));
    } catch (err) {
        console.error('Recent payments error:', err);
        res.status(500).json({ message: 'Failed to load recent payments' });
    }
});

// ─── QUICK CUSTOMER SEARCH ──────────────────────────────────────────
router.get('/front-office/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    try {
        const { branchId } = await branchFilter(req, { allowPrivilegedQuery: false });
        const branchWhere = branchId ? ' AND c.branch_id = ?' : '';

        const [customers] = await pool.query(
            `SELECT c.id, c.name, c.mobile, c.type,
                    (SELECT COUNT(*) FROM sarga_jobs j WHERE j.customer_id = c.id) as job_count,
                    (SELECT COALESCE(SUM(j2.balance_amount), 0)
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

// ─── DELIVERED JOBS ────────────────────────────────────────────────
router.get('/front-office/delivered', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);
        const branchWhere = branchId ? ' AND j.branch_id = ?' : '';
        const branchParams = branchId ? [branchId] : [];
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit || 50);

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) as total FROM sarga_jobs j WHERE j.status = 'Delivered' ${branchWhere}`,
            branchParams
        );

        const [jobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.description, j.total_amount, j.advance_paid,
                    j.balance_amount, j.status, j.payment_status, j.delivery_date, j.category,
                    j.created_at, j.updated_at, j.quantity, j.customer_id,
                    COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
             FROM sarga_jobs j
             LEFT JOIN sarga_customers c ON j.customer_id = c.id
             WHERE j.status = 'Delivered' ${branchWhere}
             ORDER BY j.updated_at DESC
             LIMIT ? OFFSET ?`,
            [...branchParams, limit, offset]
        );
        res.json(response(jobs.map(j => ({ ...j, total_amount: Number(j.total_amount), advance_paid: Number(j.advance_paid), balance: Math.max(Number(j.balance_amount), 0), delivery_date: j.delivery_date || j.updated_at })), total));
    } catch (err) {
        console.error('Delivered jobs error:', err);
        res.status(500).json({ message: 'Failed to load delivered jobs' });
    }
});

// ─── COMPLETED WORK (with customer grouping) ────────────────────────
router.get('/front-office/completed', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);
        const branchWhere = branchId ? ' AND j.branch_id = ?' : '';
        const branchParams = branchId ? [branchId] : [];
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit || 50);

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) as total FROM sarga_jobs j WHERE j.status = 'Completed' ${branchWhere}`,
            branchParams
        );

        const [jobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.description, j.total_amount, j.advance_paid,
                    j.balance_amount, j.status, j.payment_status, j.delivery_date, j.category,
                    j.created_at, j.updated_at, j.quantity, j.customer_id,
                    COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
             FROM sarga_jobs j
             LEFT JOIN sarga_customers c ON j.customer_id = c.id
             WHERE j.status = 'Completed' ${branchWhere}
             ORDER BY j.updated_at DESC
             LIMIT ? OFFSET ?`,
            [...branchParams, limit, offset]
        );
        res.json(response(jobs.map(j => ({ ...j, total_amount: Number(j.total_amount), advance_paid: Number(j.advance_paid), balance: Number(j.balance_amount) })), total));
    } catch (err) {
        console.error('Completed work error:', err);
        res.status(500).json({ message: 'Failed to load completed work' });
    }
});

// ─── UPDATE WORK NAME (description) ─────────────────────────────────
router.patch('/front-office/jobs/:id/work-name', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { work_name } = req.body;

    if (typeof work_name !== 'string') {
        return res.status(400).json({ message: 'work_name must be a string' });
    }
    const trimmed = work_name.trim().slice(0, 200);

    try {
        const [rows] = await pool.query('SELECT id FROM sarga_jobs WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ message: 'Job not found' });

        await pool.query('UPDATE sarga_jobs SET description = ? WHERE id = ?', [trimmed || null, id]);
        res.json({ message: 'Work name updated', work_name: trimmed });
    } catch (err) {
        console.error('Update work name error:', err);
        res.status(500).json({ message: 'Failed to update work name' });
    }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { normalizeRole } = auth;
const { auditLog, asyncHandler } = require('../helpers');
const { paginate } = require('../helpers/pagination');
const { redisCache } = require('../middleware/cache');
const { invalidatePattern } = require('../services/cacheService');

// Invalidation middleware for writing routes
const invalidateMachinesCache = async (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        try {
            await invalidatePattern('machines');
            console.log('[Cache] Invalidated machines cache due to', req.method, req.originalUrl);
        } catch (err) {
            console.error('[Cache] Invalidation error:', err);
        }
    }
    next();
};

router.use(invalidateMachinesCache);

// ==================== BOOK STAFF ASSIGNMENTS (Offset/Laser/Other) ====================

// GET /machines/book-assignments — get all book-staff assignments
router.get('/book-assignments', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const isAdminRole = ['Admin', 'Accountant'].includes(req.user.role);
        const requestedBranch = req.query.branch_id || null;
        const effectiveBranch = isAdminRole ? requestedBranch : req.user.branch_id;

        let query, params;
        if (isAdminRole && !effectiveBranch) {
            // Admin with no filter — return all branches
            query = `SELECT bsa.book_type, bsa.branch_id, b.name as branch_name, bsa.staff_id, s.name as staff_name, s.role as staff_role
                     FROM sarga_book_staff_assignments bsa
                     JOIN sarga_staff s ON bsa.staff_id = s.id
                     JOIN sarga_branches b ON bsa.branch_id = b.id
                     ORDER BY bsa.book_type, b.name, s.name`;
            params = [];
        } else {
            query = `SELECT bsa.book_type, bsa.branch_id, b.name as branch_name, bsa.staff_id, s.name as staff_name, s.role as staff_role
                     FROM sarga_book_staff_assignments bsa
                     JOIN sarga_staff s ON bsa.staff_id = s.id
                     JOIN sarga_branches b ON bsa.branch_id = b.id
                     WHERE bsa.branch_id = ?
                     ORDER BY bsa.book_type, s.name`;
            params = [effectiveBranch];
        }
        const [rows] = await pool.query(query, params);
        const result = { Offset: [], Laser: [], Other: [] };
        rows.forEach(r => {
            if (result[r.book_type]) result[r.book_type].push({
                staff_id: r.staff_id, staff_name: r.staff_name, staff_role: r.staff_role,
                branch_id: r.branch_id, branch_name: r.branch_name
            });
        });
        res.json(result);
    } catch (err) {
        console.error('Error fetching book assignments:', err);
        res.status(500).json({ error: 'Failed to fetch book assignments' });
    }
});

// POST /machines/book-assignments — set staff for a book type (replaces existing)
router.post('/book-assignments', auth.authenticate, auth.requireRole(['Admin', 'Accountant']), async (req, res) => {
    try {
        const { book_type, staff_ids, branch_id } = req.body;
        const branchId = parseInt(branch_id || req.user.branch_id, 10);
        if (!branchId) {
            return res.status(400).json({ error: 'branch_id is required' });
        }
        if (!['Offset', 'Laser', 'Other'].includes(book_type)) {
            return res.status(400).json({ error: 'book_type must be Offset, Laser, or Other' });
        }
        if (!Array.isArray(staff_ids)) {
            return res.status(400).json({ error: 'staff_ids must be an array' });
        }
        // Replace all assignments for this book type + branch
        await pool.query(
            'DELETE FROM sarga_book_staff_assignments WHERE book_type = ? AND branch_id = ?',
            [book_type, branchId]
        );
        if (staff_ids.length > 0) {
            const values = staff_ids.map(sid => [book_type, sid, branchId, req.user.id]);
            await pool.query(
                'INSERT INTO sarga_book_staff_assignments (book_type, staff_id, branch_id, assigned_by) VALUES ?',
                [values]
            );
        }
        auditLog(req.user.id, 'BOOK_ASSIGNMENT_SET', `Set ${book_type} book staff: [${staff_ids.join(',')}]`, { entity_type: 'book_assignment' });
        res.json({ success: true, book_type, staff_ids });
    } catch (err) {
        console.error('Error setting book assignments:', err);
        res.status(500).json({ error: 'Failed to set book assignments' });
    }
});

// GET /machines/my-books — get book types assigned to the current user
router.get('/my-books', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT book_type FROM sarga_book_staff_assignments WHERE staff_id = ? AND branch_id = ?',
            [req.user.id, req.user.branch_id]
        );
        res.json(rows.map(r => r.book_type));
    } catch (err) {
        console.error('Error fetching my books:', err);
        res.status(500).json({ error: 'Failed to fetch assigned books' });
    }
});

// ==================== ASSIGN STAFF TO MACHINE (ADMIN ONLY) ====================
router.post('/:id/assign-staff', auth.authenticate, auth.requireRole(['Admin', 'Accountant']), async (req, res) => {
    try {
        const { id } = req.params;
        const { staff_ids } = req.body; // Array of staff IDs to assign
        const assigner_id = req.user.id;
        if (!Array.isArray(staff_ids) || staff_ids.length === 0) {
            return res.status(400).json({ error: 'staff_ids (array) required' });
        }
        // Remove existing assignments for this machine
        await pool.query('DELETE FROM sarga_machine_staff_assignments WHERE machine_id = ?', [id]);
        // Insert new assignments
        const values = staff_ids.map(staff_id => [id, staff_id, assigner_id]);
        await pool.query(
            'INSERT INTO sarga_machine_staff_assignments (machine_id, staff_id, assigned_by) VALUES ?', [values]
        );
        res.json({ success: true, assigned_staff_ids: staff_ids });
    } catch (error) {
        console.error('Error assigning staff to machine:', error);
        res.status(500).json({ error: 'Failed to assign staff' });
    }
});

// ==================== REMOVE STAFF FROM MACHINE (ADMIN ONLY) ====================
router.delete('/:id/unassign-staff/:staff_id', auth.authenticate, auth.requireRole(['Admin', 'Accountant']), async (req, res) => {
    try {
        const { id, staff_id } = req.params;
        await pool.query('DELETE FROM sarga_machine_staff_assignments WHERE machine_id = ? AND staff_id = ?', [id, staff_id]);
        auditLog(req.user.id, 'MACHINE_UNASSIGN_STAFF', `Unassigned staff #${staff_id} from machine #${id}`, { entity_type: 'machine', entity_id: id });
        res.json({ success: true, unassigned_staff_id: Number(staff_id) });
    } catch (error) {
        console.error('Error unassigning staff from machine:', error);
        res.status(500).json({ error: 'Failed to unassign staff' });
    }
});

// ==================== GET STAFF ASSIGNMENTS FOR MACHINE (ADMIN ONLY) ====================
router.get('/:id/staff-assignments', auth.authenticate, auth.requireRole(['Admin', 'Accountant']), async (req, res) => {
    try {
        const { id } = req.params;
        const [assignments] = await pool.query(
            `SELECT msa.staff_id, s.name, s.role, msa.assigned_at, assigner.name as assigned_by_name
             FROM sarga_machine_staff_assignments msa
             JOIN sarga_staff s ON msa.staff_id = s.id
             LEFT JOIN sarga_staff assigner ON msa.assigned_by = assigner.id
             WHERE msa.machine_id = ?
             ORDER BY msa.assigned_at DESC`,
            [id]
        );
        res.json(assignments);
    } catch (error) {
        console.error('Error fetching staff assignments:', error);
        res.status(500).json({ error: 'Failed to fetch staff assignments' });
    }
});

// ==================== GET ALL MACHINES ====================
// Staff only see machines assigned to them; Admin/Accountant default to their own branch unless specified
router.get('/', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), redisCache(120, 'machines'), async (req, res) => {
    try {
        const { branch_id, is_active } = req.query;
        const user = req.user;

        const params = [];
        // Build base select with assigned staff info
        let query = `
            SELECT m.*, b.name as branch_name,
                (SELECT GROUP_CONCAT(s.name SEPARATOR ', ') 
                 FROM sarga_machine_staff_assignments msa 
                 JOIN sarga_staff s ON msa.staff_id = s.id 
                 WHERE msa.machine_id = m.id) as assigned_staff_names,
                (SELECT GROUP_CONCAT(msa2.staff_id) 
                 FROM sarga_machine_staff_assignments msa2 
                 WHERE msa2.machine_id = m.id) as assigned_staff_ids
            FROM sarga_machines m
            LEFT JOIN sarga_branches b ON m.branch_id = b.id
        `;

        // Non-admin/accountant staff: only see machines assigned to them. Use an INNER JOIN filter to guarantee only assigned machines are returned.
        if (!['Admin', 'Accountant'].includes(user.role)) {
            query += ` JOIN sarga_machine_staff_assignments msa_filter ON msa_filter.machine_id = m.id AND msa_filter.staff_id = ?`;
            params.push(user.id);
            query += ` WHERE 1=1 AND m.branch_id = ?`;
            params.push(user.branch_id);
        } else {
            // Admin/Accountant: if branch_id is provided, filter by it. Otherwise, return all machines.
            query += ` WHERE 1=1`;
            if (branch_id) {
                query += ` AND m.branch_id = ?`;
                params.push(branch_id);
            }
        }

        // Filter by active status
        if (is_active !== undefined) {
            query += ` AND m.is_active = ?`;
            params.push(is_active === 'true' ? 1 : 0);
        }

        query += ` ORDER BY m.machine_name ASC`;

        const [machines] = await pool.query(query, params);
        try {
            console.log(`[Machines] requested by user id=${user.id} role=${user.role} branch=${user.branch_id} params=${JSON.stringify(req.query)} -> returned ${machines.length} machines`);
        } catch (_e) { /* ignored */ }

        // Parse assigned_staff_ids to array
        machines.forEach(m => {
            m.assigned_staff_ids = m.assigned_staff_ids
                ? m.assigned_staff_ids.split(',').map(Number)
                : [];
        });

        res.json(machines);
    } catch (error) {
        console.error('Error fetching machines:', error);
        res.status(500).json({ error: 'Failed to fetch machines' });
    }
});

// ==================== GET ALL PENDING COUNT REQUESTS (ADMIN) ====================
router.get('/count-requests', auth.authenticate, auth.requireRole(['Admin', 'Accountant']), async (req, res) => {
    try {
        const { status = 'Pending' } = req.query;
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

        const baseFrom = `
             FROM sarga_machine_count_requests mcr
             JOIN sarga_machines m ON mcr.machine_id = m.id
             LEFT JOIN sarga_branches b ON m.branch_id = b.id
             LEFT JOIN sarga_staff sub ON mcr.submitted_by = sub.id
             LEFT JOIN sarga_staff rev ON mcr.reviewed_by = rev.id
             WHERE mcr.status = ?
        `;

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, [status]);
        const [requests] = await pool.query(
            `SELECT mcr.*, m.machine_name, b.name as branch_name,
                    sub.name as submitted_by_name,
                    rev.name as reviewed_by_name
             ${baseFrom}
             ORDER BY mcr.created_at DESC
             LIMIT ? OFFSET ?`,
            [status, limit, offset]
        );
        res.json(response(requests, total));
    } catch (error) {
        console.error('Error fetching count requests:', error);
        res.status(500).json({ error: 'Failed to fetch count requests' });
    }
});

// ==================== MACHINE HEALTH (must be before /:id) ====================

// GET /machines/health — Health status for all machines
router.get('/health', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const user = req.user;
        const params = [];

        let branchFilter = '';
        if (!['Admin', 'Accountant'].includes(user.role)) {
            branchFilter = 'WHERE m.branch_id = ?';
            params.push(user.branch_id);
        }

        const [rows] = await pool.query(`
            SELECT m.id, m.machine_name, m.machine_type, m.branch_id, b.name as branch_name,
                (SELECT mr.reading_date FROM sarga_machine_readings mr
                 WHERE mr.machine_id = m.id ORDER BY mr.reading_date DESC LIMIT 1) as last_reading_date,
                (SELECT mr.opening_count FROM sarga_machine_readings mr
                 WHERE mr.machine_id = m.id ORDER BY mr.reading_date DESC LIMIT 1) as last_opening_count,
                (SELECT mr.closing_count FROM sarga_machine_readings mr
                 WHERE mr.machine_id = m.id ORDER BY mr.reading_date DESC LIMIT 1) as last_closing_count,
                (SELECT mr.sync_source FROM sarga_machine_readings mr
                 WHERE mr.machine_id = m.id ORDER BY mr.reading_date DESC LIMIT 1) as last_sync_source,
                (SELECT mr.sync_timestamp FROM sarga_machine_readings mr
                 WHERE mr.machine_id = m.id ORDER BY mr.reading_date DESC LIMIT 1) as last_sync_timestamp,
                m.last_polled_at, m.health_status, m.last_meter_value,
                (SELECT mr.opening_count FROM sarga_machine_readings mr
                 WHERE mr.machine_id = m.id AND mr.reading_date = CURDATE()) as today_manual_entry,
                (SELECT mpr.total_prints FROM sarga_mpr_meter_data mpr
                 WHERE mpr.machine_id = m.id ORDER BY mpr.fetched_at DESC LIMIT 1) as mpr_meter_value
            FROM sarga_machines m
            LEFT JOIN sarga_branches b ON m.branch_id = b.id
            ${branchFilter}
            ORDER BY m.machine_name ASC
        `, params);

        const today = new Date().toISOString().split('T')[0];
        const todayDate = new Date(today);

        const result = rows.map(m => {
            let health_status = m.health_status || 'unknown';
            let last_sync_time = null;

            if (m.last_sync_timestamp) {
                last_sync_time = m.last_sync_timestamp;
            } else if (m.last_reading_date) {
                last_sync_time = m.last_reading_date;
            }

            if (m.last_reading_date) {
                const lastDate = new Date(m.last_reading_date);
                const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
                if (diffDays === 0) {
                    health_status = 'healthy';
                } else if (diffDays <= 2) {
                    health_status = 'warning';
                } else {
                    health_status = 'critical';
                }
            }

            const current_reading = m.today_manual_entry || m.last_opening_count || null;
            const db_value = m.last_closing_count || null;
            const meter_value = m.mpr_meter_value || m.last_meter_value || null;
            const has_mismatch = current_reading !== null && meter_value !== null && current_reading !== meter_value;

            return {
                machine_id: m.id,
                machine_name: m.machine_name,
                machine_type: m.machine_type,
                branch_id: m.branch_id,
                branch_name: m.branch_name,
                last_sync_time,
                health_status,
                current_reading,
                db_value,
                meter_value,
                has_mismatch
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching machine health:', error);
        res.status(500).json({ error: 'Failed to fetch machine health' });
    }
});

// ==================== GET SINGLE MACHINE (FULL DETAILS) ====================
router.get('/:id', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        // Fetch machine with branch info
        const [machines] = await pool.query(
            `SELECT m.*, b.name as branch_name
       FROM sarga_machines m
       LEFT JOIN sarga_branches b ON m.branch_id = b.id
       WHERE m.id = ?`,
            [id]
        );

        if (machines.length === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }

        const machine = machines[0];

        // Non-admin/accountant: check assignment
        if (!['Admin', 'Accountant'].includes(user.role)) {
            const [assignment] = await pool.query(
                'SELECT id FROM sarga_machine_staff_assignments WHERE machine_id = ? AND staff_id = ?',
                [id, user.id]
            );
            if (assignment.length === 0) {
                return res.status(403).json({ error: 'You are not assigned to this machine' });
            }
        }

        // Fetch assigned staff
        const [assignedStaff] = await pool.query(
            `SELECT s.id, s.name, s.role, s.image_url, msa.assigned_at, 
                    assigner.name as assigned_by_name
             FROM sarga_machine_staff_assignments msa
             JOIN sarga_staff s ON msa.staff_id = s.id
             LEFT JOIN sarga_staff assigner ON msa.assigned_by = assigner.id
             WHERE msa.machine_id = ?
             ORDER BY msa.assigned_at DESC`,
            [id]
        );

        // Fetch recent readings (last 30 days)
        const [readingsRaw] = await pool.query(
            `SELECT mr.*, s.name as created_by_name
             FROM sarga_machine_readings mr
             LEFT JOIN sarga_staff s ON mr.created_by = s.id
             WHERE mr.machine_id = ?
             ORDER BY mr.reading_date DESC LIMIT 30`,
            [id]
        );
        // Clamp total_copies so closing - opening never shows a negative value.
        const readings = readingsRaw.map(r => ({
            ...r,
            total_copies: r.closing_count != null ? Math.max(0, Number(r.closing_count) - Number(r.opening_count)) : 0
        }));

        // Fetch today's reading
        const today = new Date().toISOString().split('T')[0];
        const [todayReading] = await pool.query(
            `SELECT * FROM sarga_machine_readings WHERE machine_id = ? AND reading_date = ?`,
            [id, today]
        );

        // Expected opening count for today = last recorded closing count before today
        const [lastClosing] = await pool.query(
            `SELECT closing_count, reading_date FROM sarga_machine_readings
             WHERE machine_id = ? AND reading_date < ? AND closing_count IS NOT NULL
             ORDER BY reading_date DESC LIMIT 1`,
            [id, today]
        );
        const expectedOpeningCount = lastClosing.length > 0 ? lastClosing[0].closing_count : null;

        // Pending count requests for this machine (admin use)
        const [pendingCountRequests] = await pool.query(
            `SELECT mcr.*, s.name as submitted_by_name
             FROM sarga_machine_count_requests mcr
             LEFT JOIN sarga_staff s ON mcr.submitted_by = s.id
             WHERE mcr.machine_id = ? AND mcr.status = 'Pending'
             ORDER BY mcr.created_at DESC`,
            [id]
        );

        // Fetch today's work entries
        const [todayWork] = await pool.query(
            `SELECT mwe.*, drm.report_date
             FROM sarga_machine_work_entries mwe
             JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
             WHERE drm.machine_id = ? AND drm.report_date = ?
             ORDER BY mwe.entry_time DESC`,
            [id, today]
        );

        // Production summary: last 7 days
        const [productionSummary] = await pool.query(
            `SELECT 
                mr.reading_date,
                mr.opening_count,
                mr.closing_count,
                GREATEST(0, COALESCE(mr.closing_count, 0) - mr.opening_count) as total_copies,
                COALESCE(SUM(mwe.total_amount), 0) as day_revenue,
                COALESCE(SUM(mwe.copies), 0) as work_copies,
                COUNT(mwe.id) as work_entries_count
             FROM sarga_machine_readings mr
             LEFT JOIN sarga_daily_report_machine drm ON drm.machine_id = mr.machine_id AND drm.report_date = mr.reading_date
             LEFT JOIN sarga_machine_work_entries mwe ON mwe.report_id = drm.id
             WHERE mr.machine_id = ?
             GROUP BY mr.reading_date, mr.opening_count, mr.closing_count
             ORDER BY mr.reading_date DESC LIMIT 7`,
            [id]
        );

        // Job Queue: pending/processing jobs assigned to this machine's staff
        const staffIds = assignedStaff.map(s => s.id);
        let jobQueue = [];
        if (staffIds.length > 0) {
            const placeholders = staffIds.map(() => '?').join(',');
            const [jobs] = await pool.query(
                `SELECT j.id, j.job_number, j.job_name, j.description, j.quantity,
                        j.total_amount, j.status, j.delivery_date, j.created_at,
                        c.name as customer_name,
                        jsa.status as assignment_status, s.name as assigned_to
                 FROM sarga_job_staff_assignments jsa
                 JOIN sarga_jobs j ON jsa.job_id = j.id
                 LEFT JOIN sarga_customers c ON j.customer_id = c.id
                 LEFT JOIN sarga_staff s ON jsa.staff_id = s.id
                 WHERE jsa.staff_id IN (${placeholders})
                   AND j.status IN ('Pending', 'Processing')
                 ORDER BY j.delivery_date ASC, j.created_at DESC
                 LIMIT 20`,
                staffIds
            );
            jobQueue = jobs;
        }

        // Cost & Revenue totals (this month)
        const monthStart = new Date();
        monthStart.setDate(1);
        const monthStartStr = monthStart.toISOString().split('T')[0];
        const [monthlyCostRevenue] = await pool.query(
            `SELECT 
                COALESCE(SUM(mwe.total_amount), 0) as total_revenue,
                COALESCE(SUM(mwe.cash_amount), 0) as total_cash,
                COALESCE(SUM(mwe.upi_amount), 0) as total_upi,
                COALESCE(SUM(mwe.credit_amount), 0) as total_credit,
                COALESCE(SUM(mwe.copies), 0) as total_copies,
                COUNT(mwe.id) as total_jobs
             FROM sarga_daily_report_machine drm
             JOIN sarga_machine_work_entries mwe ON mwe.report_id = drm.id
             WHERE drm.machine_id = ? AND drm.report_date >= ?`,
            [id, monthStartStr]
        );

        // Total copies = closing - opening (never negative).
        // If closing is not marked yet, fall back to the system total (sum of today's work entry copies).
        const systemTodayCopies = todayWork.reduce((s, w) => s + Number(w.copies || 0), 0);
        let today_reading = null;
        if (todayReading.length > 0) {
            const r = todayReading[0];
            const closing = r.closing_count;
            today_reading = {
                ...r,
                total_copies: closing != null
                    ? Math.max(0, Number(closing) - Number(r.opening_count))
                    : systemTodayCopies,
                system_copies: systemTodayCopies
            };
        }

        res.json({
            ...machine,
            assigned_staff: assignedStaff,
            readings,
            today_reading,
            expected_opening_count: expectedOpeningCount,
            pending_count_requests: pendingCountRequests,
            today_work: todayWork,
            production_summary: productionSummary,
            job_queue: jobQueue,
            monthly_stats: monthlyCostRevenue[0] || {}
        });
    } catch (error) {
        console.error('Error fetching machine details:', error);
        res.status(500).json({ error: 'Failed to fetch machine details' });
    }
});

// ==================== CREATE MACHINE (ADMIN ONLY) ====================
router.post('/', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
    try {
        const { machine_name, machine_type, machine_category, counter_type, branch_id, location, ip_address, snmp_community, mpr_username, mpr_password, book_type } = req.body;

        if (!machine_name || !machine_type || !branch_id) {
            return res.status(400).json({ error: 'Machine name, type, and branch are required' });
        }

        const [result] = await pool.query(
            `INSERT INTO sarga_machines (machine_name, machine_type, machine_category, counter_type, branch_id, location, ip_address, snmp_community, mpr_username, mpr_password, book_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [machine_name, machine_type, machine_category || null, counter_type || 'Manual', branch_id, location, ip_address || null,
             snmp_community || 'public', mpr_username || null, mpr_password || null, book_type || null]
        );

        const [machines] = await pool.query(
            `SELECT m.*, b.name as branch_name
       FROM sarga_machines m
       LEFT JOIN sarga_branches b ON m.branch_id = b.id
       WHERE m.id = ?`,
            [result.insertId]
        );

        auditLog(req.user.id, 'MACHINE_CREATE', `Created machine: ${machine_name} (${machine_type})`, { entity_type: 'machine', entity_id: result.insertId });
        res.status(201).json(machines[0]);
    } catch (error) {
        console.error('Error creating machine:', error);
        res.status(500).json({ error: 'Failed to create machine' });
    }
});

// ==================== UPDATE MACHINE (ADMIN ONLY) ====================
router.put('/:id', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { machine_name, machine_type, machine_category, counter_type, branch_id, location, ip_address, is_active, snmp_community, mpr_username, mpr_password, book_type } = req.body;
        const [existing] = await pool.query('SELECT id FROM sarga_machines WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }

        const updates = [];
        const params = [];

        if (machine_name !== undefined) { updates.push('machine_name = ?'); params.push(machine_name); }
        if (machine_type !== undefined) { updates.push('machine_type = ?'); params.push(machine_type); }
        if (machine_category !== undefined) { updates.push('machine_category = ?'); params.push(machine_category || null); }
        if (counter_type !== undefined) { updates.push('counter_type = ?'); params.push(counter_type); }
        if (branch_id !== undefined) { updates.push('branch_id = ?'); params.push(branch_id); }
        if (location !== undefined) { updates.push('location = ?'); params.push(location); }
        if (ip_address !== undefined) { updates.push('ip_address = ?'); params.push(ip_address || null); }
        if (snmp_community !== undefined) { updates.push('snmp_community = ?'); params.push(snmp_community || 'public'); }
        if (mpr_username !== undefined) { updates.push('mpr_username = ?'); params.push(mpr_username || null); }
        if (mpr_password !== undefined) { updates.push('mpr_password = ?'); params.push(mpr_password || null); }
        if (book_type !== undefined) { updates.push('book_type = ?'); params.push(book_type || null); }
        if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(id);
        await pool.query(`UPDATE sarga_machines SET ${updates.join(', ')} WHERE id = ?`, params);

        const [machines] = await pool.query(
            `SELECT m.*, b.name as branch_name FROM sarga_machines m LEFT JOIN sarga_branches b ON m.branch_id = b.id WHERE m.id = ?`,
            [id]
        );

        auditLog(req.user.id, 'MACHINE_UPDATE', `Updated machine #${id}: ${machine_name}`, { entity_type: 'machine', entity_id: id });
        res.json(machines[0]);
    } catch (error) {
        console.error('Error updating machine:', error);
        res.status(500).json({ error: 'Failed to update machine' });
    }
});

// ==================== DELETE MACHINE (ADMIN ONLY) ====================
router.delete('/:id', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const [readings] = await pool.query(
            'SELECT COUNT(*) as count FROM sarga_machine_readings WHERE machine_id = ?',
            [id]
        );

        if (readings[0].count > 0) {
            return res.status(400).json({
                error: 'Cannot delete machine with existing readings. Please deactivate instead.'
            });
        }

        const [result] = await pool.query('DELETE FROM sarga_machines WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }

        auditLog(req.user.id, 'MACHINE_DELETE', `Deleted machine #${id}`, { entity_type: 'machine', entity_id: id });
        res.json({ message: 'Machine deleted successfully' });
    } catch (error) {
        console.error('Error deleting machine:', error);
        res.status(500).json({ error: 'Failed to delete machine' });
    }
});

// ==================== ASSIGN STAFF TO MACHINE (ADMIN ONLY) ====================
router.post('/:id/assign-staff', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { staff_ids } = req.body; // Array of staff IDs

        if (!staff_ids || !Array.isArray(staff_ids) || staff_ids.length === 0) {
            return res.status(400).json({ error: 'staff_ids array is required' });
        }

        // Check machine exists
        const [machines] = await pool.query('SELECT id FROM sarga_machines WHERE id = ?', [id]);
        if (machines.length === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }

        // Remove existing assignments, then re-insert
        await pool.query('DELETE FROM sarga_machine_staff_assignments WHERE machine_id = ?', [id]);

        const values = staff_ids.map(staffId => [id, staffId, req.user.id]);
        if (values.length > 0) {
            await pool.query(
                `INSERT INTO sarga_machine_staff_assignments (machine_id, staff_id, assigned_by) VALUES ?`,
                [values]
            );
        }

        // Fetch updated assignments
        const [assignments] = await pool.query(
            `SELECT s.id, s.name, s.role, s.image_url, msa.assigned_at, 
                    assigner.name as assigned_by_name
             FROM sarga_machine_staff_assignments msa
             JOIN sarga_staff s ON msa.staff_id = s.id
             LEFT JOIN sarga_staff assigner ON msa.assigned_by = assigner.id
             WHERE msa.machine_id = ?
             ORDER BY msa.assigned_at DESC`,
            [id]
        );

        res.json({ message: 'Staff assigned successfully', assigned_staff: assignments });
    } catch (error) {
        console.error('Error assigning staff:', error);
        res.status(500).json({ error: 'Failed to assign staff' });
    }
});

// ==================== UNASSIGN STAFF FROM MACHINE (ADMIN ONLY) ====================
router.delete('/:id/unassign-staff/:staffId', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
    try {
        const { id, staffId } = req.params;

        const [result] = await pool.query(
            'DELETE FROM sarga_machine_staff_assignments WHERE machine_id = ? AND staff_id = ?',
            [id, staffId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        auditLog(req.user.id, 'MACHINE_UNASSIGN_STAFF', `Unassigned staff #${staffId} from machine #${id}`, { entity_type: 'machine', entity_id: id });
        res.json({ message: 'Staff unassigned successfully' });
    } catch (error) {
        console.error('Error unassigning staff:', error);
        res.status(500).json({ error: 'Failed to unassign staff' });
    }
});

// ==================== GET MACHINE STAFF ASSIGNMENTS ====================
router.get('/:id/staff', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;

        const [assignments] = await pool.query(
            `SELECT s.id, s.name, s.role, s.image_url, msa.assigned_at, 
                    assigner.name as assigned_by_name
             FROM sarga_machine_staff_assignments msa
             JOIN sarga_staff s ON msa.staff_id = s.id
             LEFT JOIN sarga_staff assigner ON msa.assigned_by = assigner.id
             WHERE msa.machine_id = ?
             ORDER BY msa.assigned_at DESC`,
            [id]
        );

        res.json(assignments);
    } catch (error) {
        console.error('Error fetching machine staff:', error);
        res.status(500).json({ error: 'Failed to fetch machine staff' });
    }
});

// ==================== GET MACHINE READINGS ====================
router.get('/:id/readings', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const { start_date, end_date } = req.query;
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit, 30);

        let whereClauses = ['mr.machine_id = ?'];
        const params = [id];

        if (start_date) {
            whereClauses.push('mr.reading_date >= ?');
            params.push(start_date);
        }
        if (end_date) {
            whereClauses.push('mr.reading_date <= ?');
            params.push(end_date);
        }

        const whereSection = ' WHERE ' + whereClauses.join(' AND ');
        const baseFrom = `
          FROM sarga_machine_readings mr
          LEFT JOIN sarga_staff s ON mr.created_by = s.id
          ${whereSection}
        `;

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
        const [readings] = await pool.query(
            `SELECT mr.*, s.name as created_by_name ${baseFrom} ORDER BY mr.reading_date DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        res.json(response(readings, total));
    } catch (error) {
        console.error('Error fetching machine readings:', error);
        res.status(500).json({ error: 'Failed to fetch machine readings' });
    }
});

// ==================== SAVE/UPDATE MACHINE READING (Opening Count) ====================
router.post('/:id/readings', auth.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { reading_date, opening_count, closing_count, waste_prints, proof_prints, notes } = req.body;
        const isAdmin = normalizeRole(req.user.role) === 'Admin';

        if (!reading_date) {
            return res.status(400).json({ error: 'Reading date is required' });
        }

        // Check machine exists
        const [machines] = await pool.query('SELECT id FROM sarga_machines WHERE id = ?', [id]);
        if (machines.length === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }

        // Non-admin: check assignment
        if (!isAdmin) {
            const [assignment] = await pool.query(
                'SELECT id FROM sarga_machine_staff_assignments WHERE machine_id = ? AND staff_id = ?',
                [id, req.user.id]
            );
            if (assignment.length === 0) {
                return res.status(403).json({ error: 'You are not assigned to this machine' });
            }
        }

        // Staff can only set opening_count once; after that it is locked
        if (!isAdmin) {
            const [existing] = await pool.query(
                `SELECT id, opening_count FROM sarga_machine_readings WHERE machine_id = ? AND reading_date = ?`,
                [id, reading_date]
            );
            if (existing.length > 0) {
                // ALLOW staff to update opening_count if it is currently 0 (likely created by auto-sync)
                if (opening_count !== undefined && parseInt(opening_count) !== existing[0].opening_count && existing[0].opening_count !== 0) {
                    return res.status(403).json({
                        error: 'Opening count already entered and locked. Submit a change request to Admin.',
                        is_locked: true
                    });
                }
                // Allow closing_count / waste / proof updates by staff
                const closeCount = closing_count !== undefined && closing_count !== null && closing_count !== ''
                    ? parseInt(closing_count) : null;
                const totalCopies = closeCount !== null ? Math.max(0, closeCount - existing[0].opening_count) : 0;
                const wastePrints = Math.max(0, parseInt(waste_prints) || 0);
                const proofPrints = Math.max(0, parseInt(proof_prints) || 0);
                if (closeCount !== null && wastePrints + proofPrints > totalCopies) {
                    return res.status(400).json({ error: `Waste prints (${wastePrints}) + proof prints (${proofPrints}) cannot exceed total copies (${totalCopies})` });
                }
                await pool.query(
                    `UPDATE sarga_machine_readings SET closing_count = ?, total_copies = ?, waste_prints = ?, proof_prints = ?, notes = NULL, updated_by = ? WHERE id = ?`,
                    [closeCount, totalCopies, wastePrints, proofPrints, req.user.id, existing[0].id]
                );
                // Sync waste/proof to daily report
                await pool.query(
                    `UPDATE sarga_daily_report_machine SET waste_prints = ?, proof_prints = ? WHERE machine_id = ? AND report_date = ?`,
                    [wastePrints, proofPrints, id, reading_date]
                );
                const [saved] = await pool.query(
                    `SELECT mr.*, s.name as created_by_name FROM sarga_machine_readings mr LEFT JOIN sarga_staff s ON mr.created_by = s.id WHERE mr.id = ?`,
                    [existing[0].id]
                );
                return res.json(saved[0]);
            }
        }

        const openCount = parseInt(opening_count) || 0;
        const closeCount = closing_count !== undefined && closing_count !== null && closing_count !== ''
            ? parseInt(closing_count) : null;
        const totalCopies = closeCount !== null ? Math.max(0, closeCount - openCount) : 0;
        const wastePrints = Math.max(0, parseInt(waste_prints) || 0);
        const proofPrints = Math.max(0, parseInt(proof_prints) || 0);
        if (closeCount !== null && wastePrints + proofPrints > totalCopies) {
            return res.status(400).json({ error: `Waste prints (${wastePrints}) + proof prints (${proofPrints}) cannot exceed total copies (${totalCopies})` });
        }

        // ─── Mismatch detection and validation (non-admin only, new reading for the day) ───
        let countRequestCreated = false;
        if (!isAdmin) {
            const [lastClose] = await pool.query(
                `SELECT closing_count FROM sarga_machine_readings
                 WHERE machine_id = ? AND reading_date < ? AND closing_count IS NOT NULL
                 ORDER BY reading_date DESC LIMIT 1`,
                [id, reading_date]
            );
            if (lastClose.length > 0 && lastClose[0].closing_count !== null) {
                const expectedCount = lastClose[0].closing_count;
                if (openCount < expectedCount) {
                    return res.status(400).json({
                        error: 'Opening count cannot be less than previous closing count (' + expectedCount + ')',
                        min_opening_count: expectedCount
                    });
                }
                if (openCount !== expectedCount) {
                    // Remove any existing pending request for the same machine+date
                    await pool.query(
                        `DELETE FROM sarga_machine_count_requests WHERE machine_id = ? AND reading_date = ? AND status = 'Pending'`,
                        [id, reading_date]
                    );
                    await pool.query(
                        `INSERT INTO sarga_machine_count_requests (machine_id, reading_date, expected_count, entered_count, submitted_by)
                         VALUES (?, ?, ?, ?, ?)`,
                        [id, reading_date, expectedCount, openCount, req.user.id]
                    );
                    countRequestCreated = true;
                }
            }
        }

        await pool.query(
            `INSERT INTO sarga_machine_readings (machine_id, reading_date, opening_count, closing_count, total_copies, waste_prints, proof_prints, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                opening_count = VALUES(opening_count),
                closing_count = VALUES(closing_count),
                total_copies = VALUES(total_copies),
                waste_prints = VALUES(waste_prints),
                proof_prints = VALUES(proof_prints),
                notes = VALUES(notes),
                updated_by = VALUES(created_by)`,
            [id, reading_date, openCount, closeCount, totalCopies, wastePrints, proofPrints, notes || null, req.user.id]
        );
        // Sync waste/proof to daily report master
        await pool.query(
            `UPDATE sarga_daily_report_machine SET waste_prints = ?, proof_prints = ? WHERE machine_id = ? AND report_date = ?`,
            [wastePrints, proofPrints, id, reading_date]
        );

        const [saved] = await pool.query(
            `SELECT mr.*, s.name as created_by_name
             FROM sarga_machine_readings mr
             LEFT JOIN sarga_staff s ON mr.created_by = s.id
             WHERE mr.machine_id = ? AND mr.reading_date = ?`,
            [id, reading_date]
        );

        auditLog(req.user.id, 'MACHINE_READING', `Machine #${id} reading for ${reading_date}: open=${openCount} close=${closeCount} waste=${wastePrints} proof=${proofPrints}`, { entity_type: 'machine_reading', entity_id: id });
        res.json({ ...saved[0], count_request_created: countRequestCreated });
    } catch (error) {
        console.error('Error saving machine reading:', error);
        res.status(500).json({ error: 'Failed to save machine reading' });
    }
});

// ==================== ADD WORK ENTRY TO MACHINE ====================
router.post('/:id/work', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const { customer_name, work_details, copies, payment_type, cash_amount, upi_amount, credit_amount, total_amount, remarks, work_date, waste_copies, proof_copies } = req.body;
        const user = req.user;
        const reportDate = work_date || new Date().toISOString().split('T')[0];

        if (!customer_name || !work_details || copies === undefined) {
            return res.status(400).json({ error: 'Customer name, work details, and copies are required' });
        }
        const goodCopies = parseInt(copies) || 0;
        const wasteCopies = Math.max(0, parseInt(waste_copies) || 0);
        const proofCopies = Math.max(0, parseInt(proof_copies) || 0);
        if (wasteCopies + proofCopies > goodCopies) {
            return res.status(400).json({ error: `Waste copies (${wasteCopies}) + proof copies (${proofCopies}) cannot exceed total copies (${goodCopies})` });
        }

        // Non-admin/accountant: check assignment
        if (!['Admin', 'Accountant'].includes(user.role)) {
            const [assignment] = await pool.query(
                'SELECT id FROM sarga_machine_staff_assignments WHERE machine_id = ? AND staff_id = ?',
                [id, user.id]
            );
            if (assignment.length === 0) {
                return res.status(403).json({ error: 'You are not assigned to this machine' });
            }
        }

        // Get or create daily report for this machine + date
        let reportId;
        const [existingReport] = await pool.query(
            'SELECT id FROM sarga_daily_report_machine WHERE machine_id = ? AND report_date = ?',
            [id, reportDate]
        );

        if (existingReport.length > 0) {
            reportId = existingReport[0].id;
        } else {
            const [machineInfo] = await pool.query('SELECT branch_id, book_type FROM sarga_machines WHERE id = ?', [id]);
            const branchId = machineInfo[0].branch_id;
            const machineBookType = machineInfo[0].book_type || null;

            const [result] = await pool.query(
                `INSERT INTO sarga_daily_report_machine (report_date, machine_id, branch_id, book_type, created_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [reportDate, id, branchId, machineBookType, user.id]
            );
            reportId = result.insertId;
        }

        // Insert work entry
        const [result] = await pool.query(
            `INSERT INTO sarga_machine_work_entries 
             (report_id, customer_name, work_details, copies, waste_copies, proof_copies, payment_type, cash_amount, upi_amount, credit_amount, total_amount, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [reportId, customer_name, work_details, goodCopies, wasteCopies, proofCopies, payment_type || 'Cash',
                parseFloat(cash_amount) || 0, parseFloat(upi_amount) || 0, parseFloat(credit_amount) || 0,
                parseFloat(total_amount) || 0, remarks || null]
        );

        // Update daily report totals including waste/proof aggregation
        await pool.query(
            `UPDATE sarga_daily_report_machine SET
                total_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_cash = (SELECT COALESCE(SUM(cash_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_credit = (SELECT COALESCE(SUM(credit_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                waste_prints = (SELECT COALESCE(SUM(waste_copies), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                proof_prints = (SELECT COALESCE(SUM(proof_copies), 0) FROM sarga_machine_work_entries WHERE report_id = ?)
             WHERE id = ?`,
            [reportId, reportId, reportId, reportId, reportId, reportId]
        );

        const [entry] = await pool.query(
            'SELECT * FROM sarga_machine_work_entries WHERE id = ?',
            [result.insertId]
        );

        auditLog(req.user.id, 'MACHINE_WORK_ADD', `Work entry for machine #${id}: ${customer_name} - ${work_details} (${copies} copies)`, { entity_type: 'machine_work', entity_id: result.insertId });
        res.status(201).json(entry[0]);
    } catch (error) {
        console.error('Error adding work entry:', error);
        res.status(500).json({ error: 'Failed to add work entry' });
    }
});

// ==================== GET WORK ENTRIES FOR MACHINE ====================
router.get('/:id/work', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const { date, start_date, end_date } = req.query;

        let query = `
            SELECT mwe.*, drm.report_date
            FROM sarga_machine_work_entries mwe
            JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
            WHERE drm.machine_id = ?
        `;
        const params = [id];

        if (date) {
            query += ` AND drm.report_date = ?`;
            params.push(date);
        } else {
            if (start_date) { query += ` AND drm.report_date >= ?`; params.push(start_date); }
            if (end_date) { query += ` AND drm.report_date <= ?`; params.push(end_date); }
        }

        query += ` ORDER BY mwe.entry_time DESC`;

        const [entries] = await pool.query(query, params);
        res.json(entries);
    } catch (error) {
        console.error('Error fetching work entries:', error);
        res.status(500).json({ error: 'Failed to fetch work entries' });
    }
});

// ==================== DELETE WORK ENTRY ====================
router.delete('/:id/work/:entryId', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id, entryId } = req.params;

        const [entry] = await pool.query(
            `SELECT mwe.id, mwe.report_id FROM sarga_machine_work_entries mwe
             JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
             WHERE mwe.id = ? AND drm.machine_id = ?`,
            [entryId, id]
        );

        if (entry.length === 0) {
            return res.status(404).json({ error: 'Work entry not found' });
        }

        const reportId = entry[0].report_id;
        await pool.query('DELETE FROM sarga_machine_work_entries WHERE id = ?', [entryId]);

        // Update daily report totals
        await pool.query(
            `UPDATE sarga_daily_report_machine SET
                total_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_cash = (SELECT COALESCE(SUM(cash_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_credit = (SELECT COALESCE(SUM(credit_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?)
             WHERE id = ?`,
            [reportId, reportId, reportId, reportId]
        );

        auditLog(req.user.id, 'MACHINE_WORK_DELETE', `Deleted work entry #${entryId} from machine #${id}`, { entity_type: 'machine_work', entity_id: entryId });
        res.json({ message: 'Work entry deleted successfully' });
    } catch (error) {
        console.error('Error deleting work entry:', error);
        res.status(500).json({ error: 'Failed to delete work entry' });
    }
});

// ==================== PRODUCTION SUMMARY ====================
router.get('/:id/production-summary', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const { days = 30 } = req.query;

        const [summary] = await pool.query(
            `SELECT 
                mr.reading_date,
                mr.opening_count,
                mr.closing_count,
                GREATEST(0, COALESCE(mr.closing_count, 0) - mr.opening_count) as total_copies,
                COALESCE(mr.waste_prints, 0) as waste_prints,
                COALESCE(mr.proof_prints, 0) as proof_prints,
                GREATEST(0, COALESCE(mr.closing_count, 0) - mr.opening_count - COALESCE(mr.waste_prints, 0) - COALESCE(mr.proof_prints, 0)) as good_prints,
                COALESCE(drm.total_amount, 0) as day_revenue,
                COALESCE(drm.total_cash, 0) as day_cash,
                COALESCE(drm.total_credit, 0) as day_credit,
                (SELECT COUNT(*) FROM sarga_machine_work_entries WHERE report_id = drm.id) as work_count
             FROM sarga_machine_readings mr
             LEFT JOIN sarga_daily_report_machine drm ON drm.machine_id = mr.machine_id AND drm.report_date = mr.reading_date
             WHERE mr.machine_id = ?
             ORDER BY mr.reading_date DESC LIMIT ?`,
            [id, parseInt(days)]
        );

        const totals = summary.reduce((acc, row) => ({
            total_copies: acc.total_copies + (row.total_copies || 0),
            waste_prints: acc.waste_prints + (row.waste_prints || 0),
            proof_prints: acc.proof_prints + (row.proof_prints || 0),
            good_prints: acc.good_prints + (row.good_prints || 0),
            total_revenue: acc.total_revenue + parseFloat(row.day_revenue || 0),
            total_cash: acc.total_cash + parseFloat(row.day_cash || 0),
            total_credit: acc.total_credit + parseFloat(row.day_credit || 0),
            total_work_entries: acc.total_work_entries + (row.work_count || 0)
        }), { total_copies: 0, waste_prints: 0, proof_prints: 0, good_prints: 0, total_revenue: 0, total_cash: 0, total_credit: 0, total_work_entries: 0 });

        res.json({ daily: summary, totals });
    } catch (error) {
        console.error('Error fetching production summary:', error);
        res.status(500).json({ error: 'Failed to fetch production summary' });
    }
});

// ==================== REVIEW COUNT REQUEST (ADMIN APPROVE/REJECT) ====================
router.put('/count-requests/:reqId', auth.authenticate, auth.requireRole(['Admin', 'Accountant']), async (req, res) => {
    try {
        const { reqId } = req.params;
        const { status, admin_note } = req.body;

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be Approved or Rejected' });
        }

        const [rows] = await pool.query(
            'SELECT * FROM sarga_machine_count_requests WHERE id = ?', [reqId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Count request not found' });
        }

        await pool.query(
            `UPDATE sarga_machine_count_requests
             SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
             WHERE id = ?`,
            [status, admin_note || null, req.user.id, reqId]
        );

        // If Approved, update the actual reading with entered_count (already saved, no action needed)
        // If Rejected, revert the opening_count back to expected_count
        if (status === 'Rejected' && rows[0].expected_count !== null) {
            const { machine_id, reading_date, expected_count } = rows[0];
            const [existing] = await pool.query(
                'SELECT id, closing_count FROM sarga_machine_readings WHERE machine_id = ? AND reading_date = ?',
                [machine_id, reading_date]
            );
            if (existing.length > 0) {
                const ec = existing[0].closing_count;
                const totalCopies = ec !== null ? Math.max(0, ec - expected_count) : 0;
                await pool.query(
                    'UPDATE sarga_machine_readings SET opening_count = ?, updated_by = ? WHERE id = ?',
                    [expected_count, req.user.id, existing[0].id]
                );
            }
        }

        auditLog(req.user.id, 'MACHINE_COUNT_REVIEW', `${status} count request #${reqId}`, { entity_type: 'machine_count_request', entity_id: reqId });
        res.json({ success: true, status });
    } catch (error) {
        console.error('Error reviewing count request:', error);
        res.status(500).json({ error: 'Failed to review count request' });
    }
});

// ==================== MPR INTEGRATION ====================

// GET /machines/:id/mpr-meter-data — Fetch actual meter count from MPR web interface
router.get('/:id/mpr-meter-data', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get machine details (need IP address)
        const [machines] = await pool.query(
            'SELECT id, machine_name, ip_address, snmp_community, mpr_username, mpr_password FROM sarga_machines WHERE id = ?',
            [id]
        );
        
        if (machines.length === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }
        
        const machine = machines[0];
        if (!machine.ip_address) {
            return res.status(400).json({ error: 'Machine IP address not configured' });
        }
        
        // Import MPR service
        const mprService = require('../services/mprIntegration');
        
        // Fetch meter data with stored credentials
        const meterData = await mprService.fetchBizhubMeterCounts(
            machine.ip_address,
            6000,
            machine.snmp_community || 'public',
            machine.mpr_username || null,
            machine.mpr_password || null
        );
        
        // Store the fetch attempt for audit
        auditLog(req.user.id, 'MPR_DATA_FETCH', `Fetched meter data from ${machine.machine_name}`, { entity_type: 'machine', entity_id: id });
        
        res.json({
            machine_id: id,
            machine_name: machine.machine_name,
            ip_address: machine.ip_address,
            meter_data: meterData
        });
    } catch (error) {
        console.error('Error fetching MPR meter data:', error);
        res.status(500).json({ error: 'Failed to fetch meter data', details: error.message });
    }
});

// POST /machines/:id/verify-count — Compare manual entry with MPR meter data
router.post('/:id/verify-count', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const { manual_opening_count } = req.body;
        
        if (manual_opening_count === undefined) {
            return res.status(400).json({ error: 'manual_opening_count is required' });
        }
        
        // Get machine details
        const [machines] = await pool.query(
            'SELECT id, machine_name, ip_address, snmp_community, mpr_username, mpr_password FROM sarga_machines WHERE id = ?',
            [id]
        );
        
        if (machines.length === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }
        
        const machine = machines[0];
        if (!machine.ip_address) {
            return res.status(400).json({ error: 'Machine IP address not configured' });
        }
        
        // Get yesterday's closing count
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const [lastClosing] = await pool.query(
            'SELECT closing_count FROM sarga_machine_readings WHERE machine_id = ? AND reading_date = ?',
            [id, yesterdayStr]
        );
        
        const yesterdayClosingCount = lastClosing.length > 0 ? lastClosing[0].closing_count : null;
        
        // Fetch actual meter data from MPR with stored credentials
        const mprService = require('../services/mprIntegration');
        const meterData = await mprService.fetchBizhubMeterCounts(
            machine.ip_address,
            6000,
            machine.snmp_community || 'public',
            machine.mpr_username || null,
            machine.mpr_password || null
        );
        
        // Compare
        const comparison = mprService.compareCounterData(
            manual_opening_count,
            meterData,
            yesterdayClosingCount
        );
        
        // If there's a mismatch, create a count request for admin review
        if (comparison.has_mismatch && meterData.total_prints) {
            const [result] = await pool.query(
                `INSERT INTO sarga_machine_count_requests 
                 (machine_id, reading_date, expected_count, entered_count, submitted_by, status)
                 VALUES (?, ?, ?, ?, ?, 'Pending')`,
                [id, today, meterData.total_prints, manual_opening_count, req.user.id]
            );
            
            comparison.count_request_id = result.insertId;
            comparison.count_request_created = true;
            
            auditLog(req.user.id, 'MACHINE_COUNT_MISMATCH', 
                `Count mismatch for ${machine.machine_name}: Manual=${manual_opening_count}, Machine=${meterData.total_prints}`,
                { entity_type: 'machine_count_request', entity_id: result.insertId }
            );
        }
        
        res.json({
            machine_id: id,
            machine_name: machine.machine_name,
            verification_date: today,
            manual_entry: manual_opening_count,
            actual_meter_count: meterData.total_prints,
            comparison_result: comparison
        });
    } catch (error) {
        console.error('Error verifying count:', error);
        res.status(500).json({ error: 'Failed to verify count', details: error.message });
    }
});

// GET /machines/:id/meter-comparison — Get comparison history
router.get('/:id/meter-comparison', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 30 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Get count requests for this machine (mismatches)
        const [requests] = await pool.query(
            `SELECT mcr.*, mr.opening_count, mr.closing_count, GREATEST(0, COALESCE(mr.closing_count, 0) - mr.opening_count) as total_copies,
                    s.name as submitted_by_name, rev.name as reviewed_by_name
             FROM sarga_machine_count_requests mcr
             LEFT JOIN sarga_machine_readings mr ON mcr.machine_id = mr.machine_id AND mcr.reading_date = mr.reading_date
             LEFT JOIN sarga_staff s ON mcr.submitted_by = s.id
             LEFT JOIN sarga_staff rev ON mcr.reviewed_by = rev.id
             WHERE mcr.machine_id = ?
             ORDER BY mcr.reading_date DESC
             LIMIT ? OFFSET ?`,
            [id, parseInt(limit), offset]
        );
        
        // Get count for pagination
        const [[{ total }]] = await pool.query(
            'SELECT COUNT(*) as total FROM sarga_machine_count_requests WHERE machine_id = ?',
            [id]
        );
        
        res.json({
            machine_id: id,
            total_mismatches: total,
            page: parseInt(page),
            limit: parseInt(limit),
            comparisons: requests
        });
    } catch (error) {
        console.error('Error fetching meter comparison:', error);
        res.status(500).json({ error: 'Failed to fetch comparison history' });
    }
});

// ==================== LIVE COUNT ====================

// GET /machines/:id/live-count — Live count for a specific machine
router.get('/:id/live-count', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        // Check machine exists
        const [machines] = await pool.query(
            'SELECT m.*, b.name as branch_name FROM sarga_machines m LEFT JOIN sarga_branches b ON m.branch_id = b.id WHERE m.id = ?',
            [id]
        );
        if (machines.length === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }

        const machine = machines[0];

        // Non-admin/accountant: check assignment
        if (!['Admin', 'Accountant'].includes(user.role)) {
            const [assignment] = await pool.query(
                'SELECT id FROM sarga_machine_staff_assignments WHERE machine_id = ? AND staff_id = ?',
                [id, user.id]
            );
            if (assignment.length === 0) {
                return res.status(403).json({ error: 'You are not assigned to this machine' });
            }
        }

        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        // Fetch today's reading
        const [todayReading] = await pool.query(
            `SELECT * FROM sarga_machine_readings WHERE machine_id = ? AND reading_date = ?`,
            [id, today]
        );

        // Fetch latest reading if no today's reading
        let latestReading = todayReading.length > 0 ? todayReading[0] : null;
        if (!latestReading) {
            const [latest] = await pool.query(
                `SELECT * FROM sarga_machine_readings WHERE machine_id = ? ORDER BY reading_date DESC LIMIT 1`,
                [id]
            );
            latestReading = latest.length > 0 ? latest[0] : null;
        }

        // Fetch MPR meter data if IP is configured
        let meterData = null;
        if (machine.ip_address) {
            try {
                const mprService = require('../services/mprIntegration');
                meterData = await mprService.fetchBizhubMeterCounts(
                    machine.ip_address,
                    6000,
                    machine.snmp_community || 'public',
                    machine.mpr_username || null,
                    machine.mpr_password || null
                );
            } catch (mprErr) {
                console.warn(`[live-count] MPR fetch failed for machine #${id}:`, mprErr.message);
                // Fall back to stored meter value
                meterData = machine.last_meter_value
                    ? { total_prints: machine.last_meter_value, fetched_at: machine.last_polled_at, error: null }
                    : { total_prints: null, fetched_at: null, error: mprErr.message };
            }
        }

        const manual_entry = latestReading ? latestReading.opening_count : null;
        const meter_value = meterData && meterData.total_prints != null ? meterData.total_prints : null;
        const difference = manual_entry !== null && meter_value !== null ? manual_entry - meter_value : null;

        let last_sync_time = null;
        if (latestReading) {
            last_sync_time = latestReading.sync_timestamp || latestReading.created_at || latestReading.reading_date;
        }

        // Health status based on reading date recency
        let health_status = 'unknown';
        if (latestReading && latestReading.reading_date) {
            const readDate = new Date(latestReading.reading_date);
            const diffDays = Math.floor((now - readDate) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) health_status = 'healthy';
            else if (diffDays <= 2) health_status = 'warning';
            else health_status = 'critical';
        }

        // Timestamp correctness validation
        let timestamp_correctness = { valid: true, message: null };
        if (latestReading && latestReading.reading_date) {
            const readDate = new Date(latestReading.reading_date);
            if (readDate > now) {
                timestamp_correctness = { valid: false, message: 'Reading date is in the future' };
            } else if ((now - readDate) > 24 * 60 * 60 * 1000) {
                timestamp_correctness = { valid: false, message: 'Reading is more than 1 day old' };
            }
        }

        // Update machine poll info
        if (meter_value !== null && (!meterData || !meterData.error)) {
            await pool.query(
                'UPDATE sarga_machines SET last_polled_at = NOW(), last_meter_value = ?, health_status = ? WHERE id = ?',
                [meter_value, health_status, id]
            );
        } else {
            await pool.query(
                'UPDATE sarga_machines SET last_polled_at = NOW(), health_status = ? WHERE id = ?',
                [health_status, id]
            );
        }

        // Update reading sync info if we have a reading
        if (latestReading && meter_value != null) {
            await pool.query(
                'UPDATE sarga_machine_readings SET sync_source = ?, sync_timestamp = NOW() WHERE id = ?',
                [meterData && !meterData.error ? 'mpr' : 'manual', latestReading.id]
            );
        }

        res.json({
            machine_id: id,
            machine_name: machine.machine_name,
            machine_type: machine.machine_type,
            branch_id: machine.branch_id,
            branch_name: machine.branch_name,
            manual_entry,
            meter_data: meter_value,
            difference,
            last_sync_time,
            health_status,
            timestamp_correctness,
            reading_date: latestReading ? latestReading.reading_date : null,
            meter_data_raw: meterData
        });
    } catch (error) {
        console.error('Error fetching live count:', error);
        res.status(500).json({ error: 'Failed to fetch live count' });
    }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { auditLog } = require('../helpers');

// ==================== ASSIGN STAFF TO MACHINE (ADMIN ONLY) ====================
router.post('/:id/assign-staff', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
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
router.delete('/:id/unassign-staff/:staff_id', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
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
router.get('/:id/staff-assignments', auth.authenticate, auth.requireRole(['Admin']), async (req, res) => {
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
// Staff only see machines assigned to them; Admin sees all
router.get('/', auth.authenticate, async (req, res) => {
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
        } catch (e) { }

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

// ==================== GET SINGLE MACHINE (FULL DETAILS) ====================
router.get('/:id', auth.authenticate, async (req, res) => {
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
        const [readings] = await pool.query(
            `SELECT mr.*, s.name as created_by_name
             FROM sarga_machine_readings mr
             LEFT JOIN sarga_staff s ON mr.created_by = s.id
             WHERE mr.machine_id = ?
             ORDER BY mr.reading_date DESC LIMIT 30`,
            [id]
        );

        // Fetch today's reading
        const today = new Date().toISOString().split('T')[0];
        const [todayReading] = await pool.query(
            `SELECT * FROM sarga_machine_readings WHERE machine_id = ? AND reading_date = ?`,
            [id, today]
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
                mr.total_copies,
                COALESCE(SUM(mwe.total_amount), 0) as day_revenue,
                COALESCE(SUM(mwe.copies), 0) as work_copies,
                COUNT(mwe.id) as work_entries_count
             FROM sarga_machine_readings mr
             LEFT JOIN sarga_daily_report_machine drm ON drm.machine_id = mr.machine_id AND drm.report_date = mr.reading_date
             LEFT JOIN sarga_machine_work_entries mwe ON mwe.report_id = drm.id
             WHERE mr.machine_id = ?
             GROUP BY mr.reading_date, mr.opening_count, mr.closing_count, mr.total_copies
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

        res.json({
            ...machine,
            assigned_staff: assignedStaff,
            readings,
            today_reading: todayReading.length > 0 ? todayReading[0] : null,
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
        const { machine_name, machine_type, counter_type, branch_id, location } = req.body;

        if (!machine_name || !machine_type || !branch_id) {
            return res.status(400).json({ error: 'Machine name, type, and branch are required' });
        }

        const [result] = await pool.query(
            `INSERT INTO sarga_machines (machine_name, machine_type, counter_type, branch_id, location)
       VALUES (?, ?, ?, ?, ?)`,
            [machine_name, machine_type, counter_type || 'Manual', branch_id, location]
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
        const { machine_name, machine_type, counter_type, branch_id, location, is_active } = req.body;

        const [existing] = await pool.query('SELECT id FROM sarga_machines WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Machine not found' });
        }

        const updates = [];
        const params = [];

        if (machine_name !== undefined) { updates.push('machine_name = ?'); params.push(machine_name); }
        if (machine_type !== undefined) { updates.push('machine_type = ?'); params.push(machine_type); }
        if (counter_type !== undefined) { updates.push('counter_type = ?'); params.push(counter_type); }
        if (branch_id !== undefined) { updates.push('branch_id = ?'); params.push(branch_id); }
        if (location !== undefined) { updates.push('location = ?'); params.push(location); }
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
router.get('/:id/staff', auth.authenticate, async (req, res) => {
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
router.get('/:id/readings', auth.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { start_date, end_date, limit = 30 } = req.query;

        let query = `
      SELECT mr.*, s.name as created_by_name
      FROM sarga_machine_readings mr
      LEFT JOIN sarga_staff s ON mr.created_by = s.id
      WHERE mr.machine_id = ?
    `;
        const params = [id];

        if (start_date) {
            query += ` AND mr.reading_date >= ?`;
            params.push(start_date);
        }
        if (end_date) {
            query += ` AND mr.reading_date <= ?`;
            params.push(end_date);
        }

        query += ` ORDER BY mr.reading_date DESC LIMIT ?`;
        params.push(parseInt(limit));

        const [readings] = await pool.query(query, params);
        res.json(readings);
    } catch (error) {
        console.error('Error fetching machine readings:', error);
        res.status(500).json({ error: 'Failed to fetch machine readings' });
    }
});

// ==================== SAVE/UPDATE MACHINE READING (Opening Count) ====================
router.post('/:id/readings', auth.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { reading_date, opening_count, closing_count, notes } = req.body;
        const isAdmin = req.user.role === 'Admin';

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
                // Allow closing_count updates by staff
                const closeCount = closing_count !== undefined && closing_count !== null && closing_count !== ''
                    ? parseInt(closing_count) : null;
                const totalCopies = closeCount !== null ? Math.max(0, closeCount - existing[0].opening_count) : 0;
                await pool.query(
                    `UPDATE sarga_machine_readings SET closing_count = ?, total_copies = ?, updated_by = ? WHERE id = ?`,
                    [closeCount, totalCopies, req.user.id, existing[0].id]
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

        await pool.query(
            `INSERT INTO sarga_machine_readings (machine_id, reading_date, opening_count, closing_count, total_copies, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                opening_count = VALUES(opening_count),
                closing_count = VALUES(closing_count),
                total_copies = VALUES(total_copies),
                notes = VALUES(notes),
                updated_by = VALUES(created_by)`,
            [id, reading_date, openCount, closeCount, totalCopies, notes || null, req.user.id]
        );

        const [saved] = await pool.query(
            `SELECT mr.*, s.name as created_by_name
             FROM sarga_machine_readings mr
             LEFT JOIN sarga_staff s ON mr.created_by = s.id
             WHERE mr.machine_id = ? AND mr.reading_date = ?`,
            [id, reading_date]
        );

        auditLog(req.user.id, 'MACHINE_READING', `Machine #${id} reading for ${reading_date}: open=${openCount} close=${closeCount}`, { entity_type: 'machine_reading', entity_id: id });
        res.json(saved[0]);
    } catch (error) {
        console.error('Error saving machine reading:', error);
        res.status(500).json({ error: 'Failed to save machine reading' });
    }
});

// ==================== ADD WORK ENTRY TO MACHINE ====================
router.post('/:id/work', auth.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { customer_name, work_details, copies, payment_type, cash_amount, upi_amount, credit_amount, total_amount, remarks, work_date } = req.body;
        const user = req.user;
        const reportDate = work_date || new Date().toISOString().split('T')[0];

        if (!customer_name || !work_details || copies === undefined) {
            return res.status(400).json({ error: 'Customer name, work details, and copies are required' });
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
            const [machineInfo] = await pool.query('SELECT branch_id FROM sarga_machines WHERE id = ?', [id]);
            const branchId = machineInfo[0].branch_id;

            const [result] = await pool.query(
                `INSERT INTO sarga_daily_report_machine (report_date, machine_id, branch_id, created_by)
                 VALUES (?, ?, ?, ?)`,
                [reportDate, id, branchId, user.id]
            );
            reportId = result.insertId;
        }

        // Insert work entry
        const [result] = await pool.query(
            `INSERT INTO sarga_machine_work_entries 
             (report_id, customer_name, work_details, copies, payment_type, cash_amount, upi_amount, credit_amount, total_amount, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [reportId, customer_name, work_details, parseInt(copies) || 0, payment_type || 'Cash',
                parseFloat(cash_amount) || 0, parseFloat(upi_amount) || 0, parseFloat(credit_amount) || 0,
                parseFloat(total_amount) || 0, remarks || null]
        );

        // Update daily report totals
        await pool.query(
            `UPDATE sarga_daily_report_machine SET
                total_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_cash = (SELECT COALESCE(SUM(cash_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_credit = (SELECT COALESCE(SUM(credit_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?)
             WHERE id = ?`,
            [reportId, reportId, reportId, reportId]
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
router.get('/:id/work', auth.authenticate, async (req, res) => {
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
router.delete('/:id/work/:entryId', auth.authenticate, async (req, res) => {
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
router.get('/:id/production-summary', auth.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { days = 30 } = req.query;

        const [summary] = await pool.query(
            `SELECT 
                mr.reading_date,
                mr.opening_count,
                mr.closing_count,
                mr.total_copies,
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
            total_revenue: acc.total_revenue + parseFloat(row.day_revenue || 0),
            total_cash: acc.total_cash + parseFloat(row.day_cash || 0),
            total_credit: acc.total_credit + parseFloat(row.day_credit || 0),
            total_work_entries: acc.total_work_entries + (row.work_count || 0)
        }), { total_copies: 0, total_revenue: 0, total_cash: 0, total_credit: 0, total_work_entries: 0 });

        res.json({ daily: summary, totals });
    } catch (error) {
        console.error('Error fetching production summary:', error);
        res.status(500).json({ error: 'Failed to fetch production summary' });
    }
});

module.exports = router;


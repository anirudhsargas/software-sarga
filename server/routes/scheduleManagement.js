const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { auditLog } = require('../helpers');

// ===== SCHEDULE MANAGEMENT =====

// GET /schedules - List all schedules (optionally filter by staff_id)
router.get('/', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const { staff_id, active_only } = req.query;
        let sql = `
            SELECT s.*, st.name AS staff_name, st.role AS staff_role,
                   cr.name AS created_by_name
            FROM sarga_staff_schedules s
            JOIN sarga_staff st ON s.staff_id = st.id
            LEFT JOIN sarga_staff cr ON s.created_by = cr.id
        `;
        const params = [];
        const conditions = [];

        if (staff_id) {
            conditions.push('s.staff_id = ?');
            params.push(staff_id);
        }
        if (active_only === 'true') {
            conditions.push('s.is_active = 1');
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY s.staff_id, s.effective_from DESC';

        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('Get schedules error:', err);
        res.status(500).json({ message: 'Failed to fetch schedules' });
    }
});

// GET /schedules/staff/:id - Get active schedule for a specific staff member
router.get('/staff/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    // Staff can view own schedule, admins can view any
    if (String(req.user.id) !== String(id) && !['Admin', 'Accountant', 'Front Office'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const [rows] = await pool.query(`
            SELECT * FROM sarga_staff_schedules
            WHERE staff_id = ? AND is_active = 1
            AND effective_from <= CURDATE()
            AND (effective_to IS NULL OR effective_to >= CURDATE())
            ORDER BY effective_from DESC LIMIT 1
        `, [id]);
        res.json(rows[0] || null);
    } catch (err) {
        console.error('Get staff schedule error:', err);
        res.status(500).json({ message: 'Failed to fetch schedule' });
    }
});

// GET /schedules/staff/:id/all - Get all schedules (history) for a staff member
router.get('/staff/:id/all', authenticateToken, async (req, res) => {
    const { id } = req.params;
    if (String(req.user.id) !== String(id) && !['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const [rows] = await pool.query(`
            SELECT s.*, cr.name AS created_by_name
            FROM sarga_staff_schedules s
            LEFT JOIN sarga_staff cr ON s.created_by = cr.id
            WHERE s.staff_id = ?
            ORDER BY s.effective_from DESC
        `, [id]);
        res.json(rows);
    } catch (err) {
        console.error('Get staff schedules error:', err);
        res.status(500).json({ message: 'Failed to fetch schedules' });
    }
});

// POST /schedules - Create a new schedule
router.post('/', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant can create schedules' });
    }
    const { staff_id, schedule_name, shift_start, shift_end, break_minutes, working_days, effective_from, effective_to } = req.body;
    if (!staff_id || !shift_start || !shift_end || !effective_from) {
        return res.status(400).json({ message: 'Staff, shift start/end, and effective date are required' });
    }
    try {
        // Deactivate any existing overlapping active schedule
        await pool.query(`
            UPDATE sarga_staff_schedules SET is_active = 0
            WHERE staff_id = ? AND is_active = 1
            AND (effective_to IS NULL OR effective_to >= ?)
        `, [staff_id, effective_from]);

        const [result] = await pool.query(`
            INSERT INTO sarga_staff_schedules
            (staff_id, schedule_name, shift_start, shift_end, break_minutes, working_days, effective_from, effective_to, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            staff_id,
            schedule_name || 'General Shift',
            shift_start,
            shift_end,
            break_minutes || 60,
            working_days || '1,2,3,4,5,6',
            effective_from,
            effective_to || null,
            req.user.id
        ]);

        auditLog(req.user.id, 'SCHEDULE_CREATE', `Created schedule for staff ${staff_id}: ${schedule_name || 'General Shift'} (${shift_start}-${shift_end})`);
        res.json({ message: 'Schedule created successfully', id: result.insertId });
    } catch (err) {
        console.error('Create schedule error:', err);
        res.status(500).json({ message: 'Failed to create schedule' });
    }
});

// PUT /schedules/:id - Update schedule
router.put('/:id', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant can update schedules' });
    }
    const { id } = req.params;
    const { schedule_name, shift_start, shift_end, break_minutes, working_days, effective_from, effective_to, is_active } = req.body;
    try {
        await pool.query(`
            UPDATE sarga_staff_schedules SET
            schedule_name = COALESCE(?, schedule_name),
            shift_start = COALESCE(?, shift_start),
            shift_end = COALESCE(?, shift_end),
            break_minutes = COALESCE(?, break_minutes),
            working_days = COALESCE(?, working_days),
            effective_from = COALESCE(?, effective_from),
            effective_to = ?,
            is_active = COALESCE(?, is_active)
            WHERE id = ?
        `, [schedule_name, shift_start, shift_end, break_minutes, working_days, effective_from, effective_to, is_active, id]);

        auditLog(req.user.id, 'SCHEDULE_UPDATE', `Updated schedule #${id}`);
        res.json({ message: 'Schedule updated successfully' });
    } catch (err) {
        console.error('Update schedule error:', err);
        res.status(500).json({ message: 'Failed to update schedule' });
    }
});

// DELETE /schedules/:id - Delete schedule
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only Admin can delete schedules' });
    }
    try {
        await pool.query('DELETE FROM sarga_staff_schedules WHERE id = ?', [req.params.id]);
        auditLog(req.user.id, 'SCHEDULE_DELETE', `Deleted schedule #${req.params.id}`);
        res.json({ message: 'Schedule deleted' });
    } catch (err) {
        console.error('Delete schedule error:', err);
        res.status(500).json({ message: 'Failed to delete schedule' });
    }
});

// ===== LATE TIME TRACKING =====

// GET /latetime - List late time records (filter by date range, staff)
router.get('/latetime', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant', 'Front Office'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const { staff_id, year_month, from_date, to_date } = req.query;
        let sql = `
            SELECT l.*, st.name AS staff_name, st.role AS staff_role
            FROM sarga_staff_latetime l
            JOIN sarga_staff st ON l.staff_id = st.id
        `;
        const params = [];
        const conditions = [];

        if (staff_id) {
            conditions.push('l.staff_id = ?');
            params.push(staff_id);
        }
        if (year_month) {
            conditions.push("DATE_FORMAT(l.attendance_date, '%Y-%m') = ?");
            params.push(year_month);
        }
        if (from_date) {
            conditions.push('l.attendance_date >= ?');
            params.push(from_date);
        }
        if (to_date) {
            conditions.push('l.attendance_date <= ?');
            params.push(to_date);
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY l.attendance_date DESC, l.late_minutes DESC';

        const [rows] = await pool.query(sql, params);

        // Also compute summary
        const totalLateMinutes = rows.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
        const excusedCount = rows.filter(r => r.excused).length;
        const unexcusedCount = rows.filter(r => !r.excused).length;

        res.json({
            records: rows,
            summary: {
                totalRecords: rows.length,
                totalLateMinutes,
                avgLateMinutes: rows.length ? Math.round(totalLateMinutes / rows.length) : 0,
                excusedCount,
                unexcusedCount
            }
        });
    } catch (err) {
        console.error('Get latetime error:', err);
        res.status(500).json({ message: 'Failed to fetch late time records' });
    }
});

// GET /latetime/staff/:id/:year_month - Staff-specific monthly late records
router.get('/latetime/staff/:id/:year_month', authenticateToken, async (req, res) => {
    const { id, year_month } = req.params;
    if (String(req.user.id) !== String(id) && !['Admin', 'Accountant', 'Front Office'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const [rows] = await pool.query(`
            SELECT * FROM sarga_staff_latetime
            WHERE staff_id = ? AND DATE_FORMAT(attendance_date, '%Y-%m') = ?
            ORDER BY attendance_date DESC
        `, [id, year_month]);

        const totalLateMinutes = rows.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
        res.json({
            records: rows,
            summary: {
                totalRecords: rows.length,
                totalLateMinutes,
                avgLateMinutes: rows.length ? Math.round(totalLateMinutes / rows.length) : 0,
                excusedCount: rows.filter(r => r.excused).length,
                unexcusedCount: rows.filter(r => !r.excused).length
            }
        });
    } catch (err) {
        console.error('Get staff latetime error:', err);
        res.status(500).json({ message: 'Failed to fetch late time records' });
    }
});

// PUT /latetime/:id/excuse - Excuse a late record  
router.put('/latetime/:id/excuse', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant can excuse late records' });
    }
    const { excused, reason } = req.body;
    try {
        await pool.query(
            'UPDATE sarga_staff_latetime SET excused = ?, reason = COALESCE(?, reason) WHERE id = ?',
            [excused ? 1 : 0, reason, req.params.id]
        );
        auditLog(req.user.id, 'LATETIME_EXCUSE', `${excused ? 'Excused' : 'Unexcused'} late record #${req.params.id}`);
        res.json({ message: excused ? 'Late arrival excused' : 'Excuse removed' });
    } catch (err) {
        console.error('Excuse latetime error:', err);
        res.status(500).json({ message: 'Failed to update late record' });
    }
});

// ===== OVERTIME TRACKING =====

// GET /overtime - List overtime records
router.get('/overtime', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant', 'Front Office'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const { staff_id, year_month, approved, from_date, to_date } = req.query;
        let sql = `
            SELECT o.*, st.name AS staff_name, st.role AS staff_role,
                   ab.name AS approved_by_name
            FROM sarga_staff_overtime o
            JOIN sarga_staff st ON o.staff_id = st.id
            LEFT JOIN sarga_staff ab ON o.approved_by = ab.id
        `;
        const params = [];
        const conditions = [];

        if (staff_id) {
            conditions.push('o.staff_id = ?');
            params.push(staff_id);
        }
        if (year_month) {
            conditions.push("DATE_FORMAT(o.overtime_date, '%Y-%m') = ?");
            params.push(year_month);
        }
        if (approved !== undefined) {
            conditions.push('o.approved = ?');
            params.push(approved === 'true' ? 1 : 0);
        }
        if (from_date) {
            conditions.push('o.overtime_date >= ?');
            params.push(from_date);
        }
        if (to_date) {
            conditions.push('o.overtime_date <= ?');
            params.push(to_date);
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY o.overtime_date DESC';

        const [rows] = await pool.query(sql, params);

        const totalOTMinutes = rows.reduce((sum, r) => sum + (r.overtime_minutes || 0), 0);
        const approvedMinutes = rows.filter(r => r.approved).reduce((sum, r) => sum + (r.overtime_minutes || 0), 0);

        res.json({
            records: rows,
            summary: {
                totalRecords: rows.length,
                totalOTMinutes,
                totalOTHours: parseFloat((totalOTMinutes / 60).toFixed(1)),
                approvedMinutes,
                approvedHours: parseFloat((approvedMinutes / 60).toFixed(1)),
                pendingCount: rows.filter(r => !r.approved).length,
                approvedCount: rows.filter(r => r.approved).length
            }
        });
    } catch (err) {
        console.error('Get overtime error:', err);
        res.status(500).json({ message: 'Failed to fetch overtime records' });
    }
});

// GET /overtime/staff/:id/:year_month - Staff monthly overtime
router.get('/overtime/staff/:id/:year_month', authenticateToken, async (req, res) => {
    const { id, year_month } = req.params;
    if (String(req.user.id) !== String(id) && !['Admin', 'Accountant', 'Front Office'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const [rows] = await pool.query(`
            SELECT * FROM sarga_staff_overtime
            WHERE staff_id = ? AND DATE_FORMAT(overtime_date, '%Y-%m') = ?
            ORDER BY overtime_date DESC
        `, [id, year_month]);

        const totalOTMinutes = rows.reduce((sum, r) => sum + (r.overtime_minutes || 0), 0);
        const approvedMinutes = rows.filter(r => r.approved).reduce((sum, r) => sum + (r.overtime_minutes || 0), 0);

        res.json({
            records: rows,
            summary: {
                totalRecords: rows.length,
                totalOTMinutes,
                totalOTHours: parseFloat((totalOTMinutes / 60).toFixed(1)),
                approvedMinutes,
                approvedHours: parseFloat((approvedMinutes / 60).toFixed(1)),
                pendingCount: rows.filter(r => !r.approved).length,
                approvedCount: rows.filter(r => r.approved).length
            }
        });
    } catch (err) {
        console.error('Get staff overtime error:', err);
        res.status(500).json({ message: 'Failed to fetch overtime records' });
    }
});

// POST /overtime - Manual overtime entry
router.post('/overtime', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant can record overtime' });
    }
    const { staff_id, overtime_date, scheduled_end, actual_end, overtime_minutes, overtime_type, notes } = req.body;
    if (!staff_id || !overtime_date || !overtime_minutes) {
        return res.status(400).json({ message: 'Staff, date, and overtime minutes required' });
    }
    try {
        await pool.query(`
            INSERT INTO sarga_staff_overtime
            (staff_id, overtime_date, scheduled_end, actual_end, overtime_minutes, overtime_type, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            scheduled_end = COALESCE(VALUES(scheduled_end), scheduled_end),
            actual_end = COALESCE(VALUES(actual_end), actual_end),
            overtime_minutes = VALUES(overtime_minutes),
            overtime_type = COALESCE(VALUES(overtime_type), overtime_type),
            notes = COALESCE(VALUES(notes), notes)
        `, [staff_id, overtime_date, scheduled_end || '18:00:00', actual_end || null, overtime_minutes, overtime_type || 'Weekday', notes]);

        auditLog(req.user.id, 'OVERTIME_RECORD', `Recorded ${overtime_minutes}min overtime for staff ${staff_id} on ${overtime_date}`);
        res.json({ message: 'Overtime recorded successfully' });
    } catch (err) {
        console.error('Record overtime error:', err);
        res.status(500).json({ message: 'Failed to record overtime' });
    }
});

// PUT /overtime/:id/approve - Approve/reject overtime
router.put('/overtime/:id/approve', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant can approve overtime' });
    }
    const { approved } = req.body;
    try {
        await pool.query(
            'UPDATE sarga_staff_overtime SET approved = ?, approved_by = ? WHERE id = ?',
            [approved ? 1 : 0, req.user.id, req.params.id]
        );
        auditLog(req.user.id, 'OVERTIME_APPROVE', `${approved ? 'Approved' : 'Rejected'} overtime #${req.params.id}`);
        res.json({ message: approved ? 'Overtime approved' : 'Overtime approval removed' });
    } catch (err) {
        console.error('Approve overtime error:', err);
        res.status(500).json({ message: 'Failed to update overtime' });
    }
});

// ===== AUTO-CALCULATE LATE/OVERTIME FROM ATTENDANCE =====
// This helper is called when attendance is marked with in_time/out_time

async function autoRecordLateAndOvertime(staffId, attendanceDate, inTime, outTime) {
    try {
        // Get active schedule for this staff
        const [schedules] = await pool.query(`
            SELECT * FROM sarga_staff_schedules
            WHERE staff_id = ? AND is_active = 1
            AND effective_from <= ?
            AND (effective_to IS NULL OR effective_to >= ?)
            ORDER BY effective_from DESC LIMIT 1
        `, [staffId, attendanceDate, attendanceDate]);

        if (schedules.length === 0) return; // No schedule assigned

        const schedule = schedules[0];

        // Check if this day is a working day
        const dayOfWeek = new Date(attendanceDate).getDay(); // 0=Sun, 1=Mon...
        const workingDays = schedule.working_days.split(',').map(Number);
        if (!workingDays.includes(dayOfWeek)) return; // Not a working day

        // Calculate late time
        if (inTime) {
            const [scheduledH, scheduledM] = schedule.shift_start.split(':').map(Number);
            const [actualH, actualM] = inTime.split(':').map(Number);
            const scheduledMinutes = scheduledH * 60 + scheduledM;
            const actualMinutes = actualH * 60 + actualM;
            const lateMinutes = actualMinutes - scheduledMinutes;

            if (lateMinutes > 5) { // 5-min grace period
                await pool.query(`
                    INSERT INTO sarga_staff_latetime
                    (staff_id, attendance_date, scheduled_start, actual_start, late_minutes)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    scheduled_start = VALUES(scheduled_start),
                    actual_start = VALUES(actual_start),
                    late_minutes = VALUES(late_minutes)
                `, [staffId, attendanceDate, schedule.shift_start, inTime, lateMinutes]);
            } else {
                // Not late - remove any existing late record
                await pool.query(
                    'DELETE FROM sarga_staff_latetime WHERE staff_id = ? AND attendance_date = ?',
                    [staffId, attendanceDate]
                );
            }
        }

        // Calculate overtime
        if (outTime) {
            const [scheduledH, scheduledM] = schedule.shift_end.split(':').map(Number);
            const [actualH, actualM] = outTime.split(':').map(Number);
            const scheduledMinutes = scheduledH * 60 + scheduledM;
            const actualMinutes = actualH * 60 + actualM;
            const overtimeMinutes = actualMinutes - scheduledMinutes;

            if (overtimeMinutes > 15) { // 15-min threshold for overtime
                const date = new Date(attendanceDate);
                const isSunday = date.getDay() === 0;
                const overtimeType = isSunday ? 'Weekend' : 'Weekday';

                await pool.query(`
                    INSERT INTO sarga_staff_overtime
                    (staff_id, overtime_date, scheduled_end, actual_end, overtime_minutes, overtime_type)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    scheduled_end = VALUES(scheduled_end),
                    actual_end = VALUES(actual_end),
                    overtime_minutes = VALUES(overtime_minutes),
                    overtime_type = VALUES(overtime_type)
                `, [staffId, attendanceDate, schedule.shift_end, outTime, overtimeMinutes, overtimeType]);
            } else {
                // No meaningful overtime
                await pool.query(
                    'DELETE FROM sarga_staff_overtime WHERE staff_id = ? AND overtime_date = ?',
                    [staffId, attendanceDate]
                );
            }
        }
    } catch (err) {
        console.error('Auto late/overtime calculation error:', err);
        // Non-fatal - don't break attendance marking
    }
}

module.exports = router;
module.exports.autoRecordLateAndOvertime = autoRecordLateAndOvertime;

const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, attendanceSchema } = require('../middleware/validate');

// ========== STAFF DASHBOARD ENDPOINTS ==========

// Get staff work history (jobs assigned to them)
router.get('/:id/work-history', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Get jobs from assignments
        const [jobs] = await pool.query(`
            SELECT 
                j.id,
                j.job_number,
                j.job_name,
                j.quantity,
                j.unit_price,
                j.total_amount,
                j.status,
                j.payment_status,
                j.delivery_date,
                j.created_at,
                c.name as customer_name,
                c.mobile as customer_mobile,
                jsa.\`role\` as assignment_role,
                jsa.assigned_date,
                jsa.completed_date,
                jsa.status as assignment_status
            FROM sarga_job_staff_assignments jsa
            INNER JOIN sarga_jobs j ON j.id = jsa.job_id
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            WHERE jsa.staff_id = ?
            ORDER BY j.created_at DESC
        `, [id]);

        res.json(jobs);
    } catch (err) {
        console.error('Work history error:', err);
        // Return empty array instead of error to handle tables that don't exist yet
        res.json([]);
    }
});

// Get staff salary information
router.get('/:id/salary-info', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // M-14: Prevent cross-user salary data access
        if (String(req.user.id) !== String(id) && !['Admin', 'Accountant'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied. You can only view your own salary info.' });
        }

        console.log('Fetching salary info for staff ID:', id);

        // Get staff details and salary settings
        const [staff] = await pool.query(`
            SELECT id, name, role, user_id, salary_type, base_salary, daily_rate
            FROM sarga_staff WHERE id = ?
        `, [id]);

        console.log('Staff query result:', staff);

        if (staff.length === 0) {
            return res.status(404).json({ message: 'Staff not found' });
        }

        // Get salary records
        const [salaryRecords] = await pool.query(`
            SELECT 
                id,
                base_salary,
                net_salary,
                payment_month,
                bonus,
                deduction,
                paid_date,
                payment_method,
                reference_number,
                notes,
                status,
                created_at
            FROM sarga_staff_salary
            WHERE staff_id = ?
            ORDER BY payment_month DESC
            LIMIT 12
        `, [id]);

        // Calculate current month salary
        const now = new Date();
        const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const [currentSalary] = await pool.query(`
            SELECT * FROM sarga_staff_salary
            WHERE staff_id = ? AND payment_month = ?
        `, [id, currentMonth.toISOString().split('T')[0]]);

        // Recent salary payment transactions
        const [payments] = await pool.query(`
            SELECT id, payment_date, payment_amount, payment_method, reference_number, notes, created_by
            FROM sarga_staff_salary_payments
            WHERE staff_id = ?
            ORDER BY payment_date DESC
            LIMIT 20
        `, [id]);

        res.json({
            staff: staff[0],
            salaryRecords,
            currentMonthSalary: currentSalary.length > 0 ? currentSalary[0] : null,
            totalWorkDays: 26, // Standard working days
            recentPayments: payments
        });
    } catch (err) {
        console.error('Salary info error:', err);
        res.status(500).json({ message: 'Failed to fetch salary information' });
    }
});

// Pay salary
router.post('/:id/pay-salary', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const { base_salary, bonus, deduction, payment_month, payment_method, reference_number, notes, payment_amount, payment_date } = req.body;

        const net_salary = base_salary + (bonus || 0) - (deduction || 0);
        const paid_date = new Date();
        const paidAmount = Number(payment_amount || 0);
        const effectiveDate = payment_date ? new Date(payment_date) : paid_date;

        // Check if salary record exists for this month
        const [existing] = await pool.query(`
            SELECT id FROM sarga_staff_salary 
            WHERE staff_id = ? AND payment_month = ?
        `, [id, payment_month]);

        let result;
        if (existing.length > 0) {
            // Update existing
            const [sumRows] = await pool.query(`
                SELECT COALESCE(SUM(payment_amount), 0) AS paid_total
                FROM sarga_staff_salary_payments
                WHERE staff_id = ? AND payment_date >= ? AND payment_date < DATE_ADD(?, INTERVAL 1 MONTH)
            `, [id, payment_month, payment_month]);

            const paidTotal = Number(sumRows[0]?.paid_total || 0) + paidAmount;
            const status = paidTotal >= net_salary ? 'Paid' : 'Partial';

            result = await pool.query(`
                UPDATE sarga_staff_salary 
                SET net_salary = ?, bonus = ?, deduction = ?, 
                    paid_date = ?, payment_method = ?, reference_number = ?, 
                    notes = ?, status = ?
                WHERE id = ?
            `, [net_salary, bonus || 0, deduction || 0, paid_date, payment_method, reference_number, notes, status, existing[0].id]);
        } else {
            // Create new
            const status = paidAmount >= net_salary ? 'Paid' : 'Partial';
            result = await pool.query(`
                INSERT INTO sarga_staff_salary 
                (staff_id, base_salary, net_salary, payment_month, bonus, deduction, 
                 paid_date, payment_method, reference_number, notes, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, base_salary, net_salary, payment_month, bonus || 0, deduction || 0, paid_date, payment_method, reference_number, notes, status]);
        }

        // Fetch staff info for payment record
        const [[staff]] = await pool.query('SELECT name, branch_id FROM sarga_staff WHERE id = ?', [id]);
        if (!staff) return res.status(404).json({ message: 'Staff not found' });

        if (paidAmount > 0) {
            // Record in staff specific table
            await pool.query(`
                INSERT INTO sarga_staff_salary_payments
                (staff_id, payment_date, payment_amount, payment_method, reference_number, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [id, effectiveDate, paidAmount, payment_method, reference_number, notes, req.user.id]);

            // record in global payments table for Daily Report
            await pool.query(`
                INSERT INTO sarga_payments 
                (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, staff_id) 
                VALUES (?, 'Salary', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                staff.branch_id,
                staff.name,
                paidAmount,
                payment_method,
                payment_method === 'UPI' ? 0 : paidAmount,
                payment_method === 'UPI' ? paidAmount : 0,
                reference_number,
                `Salary payment for ${payment_month} ${notes ? '- ' + notes : ''}`,
                effectiveDate,
                id
            ]);
        }

        auditLog(req.user.id, 'SALARY_PAYMENT', `Paid salary to staff ${id} for ${payment_month}`);
        res.json({ message: 'Salary payment recorded successfully', salaryId: result[0].insertId || existing[0].id });
    } catch (err) {
        console.error('Salary payment error:', err);
        res.status(500).json({ message: 'Failed to record salary payment' });
    }
});

// Record Attendance for Staff
// Regular attendance marking: Present, Absent, Half Day only
router.post('/:id/attendance', authenticateToken, validate(attendanceSchema), async (req, res) => {
    const { id } = req.params;
    const { attendance_date, status, notes } = req.body;

    // Authorization
    const allowedRoles = ["Admin", "Accountant", "Front Office", "front office"];
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant/Front Office can record attendance' });
    }

    if (!attendance_date || !status) {
        return res.status(400).json({ message: 'Attendance date and status required' });
    }

    const validStatus = ['Present', 'Absent', 'Half Day'];
    if (!validStatus.includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Only Present, Absent, Half Day allowed.' });
    }

    try {
        // If Sunday, only Admin can override to Present
        const date = new Date(attendance_date);
        const isSunday = date.getDay() === 0;
        if (isSunday && status === 'Present' && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Only Admin can mark Present on Sunday.' });
        }

        // Check if attendance already exists for this staff and date
        const [existing] = await pool.query(
            'SELECT id FROM sarga_staff_attendance WHERE staff_id = ? AND attendance_date = ?',
            [id, attendance_date]
        );

        if (existing.length > 0 && req.user.role !== 'Admin') {
            // Non-admins cannot update existing attendance
            return res.status(403).json({ message: 'Attendance already marked for this date. Only Admin can update. Please send a change request to Admin.' });
        }

        // Insert or update attendance (only Admin can update)
        await pool.query(`
            INSERT INTO sarga_staff_attendance 
            (staff_id, attendance_date, status, notes, created_by)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            status = VALUES(status), 
            notes = VALUES(notes)
        `, [id, attendance_date, status, notes, req.user.id]);

        auditLog(req.user.id, 'ATTENDANCE_RECORD', `Recorded attendance for staff ${id} on ${attendance_date}: ${status}`);
        res.json({ message: 'Attendance recorded successfully' });
    } catch (err) {
        console.error('Attendance error:', err);
        res.status(500).json({ message: 'Failed to record attendance' });
    }
});

// Admin/Accountant: Mark a date as Holiday for all or selected staff
router.post('/mark-holiday', authenticateToken, async (req, res) => {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant can mark holidays.' });
    }
    const { date, staffIds, reason } = req.body;
    if (!date || !reason) {
        return res.status(400).json({ message: 'Date and reason required.' });
    }
    try {
        // If staffIds provided, mark holiday for those staff, else for all
        let staffList = staffIds;
        if (!Array.isArray(staffList) || staffList.length === 0) {
            // Get all staff
            const [rows] = await pool.query('SELECT id FROM sarga_staff');
            staffList = rows.map(r => r.id);
        }
        for (const staffId of staffList) {
            await pool.query(
                'INSERT INTO sarga_staff_attendance (staff_id, attendance_date, status, notes, created_by) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes)',
                [staffId, date, 'Holiday', reason, req.user.id]
            );
        }
        auditLog(req.user.id, 'HOLIDAY_MARK', `Marked holiday on ${date} for staff: ${staffList.join(', ')}. Reason: ${reason}`);
        res.json({ message: 'Holiday marked successfully.' });
    } catch (err) {
        console.error('Holiday marking error:', err);
        res.status(500).json({ message: 'Failed to mark holiday.' });
    }
});

// Request Attendance Change (Non-Admin)
router.post('/:id/attendance-change-request', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { attendance_date, requested_status, requested_time, requested_notes, requested_by } = req.body;

    // Only Front Office/Accountant can request for themselves or others
    const allowedRoles = ["Admin", "Accountant", "Front Office", "front office"];
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant/Front Office can request attendance change' });
    }

    if (!attendance_date || !requested_status) {
        return res.status(400).json({ message: 'Attendance date and requested status are required' });
    }

    try {
        await pool.query(`
            INSERT INTO sarga_attendance_requests 
            (staff_id, attendance_date, requested_status, requested_time, requested_notes, requested_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, attendance_date, requested_status, requested_time || null, requested_notes || null, requested_by]);

        auditLog(req.user.id, 'ATTENDANCE_CHANGE_REQUEST', `Requested attendance change for staff ${id} on ${attendance_date} to ${requested_status}`);
        res.json({ message: 'Attendance change request submitted successfully' });
    } catch (err) {
        console.error('Attendance change request error:', err);
        res.status(500).json({ message: 'Failed to submit attendance change request' });
    }
});

// Get Monthly Attendance for Staff
router.get('/:id/attendance/:year_month', authenticateToken, async (req, res) => {
    const { id, year_month } = req.params;

    try {
        // Validate year_month format (YYYY-MM)
        if (!/^\d{4}-\d{2}$/.test(year_month)) {
            return res.status(400).json({ message: 'Invalid year-month format. Use YYYY-MM' });
        }

        const [rows] = await pool.query(`
            SELECT * FROM sarga_staff_attendance
            WHERE staff_id = ?
            AND DATE_FORMAT(attendance_date, '%Y-%m') = ?
                ORDER BY attendance_date ASC
            `, [id, year_month]);

        // Calculate summary
        const present = rows.filter(r => r.status === 'Present').length;
        const absent = rows.filter(r => r.status === 'Absent').length;
        const leave = rows.filter(r => r.status === 'Leave').length;
        const holiday = rows.filter(r => r.status === 'Holiday').length;
        const workingDays = present + absent + leave;

        res.json({
            attendance: rows,
            summary: {
                present,
                absent,
                leave,
                holiday,
                workingDays,
                totalDays: rows.length
            }
        });
    } catch (err) {
        console.error('Get attendance error:', err);
        res.status(500).json({ message: 'Failed to fetch attendance' });
    }
});

// Record Leaves (bulk for month)
router.post('/:id/leaves', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { year_month, paid_leaves, unpaid_leaves, notes } = req.body;

    // Authorization
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only Admin/Accountant can record leaves' });
    }

    if (!year_month || paid_leaves === undefined || unpaid_leaves === undefined) {
        return res.status(400).json({ message: 'Year-month and leave counts required' });
    }

    try {
        // Update or insert leave balance
        await pool.query(`
            INSERT INTO sarga_staff_leave_balance
            (staff_id, \`year_month\`, paid_leaves_used, unpaid_leaves_used, noted)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            paid_leaves_used = ?, 
            unpaid_leaves_used = ?,
            noted = ?
        `, [id, year_month, paid_leaves, unpaid_leaves, notes, paid_leaves, unpaid_leaves, notes]);

        auditLog(req.user.id, 'LEAVE_RECORD', `Recorded leaves for staff ${id}: ${paid_leaves} paid, ${unpaid_leaves} unpaid`);
        res.json({ message: 'Leave balance updated successfully' });
    } catch (err) {
        console.error('Leave record error:', err);
        res.status(500).json({ message: 'Failed to record leaves' });
    }
});

// Calculate Salary with Attendance and Leaves
router.get('/:id/salary-calculation/:year_month', authenticateToken, async (req, res) => {
    const { id, year_month } = req.params;

    // M-14: Prevent cross-user salary data access
    if (String(req.user.id) !== String(id) && !['Admin', 'Accountant'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied. You can only view your own salary info.' });
    }

    try {
        // Get staff info
        const [staffRows] = await pool.query(
            `SELECT salary_type, base_salary, daily_rate FROM sarga_staff WHERE id = ?`,
            [id]
        );

        if (staffRows.length === 0) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        const staff = staffRows[0];

        // Get attendance for the month
        const [attendance] = await pool.query(`
            SELECT * FROM sarga_staff_attendance
            WHERE staff_id = ? 
            AND DATE_FORMAT(attendance_date, '%Y-%m') = ?
        `, [id, year_month]);

        // Get leave balance
        const [leaveBalance] = await pool.query(`
            SELECT * FROM sarga_staff_leave_balance
            WHERE staff_id = ? AND \`year_month\` = ?
        `, [id, year_month]);

        const leaves = leaveBalance[0] || { paid_leaves_used: 0, unpaid_leaves_used: 0 };

        // Calculate salary
        let calculatedSalary = 0;
        let details = {};

        if (staff.salary_type === 'Monthly') {
            // Monthly staff calculation
            // Assuming 26 working days per month (excluding Sundays and holidays)
            const totalHolidays = attendance.filter(a => a.status === 'Holiday').length;
            const monthDays = 30; // Average
            const workingDaysInMonth = monthDays - Math.ceil(monthDays / 7); // Rough calculation of Sundays

            const paid_leave = leaves.paid_leaves_used || 0;
            const unpaid_leave = leaves.unpaid_leaves_used || 0;

            const perDayRate = staff.base_salary / 26;
            const daysWorked = Math.max(0, 26 - unpaid_leave);

            calculatedSalary = perDayRate * daysWorked;

            details = {
                baseMonthly: staff.base_salary,
                perDayRate: parseFloat(perDayRate.toFixed(2)),
                totalWorkingDays: 26,
                paidLeaves: paid_leave,
                unpaidLeaves: unpaid_leave,
                daysDeducted: unpaid_leave,
                daysWorked: daysWorked,
                calculatedSalary: parseFloat(calculatedSalary.toFixed(2))
            };
        } else {
            // Daily staff calculation
            const presentDays = attendance.filter(a => a.status === 'Present').length;
            calculatedSalary = presentDays * staff.daily_rate;

            details = {
                dailyRate: staff.daily_rate,
                presentDays: presentDays,
                totalDays: attendance.length,
                calculatedSalary: parseFloat(calculatedSalary.toFixed(2))
            };
        }

        res.json({
            staffType: staff.salary_type,
            attendance: {
                total: attendance.length,
                present: attendance.filter(a => a.status === 'Present').length,
                absent: attendance.filter(a => a.status === 'Absent').length,
                leave: attendance.filter(a => a.status === 'Leave').length,
                holiday: attendance.filter(a => a.status === 'Holiday').length
            },
            leaves: leaves,
            calculation: details
        });
    } catch (err) {
        console.error('Salary calculation error:', err);
        res.status(500).json({ message: 'Failed to calculate salary' });
    }
});

module.exports = router;


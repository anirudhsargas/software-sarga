const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { auditLog } = require('../helpers');

// ==================== HELPER: Get Branch ID ====================
const getBranchId = (user, queryBranchId) => {
    if (user.role === 'Admin' || user.role === 'Accountant') {
        return queryBranchId || user.branch_id;
    }
    return user.branch_id;
};

// ==================== GET/SET OPENING BALANCE ====================
router.get('/opening-balance', auth.authenticate, async (req, res) => {
    try {
        const { date, book_type } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        if (book_type) {
            const [rows] = await pool.query(
                `SELECT * FROM sarga_daily_opening_balances
                 WHERE report_date = ? AND branch_id = ? AND book_type = ?`,
                [date, branchId, book_type]
            );
            const row = rows[0];
            return res.json(row ? { cash_opening: Number(row.cash_opening), is_locked: !!row.is_locked } : { cash_opening: 0, is_locked: false });
        }

        // Get all 3 book types with lock status
        const [rows] = await pool.query(
            `SELECT * FROM sarga_daily_opening_balances
             WHERE report_date = ? AND branch_id = ?`,
            [date, branchId]
        );

        const result = { Offset: 0, Laser: 0, Other: 0 };
        const locked = { Offset: false, Laser: false, Other: false };
        rows.forEach(r => {
            result[r.book_type] = Number(r.cash_opening);
            locked[r.book_type] = !!r.is_locked;
        });
        res.json({ balances: result, locked });
    } catch (error) {
        console.error('Error fetching opening balance:', error);
        res.status(500).json({ error: 'Failed to fetch opening balance' });
    }
});

router.put('/opening-balance', auth.authenticate, async (req, res) => {
    try {
        const { date, book_type, cash_opening } = req.body;
        const branchId = getBranchId(req.user, req.body.branch_id);
        const isAdmin = req.user.role === 'Admin';

        if (!date || !book_type) {
            return res.status(400).json({ error: 'Date and book_type are required' });
        }

        // Check if already entered (lock for staff, Admin can always edit)
        if (!isAdmin) {
            const [existing] = await pool.query(
                `SELECT id, is_locked FROM sarga_daily_opening_balances
                 WHERE report_date = ? AND branch_id = ? AND book_type = ?`,
                [date, branchId, book_type]
            );
            if (existing.length > 0 && existing[0].is_locked) {
                return res.status(403).json({
                    error: 'Opening balance already entered and locked. Submit a change request to Admin.',
                    is_locked: true
                });
            }
        }

        await pool.query(
            `INSERT INTO sarga_daily_opening_balances (report_date, branch_id, book_type, cash_opening, entered_by, is_locked)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE cash_opening = VALUES(cash_opening), entered_by = VALUES(entered_by), is_locked = VALUES(is_locked)`,
            [date, branchId, book_type, cash_opening || 0, req.user.id, isAdmin ? 0 : 1]
        );

        auditLog(req.user.id, 'OPENING_BALANCE_SET', `Set ${book_type} opening balance ₹${cash_opening} for ${date}`, { entity_type: 'opening_balance' });
        res.json({ message: 'Opening balance saved', book_type, cash_opening, is_locked: !isAdmin });
    } catch (error) {
        console.error('Error saving opening balance:', error);
        res.status(500).json({ error: 'Failed to save opening balance' });
    }
});

// ==================== OPENING CHANGE REQUESTS ====================
router.post('/change-request', auth.authenticate, async (req, res) => {
    try {
        const { date, request_type, book_type, machine_id, current_value, requested_value, note } = req.body;
        const branchId = getBranchId(req.user, req.body.branch_id);

        if (!date || !request_type) {
            return res.status(400).json({ error: 'Date and request_type are required' });
        }

        // Check for existing pending request (more precise check)
        const [pending] = await pool.query(
            `SELECT id FROM sarga_opening_change_requests
             WHERE report_date = ? AND branch_id = ? AND request_type = ? AND status = 'Pending'
               AND (
                 (? IS NULL AND book_type IS NULL) OR (? IS NOT NULL AND book_type = ?)
               )
               AND (
                 (? IS NULL AND machine_id IS NULL) OR (? IS NOT NULL AND machine_id = ?)
               )`,
            [
                date, branchId, request_type,
                book_type || null, book_type || null, book_type || null,
                machine_id || null, machine_id || null, machine_id || null
            ]
        );
        if (pending.length > 0) {
            return res.status(400).json({ error: 'A pending request already exists for this item.' });
        }

        await pool.query(
            `INSERT INTO sarga_opening_change_requests
             (requester_id, branch_id, report_date, request_type, book_type, machine_id, current_value, requested_value, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, branchId, date, request_type, book_type || null, machine_id || null,
            current_value || 0, requested_value || 0, note || null]
        );

        auditLog(req.user.id, 'CHANGE_REQUEST_SUBMIT', `Submitted ${request_type} change request for ${date}`, { entity_type: 'change_request' });
        res.json({ message: 'Change request submitted for Admin approval.' });
    } catch (error) {
        console.error('Error submitting change request:', error);
        res.status(500).json({
            error: 'Failed to submit change request',
            details: error.message
        });
    }
});

router.get('/change-requests', auth.authenticate, async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT cr.*, s.name AS requester_name, b.name AS branch_name,
                   m.machine_name
            FROM sarga_opening_change_requests cr
            JOIN sarga_staff s ON cr.requester_id = s.id
            JOIN sarga_branches b ON cr.branch_id = b.id
            LEFT JOIN sarga_machines m ON cr.machine_id = m.id
        `;
        const params = [];
        if (status) {
            query += ` WHERE cr.status = ?`;
            params.push(status);
        }
        query += ` ORDER BY cr.created_at DESC`;

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching change requests:', error);
        res.status(500).json({ error: 'Failed to fetch change requests' });
    }
});

router.post('/change-requests/:id/review', auth.authenticate, async (req, res) => {
    try {
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Only Admin/Accountant can review requests' });
        }

        const { action } = req.body;
        const requestId = req.params.id;

        const [requests] = await pool.query('SELECT * FROM sarga_opening_change_requests WHERE id = ?', [requestId]);
        const request = requests[0];
        if (!request) return res.status(404).json({ error: 'Request not found' });
        if (request.status !== 'Pending') return res.status(400).json({ error: 'Request already reviewed' });

        if (action === 'Approve') {
            if (request.request_type === 'balance') {
                // Update the opening balance
                await pool.query(
                    `UPDATE sarga_daily_opening_balances
                     SET cash_opening = ?, entered_by = ?, is_locked = 1
                     WHERE report_date = ? AND branch_id = ? AND book_type = ?`,
                    [request.requested_value, request.requester_id, request.report_date, request.branch_id, request.book_type]
                );
            } else if (request.request_type === 'machine_count') {
                // Update machine reading opening count
                const newOpening = parseInt(request.requested_value) || 0;
                await pool.query(
                    `UPDATE sarga_machine_readings
                     SET opening_count = ?, total_copies = GREATEST(0, COALESCE(closing_count, 0) - ?)
                     WHERE machine_id = ? AND reading_date = ?`,
                    [newOpening, newOpening, request.machine_id, request.report_date]
                );
            }

            await pool.query(
                `UPDATE sarga_opening_change_requests SET status = 'Approved', reviewed_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [req.user.id, requestId]
            );
            auditLog(req.user.id, 'CHANGE_REQUEST_APPROVE', `Approved change request #${requestId}: ${request.request_type}`, { entity_type: 'change_request', entity_id: requestId });
            res.json({ message: 'Request approved and value updated' });
        } else {
            await pool.query(
                `UPDATE sarga_opening_change_requests SET status = 'Rejected', reviewed_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [req.user.id, requestId]
            );
            auditLog(req.user.id, 'CHANGE_REQUEST_REJECT', `Rejected change request #${requestId}: ${request.request_type}`, { entity_type: 'change_request', entity_id: requestId });
            res.json({ message: 'Request rejected' });
        }
    } catch (error) {
        console.error('Error reviewing change request:', error);
        res.status(500).json({ error: 'Failed to review request' });
    }
});

// ==================== GET PREVIOUS DAY CLOSING BALANCE ====================
router.get('/previous-closing', auth.authenticate, async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // For Offset: get previous day closing from sarga_daily_report_offset
        const [prevOffset] = await pool.query(
            `SELECT closing_balance FROM sarga_daily_report_offset
             WHERE report_date < ? AND branch_id = ?
             ORDER BY report_date DESC LIMIT 1`,
            [date, branchId]
        );

        res.json({
            Offset: prevOffset.length > 0 ? Number(prevOffset[0].closing_balance) : 0,
            Laser: 0,
            Other: 0
        });
    } catch (error) {
        console.error('Error fetching previous closing:', error);
        res.status(500).json({ error: 'Failed to fetch previous closing' });
    }
});

// ==================== OFFSET TAB: LIVE DATA ====================
router.get('/offset-live', auth.authenticate, async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // 1. Customer Payments (income/work entries)
        const [customerPayments] = await pool.query(
            `SELECT cp.id, cp.customer_name, cp.total_amount, cp.advance_paid,
                    cp.payment_method, cp.cash_amount, cp.upi_amount,
                    cp.description, cp.reference_number, cp.order_lines,
                    cp.created_at
             FROM sarga_customer_payments cp
             WHERE DATE(cp.payment_date) = ? AND cp.branch_id = ?
             ORDER BY cp.created_at DESC`,
            [date, branchId]
        );

        // 2. Expense Payments (cash out)
        const [expensePayments] = await pool.query(
            `SELECT p.id, p.type, p.payee_name, p.amount, p.payment_method,
                    p.cash_amount, p.upi_amount, p.description, p.reference_number,
                    p.created_at
             FROM sarga_payments p
             WHERE DATE(p.payment_date) = ? AND p.branch_id = ?
             ORDER BY p.created_at DESC`,
            [date, branchId]
        );

        // 3. Calculate totals
        let totalCashIn = 0, totalUpiIn = 0, totalCashOut = 0, totalUpiOut = 0;

        const workEntries = customerPayments.map(cp => {
            const cashAmt = Number(cp.cash_amount || 0);
            const upiAmt = Number(cp.upi_amount || 0);
            const advPaid = Number(cp.advance_paid || 0);
            const method = cp.payment_method || 'Cash';

            let cashIn = 0, upiIn = 0;
            if (method === 'Both') {
                cashIn = cashAmt;
                upiIn = upiAmt;
            } else if (method === 'UPI') {
                upiIn = advPaid;
            } else {
                cashIn = advPaid;
            }

            totalCashIn += cashIn;
            totalUpiIn += upiIn;

            return {
                id: cp.id,
                type: 'income',
                description: cp.customer_name,
                details: cp.description || '',
                payment_method: method,
                cash_amount: cashIn,
                upi_amount: upiIn,
                total: advPaid,
                reference: cp.reference_number,
                time: cp.created_at
            };
        });

        const expenseEntries = expensePayments.map(p => {
            const amount = Number(p.amount || 0);
            const cashAmt = Number(p.cash_amount || 0);
            const upiAmt = Number(p.upi_amount || 0);
            const method = p.payment_method || 'Cash';

            let cashOut = 0, upiOut = 0;
            if (method === 'Both') {
                cashOut = cashAmt;
                upiOut = upiAmt;
            } else if (method === 'UPI') {
                upiOut = amount;
            } else {
                cashOut = amount;
            }

            totalCashOut += cashOut;
            totalUpiOut += upiOut;

            return {
                id: p.id,
                type: 'expense',
                description: `${p.type}: ${p.payee_name}`,
                details: p.description || '',
                payment_method: method,
                cash_amount: cashOut,
                upi_amount: upiOut,
                total: amount,
                reference: p.reference_number,
                time: p.created_at
            };
        });

        // 4. Opening balance
        const [openingRows] = await pool.query(
            `SELECT cash_opening FROM sarga_daily_opening_balances
             WHERE report_date = ? AND branch_id = ? AND book_type = 'Offset'`,
            [date, branchId]
        );
        const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;

        const cashClosing = cashOpening + totalCashIn - totalCashOut;

        res.json({
            entries: [...workEntries, ...expenseEntries].sort((a, b) =>
                new Date(b.time) - new Date(a.time)
            ),
            summary: {
                cash_opening: cashOpening,
                total_cash_in: totalCashIn,
                total_upi_in: totalUpiIn,
                total_cash_out: totalCashOut,
                total_upi_out: totalUpiOut,
                cash_closing: cashClosing,
                entry_count: workEntries.length + expenseEntries.length,
                income_count: workEntries.length,
                expense_count: expenseEntries.length
            }
        });
    } catch (error) {
        console.error('Error fetching offset live data:', error);
        res.status(500).json({ error: 'Failed to fetch offset data' });
    }
});

// ==================== LASER TAB: LIVE DATA ====================
router.get('/laser-live', auth.authenticate, async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // 1. Get active Digital machines for this branch.
        // For non-admin users, restrict to machines assigned to the user.
        let machines;
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            const [rows] = await pool.query(
                `SELECT m.id, m.machine_name, m.machine_type, m.counter_type, m.location
                 FROM sarga_machines m
                 JOIN sarga_machine_staff_assignments msa ON msa.machine_id = m.id AND msa.staff_id = ?
                 WHERE m.branch_id = ? AND m.is_active = 1 AND m.machine_type = 'Digital'
                 ORDER BY m.machine_name ASC`,
                [req.user.id, branchId]
            );
            machines = rows;
        } else {
            const [rows] = await pool.query(
                `SELECT m.id, m.machine_name, m.machine_type, m.counter_type, m.location
                 FROM sarga_machines m
                 WHERE m.branch_id = ? AND m.is_active = 1 AND m.machine_type = 'Digital'
                 ORDER BY m.machine_name ASC`,
                [branchId]
            );
            machines = rows;
        }
        try {
            console.log(`[DailyReport] laser-live requested by user id=${req.user.id} role=${req.user.role} branch=${branchId} -> machines_count=${machines.length}`);
        } catch (e) { }

        // 2. Get machine readings for today
        const machineIds = machines.map(m => m.id);
        let readings = [];
        if (machineIds.length > 0) {
            const [readingRows] = await pool.query(
                `SELECT mr.machine_id, mr.opening_count, mr.closing_count, mr.total_copies
                 FROM sarga_machine_readings mr
                 WHERE mr.reading_date = ? AND mr.machine_id IN (${machineIds.map(() => '?').join(',')})`,
                [date, ...machineIds]
            );
            readings = readingRows;
        }

        // Build machine data with readings
        const machineData = machines.map(m => {
            const reading = readings.find(r => r.machine_id === m.id);
            return {
                id: m.id,
                machine_name: m.machine_name,
                machine_type: m.machine_type,
                counter_type: m.counter_type,
                location: m.location,
                opening_count: reading ? Number(reading.opening_count) : 0,
                closing_count: reading ? (reading.closing_count !== null ? Number(reading.closing_count) : null) : null,
                today_copies: reading ? Number(reading.total_copies || 0) : 0,
                has_reading: !!reading
            };
        });

        // 3. Get machine work entries for today
        let workEntries = [];
        if (machineIds.length > 0) {
            const [reports] = await pool.query(
                `SELECT drm.id as report_id, drm.machine_id
                 FROM sarga_daily_report_machine drm
                 WHERE drm.report_date = ? AND drm.machine_id IN (${machineIds.map(() => '?').join(',')})`,
                [date, ...machineIds]
            );
            const reportIds = reports.map(r => r.report_id);
            if (reportIds.length > 0) {
                const [entries] = await pool.query(
                    `SELECT mwe.*, drm.machine_id, m.machine_name
                     FROM sarga_machine_work_entries mwe
                     JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
                     JOIN sarga_machines m ON drm.machine_id = m.id
                     WHERE mwe.report_id IN (${reportIds.map(() => '?').join(',')})
                     ORDER BY mwe.id DESC`,
                    [...reportIds]
                );
                workEntries = entries.map(e => ({
                    id: e.id,
                    machine_id: e.machine_id,
                    machine_name: e.machine_name,
                    type: 'income',
                    description: e.customer_name,
                    details: e.work_details,
                    copies: Number(e.copies || 0),
                    payment_method: e.payment_type,
                    cash_amount: Number(e.cash_amount || 0),
                    upi_amount: Number(e.upi_amount || 0),
                    total: Number(e.total_amount || 0),
                    time: e.entry_time
                }));
            }
        }

        // 4. Calculate totals
        let totalCashIn = 0, totalUpiIn = 0, totalCopies = 0;
        workEntries.forEach(e => {
            totalCashIn += e.cash_amount;
            totalUpiIn += e.upi_amount;
            totalCopies += e.copies;
        });

        // 5. Opening balance
        const [openingRows] = await pool.query(
            `SELECT cash_opening FROM sarga_daily_opening_balances
             WHERE report_date = ? AND branch_id = ? AND book_type = 'Laser'`,
            [date, branchId]
        );
        const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;

        const cashClosing = cashOpening + totalCashIn;

        res.json({
            machines: machineData,
            entries: workEntries,
            summary: {
                cash_opening: cashOpening,
                total_cash_in: totalCashIn,
                total_upi_in: totalUpiIn,
                total_copies: totalCopies,
                cash_closing: cashClosing,
                machine_count: machines.length,
                entry_count: workEntries.length
            }
        });
    } catch (error) {
        console.error('Error fetching laser live data:', error);
        res.status(500).json({ error: 'Failed to fetch laser data' });
    }
});

// ==================== OTHER TAB: LIVE DATA ====================
router.get('/other-live', auth.authenticate, async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // For "Other" tab, show jobs with category 'Other'
        const [otherJobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.description, j.total_amount,
                                        j.advance_paid, j.balance_amount, j.payment_status, j.status,
                                        COALESCE(c.name, 'Walk-in') as customer_name,
                                        j.created_at
                         FROM sarga_jobs j
                         LEFT JOIN sarga_customers c ON j.customer_id = c.id
                         WHERE DATE(j.created_at) = ? AND j.branch_id = ?
                             AND j.category = 'Other'
                         ORDER BY j.created_at DESC`,
            [date, branchId]
        );

        // Calculate totals
        let totalCashIn = 0, totalUpiIn = 0;
        const entries = otherJobs.map(j => {
            const total = Number(j.advance_paid || 0);
            totalCashIn += total; // Default to cash for simplicity
            return {
                id: j.id,
                type: 'income',
                description: `${j.job_number} - ${j.customer_name}`,
                details: j.job_name || j.description || '',
                payment_method: j.payment_status === 'Paid' ? 'Cash' : 'Partial',
                cash_amount: total,
                upi_amount: 0,
                total: total,
                time: j.created_at
            };
        });

        // Opening balance
        const [openingRows] = await pool.query(
            `SELECT cash_opening FROM sarga_daily_opening_balances
             WHERE report_date = ? AND branch_id = ? AND book_type = 'Other'`,
            [date, branchId]
        );
        const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;

        const cashClosing = cashOpening + totalCashIn;

        res.json({
            entries,
            summary: {
                cash_opening: cashOpening,
                total_cash_in: totalCashIn,
                total_upi_in: totalUpiIn,
                total_cash_out: 0,
                total_upi_out: 0,
                cash_closing: cashClosing,
                entry_count: entries.length
            }
        });
    } catch (error) {
        console.error('Error fetching other live data:', error);
        res.status(500).json({ error: 'Failed to fetch other data' });
    }
});

// ==================== LIVE COUNTS (for auto-refresh) ====================
router.get('/live-counts', auth.authenticate, async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // Offset count
        const [[offsetCount]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_customer_payments
             WHERE DATE(payment_date) = ? AND branch_id = ?`,
            [date, branchId]
        );

        // Offset cash/upi totals
        const [[offsetTotals]] = await pool.query(
            `SELECT COALESCE(SUM(cash_amount), 0) as total_cash,
                    COALESCE(SUM(upi_amount), 0) as total_upi,
                    COALESCE(SUM(advance_paid), 0) as total_collected
             FROM sarga_customer_payments
             WHERE DATE(payment_date) = ? AND branch_id = ?`,
            [date, branchId]
        );

        // Expense count & totals
        const [[expenseTotals]] = await pool.query(
            `SELECT COUNT(*) as count,
                    COALESCE(SUM(amount), 0) as total
             FROM sarga_payments
             WHERE DATE(payment_date) = ? AND branch_id = ?`,
            [date, branchId]
        );

        // Machine counts
        const [[machineCount]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_machines
             WHERE branch_id = ? AND is_active = 1 AND machine_type = 'Digital'`,
            [branchId]
        );

        // Machine readings total copies today
        const [[machineCopies]] = await pool.query(
            `SELECT COALESCE(SUM(mr.total_copies), 0) as total
             FROM sarga_machine_readings mr
             JOIN sarga_machines m ON mr.machine_id = m.id
             WHERE mr.reading_date = ? AND m.branch_id = ? AND m.machine_type = 'Digital'`,
            [date, branchId]
        );

        // 4. Laser income counts (from machine work entries)
        const [[laserIncome]] = await pool.query(
            `SELECT COUNT(*) as count,
                    COALESCE(SUM(mwe.total_amount), 0) as total_amount,
                    COALESCE(SUM(mwe.cash_amount), 0) as total_cash,
                    COALESCE(SUM(mwe.upi_amount), 0) as total_upi
             FROM sarga_machine_work_entries mwe
             JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
             WHERE drm.report_date = ? AND drm.branch_id = ?`,
            [date, branchId]
        );

        // 5. Other income counts (from jobs with category 'Other')
        const [[otherIncome]] = await pool.query(
            `SELECT COUNT(*) as count,
                    COALESCE(SUM(advance_paid), 0) as total_collected
             FROM sarga_jobs
             WHERE DATE(created_at) = ? AND branch_id = ? AND category = 'Other'`,
            [date, branchId]
        );

        res.json({
            offset: {
                income_count: offsetCount.count,
                expense_count: expenseTotals.count,
                total_cash_in: Number(offsetTotals.total_cash),
                total_upi_in: Number(offsetTotals.total_upi),
                total_collected: Number(offsetTotals.total_collected),
                total_expenses: Number(expenseTotals.total)
            },
            laser: {
                machine_count: machineCount.count,
                total_copies: Number(machineCopies.total),
                income_count: laserIncome.count,
                total_collected: Number(laserIncome.total_cash) + Number(laserIncome.total_upi),
                total_cash_in: Number(laserIncome.total_cash),
                total_upi_in: Number(laserIncome.total_upi)
            },
            other: {
                income_count: otherIncome.count,
                total_collected: Number(otherIncome.total_collected)
            }
        });
    } catch (error) {
        console.error('Error fetching live counts:', error);
        res.status(500).json({ error: 'Failed to fetch live counts' });
    }
});

module.exports = router;


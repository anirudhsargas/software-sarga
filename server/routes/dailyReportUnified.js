const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { paginate } = require('../helpers/pagination');
const { routeCache } = require('../middleware/cache');
const { invalidateReportsCache } = require('../services/cacheService');

const REPORTS_TTL = 600; // 10 minutes — date-bound data changes infrequently

// ==================== HELPER: Get Branch ID ====================
const getBranchId = (user, queryBranchId) => {
    if (user.role === 'Admin' || user.role === 'Accountant') {
        return queryBranchId || user.branch_id;
    }
    return user.branch_id;
};

// On write: invalidate reports cache
async function invalidateReports() { await invalidateReportsCache().catch(() => {}); }
router.get('/opening-balance', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { date, book_type } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        if (book_type) {
            const [rows] = await pool.query(
                `SELECT cash_opening, is_locked FROM sarga_daily_opening_balances
                 WHERE report_date = ? AND branch_id = ? AND book_type = ?`,
                [date, branchId, book_type]
            );
            const row = rows[0];
            return res.json(row ? { cash_opening: Number(row.cash_opening), is_locked: !!row.is_locked } : { cash_opening: 0, is_locked: false });
        }

        // Get all 3 book types with lock status
        const [rows] = await pool.query(
            `SELECT book_type, cash_opening, is_locked FROM sarga_daily_opening_balances
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

router.put('/opening-balance', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { date, book_type, cash_opening } = req.body;
        const branchId = getBranchId(req.user, req.body.branch_id);
        const isAdmin = auth.normalizeRole(req.user.role) === 'Admin';

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

        await invalidateReports();
        auditLog(req.user.id, 'OPENING_BALANCE_SET', `Set ${book_type} opening balance ₹${cash_opening} for ${date}`, { entity_type: 'opening_balance' });
        res.json({ message: 'Opening balance saved', book_type, cash_opening, is_locked: !isAdmin });
    } catch (error) {
        console.error('Error saving opening balance:', error);
        res.status(500).json({ error: 'Failed to save opening balance' });
    }
});

// ==================== OPENING CHANGE REQUESTS ====================
router.post('/change-request', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
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

router.get('/change-requests', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { status } = req.query;
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

        let whereClauses = [];
        const params = [];

        if (status) {
            whereClauses.push('LOWER(cr.status) = ?');
            params.push(String(status).toLowerCase());
        }

        const whereSection = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';
        const baseFrom = `
            FROM sarga_opening_change_requests cr
            LEFT JOIN sarga_staff s ON cr.requester_id = s.id
            LEFT JOIN sarga_branches b ON cr.branch_id = b.id
            LEFT JOIN sarga_machines m ON cr.machine_id = m.id
            ${whereSection}
        `;

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
        const [rows] = await pool.query(`
            SELECT cr.*, s.name AS requester_name, b.name AS branch_name,
                   m.machine_name
            ${baseFrom}
            ORDER BY cr.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        res.json(response(rows, total));
    } catch (error) {
        console.error('Error fetching change requests:', error);
        res.status(500).json({ error: 'Failed to fetch change requests' });
    }
});

router.post('/change-requests/:id/review', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Only Admin/Accountant can review requests' });
        }

        const { action } = req.body;
        const requestId = req.params.id;

        const [requests] = await pool.query('SELECT id, status, request_type, requested_value, requester_id, report_date, branch_id, book_type, machine_id FROM sarga_opening_change_requests WHERE id = ?', [requestId]);
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
                      SET opening_count = ?
                     WHERE machine_id = ? AND reading_date = ?`,
                    [newOpening, request.machine_id, request.report_date]
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
router.get('/previous-closing', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), routeCache(REPORTS_TTL, (req) => `sarga:reports:prev-closing:${req.query.branch_id || req.user.branch_id}:${req.query.date}`), async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // Calculate previous date using simple string math to avoid timezone issues
        const [year, month, day] = date.split('-').map(Number);
        const prevDate = new Date(year, month - 1, day - 1);
        const previousDateStr = prevDate.getFullYear() + '-' + 
                                String(prevDate.getMonth() + 1).padStart(2, '0') + '-' + 
                                String(prevDate.getDate()).padStart(2, '0');

        // Offset: stored closing balance from sarga_daily_report_offset
        const [prevOffset] = await pool.query(
            `SELECT closing_balance FROM sarga_daily_report_offset
             WHERE LEFT(report_date, 10) < ? AND branch_id = ?
             ORDER BY report_date DESC LIMIT 1`,
            [date, branchId]
        );

        // Laser opening balance for yesterday
        const [laserOpeningRows] = await pool.query(
            `SELECT cash_opening
             FROM sarga_daily_opening_balances
             WHERE LEFT(report_date, 10) = ? AND branch_id = ? AND book_type = 'Laser'
             LIMIT 1`,
            [previousDateStr, branchId]
        );

        // Laser cash-in: exactly replicates laser-live totalCashIn logic
        // Part A — MWE cash: manual entries + auto-synced entries whose job has payment_id
        //   (auto-synced entries without payment_id are ignored, matching laser-live)
        const [[laserMweCash]] = await pool.query(
            `SELECT COALESCE(SUM(mwe.cash_amount), 0) AS total_cash
             FROM sarga_machine_work_entries mwe
             JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
             LEFT JOIN sarga_jobs j ON mwe.job_id = j.id
             WHERE LEFT(drm.report_date, 10) = ? AND drm.branch_id = ?
               AND (
                 (mwe.remarks IS NULL OR mwe.remarks NOT LIKE 'Auto-synced from Job%')
                 OR (mwe.remarks LIKE 'Auto-synced from Job%' AND j.payment_id IS NOT NULL)
               )`,
            [previousDateStr, branchId]
        );

        // Part B — Laser customer_payments NOT already represented by a bill-grouped MWE
        //   matches laser-live: billingEntries = laserPayments.filter(!coveredPaymentIds)
        const [[laserCpCash]] = await pool.query(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN payment_method = 'Both' THEN COALESCE(cash_amount, 0)
                    WHEN payment_method = 'UPI'  THEN 0
                    ELSE COALESCE(advance_paid, 0)
                END
            ), 0) AS total_cash
             FROM sarga_customer_payments
             WHERE LEFT(payment_date, 10) = ? AND branch_id = ? AND book_type = 'Laser'
               AND id NOT IN (
                   SELECT DISTINCT j.payment_id
                   FROM sarga_machine_work_entries mwe
                   JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
                   JOIN sarga_jobs j ON mwe.job_id = j.id
                   WHERE LEFT(drm.report_date, 10) = ? AND drm.branch_id = ?
                     AND mwe.remarks LIKE 'Auto-synced from Job%'
                     AND j.payment_id IS NOT NULL
               )`,
            [previousDateStr, branchId, previousDateStr, branchId]
        );

        // Other opening balance for yesterday
        const [otherOpeningRows] = await pool.query(
            `SELECT cash_opening
             FROM sarga_daily_opening_balances
             WHERE LEFT(report_date, 10) = ? AND branch_id = ? AND book_type = 'Other'
             LIMIT 1`,
            [previousDateStr, branchId]
        );

        // Other cash-in for yesterday (billing payments tagged as Other)
        const [[otherIncome]] = await pool.query(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN payment_method = 'Both' THEN COALESCE(cash_amount, 0)
                    WHEN payment_method = 'UPI'  THEN 0
                    ELSE COALESCE(advance_paid, 0)
                END
            ), 0) AS total_cash
             FROM sarga_customer_payments
             WHERE DATE(payment_date) = ? AND branch_id = ? AND book_type = 'Other'`,
            [previousDateStr, branchId]
        );

        const laserOpening = laserOpeningRows.length > 0 ? Number(laserOpeningRows[0].cash_opening) : 0;
        const otherOpening = otherOpeningRows.length > 0 ? Number(otherOpeningRows[0].cash_opening) : 0;
        // Include internal transfers for previous date (incoming increases, outgoing decreases)
        const [prevTransfers] = await pool.query(
            `SELECT amount, to_book_type, from_book_type FROM sarga_internal_transfers WHERE DATE(created_at) = ? AND branch_id = ?`,
            [previousDateStr, branchId]
        );
        const laserTransferIn = prevTransfers.reduce((s, t) => s + (t.to_book_type === 'Laser' ? Number(t.amount || 0) : 0), 0);
        const laserTransferOut = prevTransfers.reduce((s, t) => s + (t.from_book_type === 'Laser' ? Number(t.amount || 0) : 0), 0);
        const otherTransferIn = prevTransfers.reduce((s, t) => s + (t.to_book_type === 'Other' ? Number(t.amount || 0) : 0), 0);
        const otherTransferOut = prevTransfers.reduce((s, t) => s + (t.from_book_type === 'Other' ? Number(t.amount || 0) : 0), 0);

        // closing = opening + Part A (MWE cash) + Part B (uncovered billing CP cash) + transfers_in - transfers_out
        const laserClosing = laserOpening + Number(laserMweCash.total_cash || 0) + Number(laserCpCash.total_cash || 0) + laserTransferIn - laserTransferOut;
        const otherClosing = otherOpening + Number(otherIncome.total_cash || 0) + otherTransferIn - otherTransferOut;

        // Machines: last closing_count before today
        const [prevMachines] = await pool.query(
            `SELECT mr.machine_id, mr.closing_count
             FROM sarga_machine_readings mr
             JOIN sarga_machines m ON mr.machine_id = m.id
             WHERE LEFT(mr.reading_date, 10) < ? AND m.branch_id = ? AND mr.closing_count IS NOT NULL
             ORDER BY mr.reading_date DESC`,
            [date, branchId]
        );
        // Keep most recent per machine
        const machineMap = {};
        for (const row of prevMachines) {
            if (machineMap[row.machine_id] === undefined) {
                machineMap[row.machine_id] = Number(row.closing_count);
            }
        }

        // Today's machine readings (to detect if opening counts are already entered)
        const [todayMachines] = await pool.query(
            `SELECT mr.machine_id, mr.opening_count
             FROM sarga_machine_readings mr
             JOIN sarga_machines m ON mr.machine_id = m.id
             WHERE LEFT(mr.reading_date, 10) = ? AND m.branch_id = ?`,
            [date, branchId]
        );
        const todayMachineReadings = {}; // { [machine_id]: opening_count }
        for (const row of todayMachines) {
            todayMachineReadings[row.machine_id] = Number(row.opening_count);
        }

        res.json({
            Offset: prevOffset.length > 0 ? Number(prevOffset[0].closing_balance) : 0,
            Laser: laserClosing,
            Other: otherClosing,
            machines: machineMap,          // { [machine_id]: last_closing_count } — previous day
            todayMachineReadings           // { [machine_id]: opening_count }     — today already saved
        });
    } catch (error) {
        console.error('Error fetching previous closing:', error);
        res.status(500).json({ error: 'Failed to fetch previous closing' });
    }
});

// ==================== OFFSET TAB: LIVE DATA ====================
router.get('/offset-live', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), routeCache(REPORTS_TTL, (req) => `sarga:reports:offset-live:${req.query.branch_id || req.user.branch_id}:${req.query.date}`), async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // 1. Customer Payments (income/work entries) — Offset book only
        const [customerPayments] = await pool.query(
            `SELECT cp.id, cp.customer_name, cp.total_amount, cp.advance_paid,
                    cp.payment_method, cp.cash_amount, cp.upi_amount,
                    cp.description, cp.reference_number, cp.order_lines,
                    cp.created_at,
                    COALESCE(cp.discount_percent, 0) as discount_percent,
                    COALESCE(cp.discount_amount, 0) as discount_amount,
                    cp.bill_amount
             FROM sarga_customer_payments cp
             WHERE DATE(cp.payment_date) = ? AND cp.branch_id = ?
               AND COALESCE(cp.book_type, 'Offset') = 'Offset'
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

        // 2b. Fetch jobs linked to these payments (for grouping when order_lines is empty)
        let linkedJobsByPayment = {};
        if (customerPayments.length > 0) {
            const cpIds = customerPayments.map(cp => cp.id);
            const [linkedJobs] = await pool.query(
                `SELECT j.payment_id, j.job_name, j.quantity, j.total_amount,
                        COALESCE(j.waste_prints, 0) as waste_prints,
                        COALESCE(j.proof_prints, 0) as proof_prints
                 FROM sarga_jobs j
                 WHERE j.payment_id IN (${cpIds.map(() => '?').join(',')})
                 ORDER BY j.id ASC`,
                cpIds
            );
            for (const j of linkedJobs) {
                if (!linkedJobsByPayment[j.payment_id]) linkedJobsByPayment[j.payment_id] = [];
                linkedJobsByPayment[j.payment_id].push(j);
            }
        }

        // 3. Calculate totals
        let totalCashIn = 0, totalUpiIn = 0, totalCashOut = 0, totalUpiOut = 0;
        let totalWastePrints = 0, totalProofPrints = 0;

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

            const parsedLines = (() => { try { return JSON.parse(cp.order_lines || '[]'); } catch { return []; } })();

            // If order_lines is empty (paid via CustomerPayments directly), use linked jobs
            const jobLines = linkedJobsByPayment[cp.id] || [];
            const lines = parsedLines.length > 0 ? parsedLines : jobLines.map(j => ({
                product_name: j.job_name,
                quantity: j.quantity,
                total_amount: j.total_amount,
                waste_prints: j.waste_prints,
                proof_prints: j.proof_prints
            }));

            const details = lines.map(l => l.product_name || l.job_name || '').filter(Boolean).join(', ');

            // Aggregate waste/proof from order_lines
            const billWaste = lines.reduce((s, l) => s + (Number(l.waste_prints) || 0), 0);
            const billProof = lines.reduce((s, l) => s + (Number(l.proof_prints) || 0), 0);
            totalWastePrints += billWaste;
            totalProofPrints += billProof;

            const discountPct = Number(cp.discount_percent) || 0;
            const discountAmt = Number(cp.discount_amount) || 0;

            return {
                id: cp.id,
                type: 'income',
                description: cp.customer_name,
                details: details || cp.description || '',
                payment_method: method,
                cash_amount: cashIn,
                upi_amount: upiIn,
                total: advPaid,
                reference: cp.reference_number,
                time: cp.created_at,
                waste_prints: billWaste,
                proof_prints: billProof,
                discount_percent: discountPct,
                discount_amount: discountAmt,
                order_lines: lines.map(l => ({
                    name: l.product_name || l.job_name || '',
                    qty: l.quantity || 1,
                    amount: Number(l.total_amount || 0),
                    waste_prints: Number(l.waste_prints) || 0,
                    proof_prints: Number(l.proof_prints) || 0
                }))
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

        // 4. Internal transfers for this date (affect totals)
        const [transfers] = await pool.query(
            `SELECT id, amount, from_book_type, to_book_type, note, created_at FROM sarga_internal_transfers WHERE DATE(created_at) = ? AND branch_id = ?`,
            [date, branchId]
        );
        const transferEntries = (transfers || []).map(t => {
            const amt = Number(t.amount || 0);
            if (t.from_book_type === 'Offset') {
                // Outgoing transfer from Offset
                totalCashOut += amt;
                return {
                    id: `transfer-${t.id}`,
                    type: 'expense',
                    description: `Transfer to ${t.to_book_type}`,
                    details: t.note || '',
                    payment_method: 'Transfer',
                    cash_amount: amt,
                    upi_amount: 0,
                    total: amt,
                    time: t.created_at
                };
            } else if (t.to_book_type === 'Offset') {
                // Incoming transfer to Offset
                totalCashIn += amt;
                return {
                    id: `transfer-${t.id}`,
                    type: 'income',
                    description: `Transfer from ${t.from_book_type}`,
                    details: t.note || '',
                    payment_method: 'Transfer',
                    cash_amount: amt,
                    upi_amount: 0,
                    total: amt,
                    time: t.created_at
                };
            }
            return null;
        }).filter(Boolean);

        // 5. Opening balance
        const [openingRows] = await pool.query(
            `SELECT cash_opening FROM sarga_daily_opening_balances
             WHERE report_date = ? AND branch_id = ? AND book_type = 'Offset'`,
            [date, branchId]
        );
        const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;
        const cashClosing = cashOpening + totalCashIn - totalCashOut;

        const allEntries = [...workEntries, ...transferEntries, ...expenseEntries].sort((a, b) => new Date(b.time) - new Date(a.time));
        const entryCount = allEntries.length;
        const incomeCount = workEntries.length + transferEntries.filter(e => e.type === 'income').length;
        const expenseCount = expenseEntries.length + transferEntries.filter(e => e.type === 'expense').length;

        res.json({
            entries: allEntries,
            summary: {
                cash_opening: cashOpening,
                total_cash_in: totalCashIn,
                total_upi_in: totalUpiIn,
                total_cash_out: totalCashOut,
                total_upi_out: totalUpiOut,
                waste_prints: totalWastePrints,
                proof_prints: totalProofPrints,
                cash_closing: cashClosing,
                entry_count: entryCount,
                income_count: incomeCount,
                expense_count: expenseCount
            }
        });
    } catch (error) {
        console.error('Error fetching offset live data:', error);
        res.status(500).json({ error: 'Failed to fetch offset data' });
    }
});

// ==================== LASER TAB: LIVE DATA ====================
router.get('/laser-live', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // 1. Get active Digital machines for this branch.
        // For non-admin users, restrict to machines assigned to the user.
        let machines;
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            const [rows] = await pool.query(
                `SELECT m.id, m.machine_name, m.machine_type, m.counter_type, m.location, m.branch_id
                 FROM sarga_machines m
                 JOIN sarga_machine_staff_assignments msa ON msa.machine_id = m.id AND msa.staff_id = ?
                 WHERE m.branch_id = ? AND m.is_active = 1 AND m.machine_type = 'Digital'
                 ORDER BY m.machine_name ASC`,
                [req.user.id, branchId]
            );
            machines = rows;
        } else {
            const [rows] = await pool.query(
                `SELECT m.id, m.machine_name, m.machine_type, m.counter_type, m.location, m.branch_id
                 FROM sarga_machines m
                 WHERE m.branch_id = ? AND m.is_active = 1 AND m.machine_type = 'Digital'
                 ORDER BY m.machine_name ASC`,
                [branchId]
            );
            machines = rows;
        }
        try {
            console.log(`[DailyReport] laser-live requested by user id=${req.user.id} role=${req.user.role} branch=${branchId} -> machines_count=${machines.length}`);
        } catch (_e) { /* ignored */ }

        // 2. Get machine readings for today
        const machineIds = machines.map(m => m.id);
        let readings = [];
        if (machineIds.length > 0) {
            const [readingRows] = await pool.query(
                `SELECT mr.machine_id, mr.opening_count, mr.closing_count, GREATEST(0, COALESCE(mr.closing_count, 0) - mr.opening_count) as total_copies,
                        COALESCE(mr.waste_prints, 0) as waste_prints, COALESCE(mr.proof_prints, 0) as proof_prints
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
                branch_id: m.branch_id,
                opening_count: reading ? Number(reading.opening_count) : 0,
                closing_count: reading ? (reading.closing_count !== null ? Number(reading.closing_count) : null) : null,
                today_copies: reading ? Number(reading.total_copies || 0) : 0,
                waste_prints: reading ? Number(reading.waste_prints || 0) : 0,
                proof_prints: reading ? Number(reading.proof_prints || 0) : 0,
                has_reading: !!reading
            };
        });

        // 3. Get machine work entries for today
        let workEntries = [];
        const coveredPaymentIds = new Set();
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
                    `SELECT mwe.*, drm.machine_id, m.machine_name,
                            j.payment_id
                     FROM sarga_machine_work_entries mwe
                     JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
                     JOIN sarga_machines m ON drm.machine_id = m.id
                     LEFT JOIN sarga_jobs j ON mwe.job_id = j.id
                     WHERE mwe.report_id IN (${reportIds.map(() => '?').join(',')})
                     ORDER BY mwe.id DESC`,
                    [...reportIds]
                );

                // Group auto-synced entries by payment_id (bill), keep manual entries as-is
                const billGroups = {};  // payment_id → [entries]
                const manualEntries = [];

                entries.forEach(e => {
                    const isAutoSynced = e.remarks && e.remarks.startsWith('Auto-synced from Job');
                    if (isAutoSynced && e.payment_id) {
                        if (!billGroups[e.payment_id]) billGroups[e.payment_id] = [];
                        billGroups[e.payment_id].push(e);
                    } else if (isAutoSynced && !e.payment_id) {
                        // Ignore orphan auto-synced rows until they are linked to a payment.
                    } else {
                        manualEntries.push(e);
                    }
                });

                // Convert manual entries as before
                manualEntries.forEach(e => {
                    const eCash = Number(e.cash_amount || 0);
                    const eUpi = Number(e.upi_amount || 0);
                    const eCollected = eCash + eUpi;
                    // Use collected amount (cash+upi) when payment was made; otherwise show job total
                    const eTotal = eCollected > 0 ? eCollected : Number(e.total_amount || 0);
                    workEntries.push({
                        id: e.id,
                        machine_id: e.machine_id,
                        machine_name: e.machine_name,
                        type: 'income',
                        description: e.customer_name,
                        details: e.work_details,
                        copies: Number(e.copies || 0),
                        payment_method: e.payment_type,
                        cash_amount: eCash,
                        upi_amount: eUpi,
                        total: eTotal,
                        time: e.entry_time
                    });
                });

                // Convert grouped bill entries into single rows with order_lines
                for (const [paymentId, group] of Object.entries(billGroups)) {
                    coveredPaymentIds.add(Number(paymentId));
                    const first = group[0];
                    const totalCash = group.reduce((s, e) => s + Number(e.cash_amount || 0), 0);
                    const totalUpi = group.reduce((s, e) => s + Number(e.upi_amount || 0), 0);
                    const _totalAmt = group.reduce((s, e) => s + Number(e.total_amount || 0), 0);
                    const totalCopies = group.reduce((s, e) => s + Number(e.copies || 0), 0);
                    const machineNames = [...new Set(group.map(e => e.machine_name))].join(', ');

                    workEntries.push({
                        id: `bill-${paymentId}`,
                        machine_id: first.machine_id,
                        machine_name: machineNames,
                        type: 'income',
                        description: first.customer_name,
                        details: group.map(e => e.work_details).filter(Boolean).join(', '),
                        copies: totalCopies,
                        payment_method: first.payment_type,
                        cash_amount: totalCash,
                        upi_amount: totalUpi,
                        total: totalCash + totalUpi,
                        time: first.entry_time,
                        order_lines: group.map(e => ({
                            name: e.work_details || 'Item',
                            qty: Number(e.copies || 1),
                            amount: Number(e.total_amount || 0)
                        }))
                    });
                }
            }
        }

        // Fallback: when a machine's reading has no closing count yet, show the system total
        // (sum of today's work-entry copies) instead of 0 / negative meter difference.
        const systemCopiesByMachine = {};
        workEntries.forEach(e => {
            if (e.machine_id != null) {
                systemCopiesByMachine[e.machine_id] = (systemCopiesByMachine[e.machine_id] || 0) + Number(e.copies || 0);
            }
        });
        machineData.forEach(m => {
            if (m.closing_count === null) {
                m.today_copies = systemCopiesByMachine[m.id] || 0;
            }
        });

        // 4. Billing payments tagged as Laser (from customer_payments)
        const [laserPayments] = await pool.query(
            `SELECT cp.id, cp.customer_name, cp.advance_paid, cp.payment_method,
                    cp.cash_amount, cp.upi_amount, cp.description, cp.reference_number,
                    cp.created_at, cp.order_lines,
                    COALESCE(cp.discount_percent, 0) as discount_percent,
                    COALESCE(cp.discount_amount, 0) as discount_amount,
                    COALESCE(cp.is_internal, 0) as is_internal,
                    cp.internal_department
             FROM sarga_customer_payments cp
             WHERE DATE(cp.payment_date) = ? AND cp.branch_id = ? AND cp.book_type = 'Laser'
             ORDER BY cp.created_at DESC`,
            [date, branchId]
        );

        const billingEntries = laserPayments.filter(cp => !coveredPaymentIds.has(Number(cp.id))).map(cp => {
            const cashAmt = Number(cp.cash_amount || 0);
            const upiAmt = Number(cp.upi_amount || 0);
            const advPaid = Number(cp.advance_paid || 0);
            const method = cp.payment_method || 'Cash';
            let cashIn = 0, upiIn = 0;
            if (method === 'Both') { cashIn = cashAmt; upiIn = upiAmt; }
            else if (method === 'UPI') { upiIn = advPaid; }
            else { cashIn = advPaid; }
            const lines = (() => { try { return JSON.parse(cp.order_lines || '[]'); } catch { return []; } })();
            const details = lines.map(l => l.product_name || l.job_name || '').filter(Boolean).join(', ');
            // Aggregate waste/proof from order_lines
            const billWaste = lines.reduce((s, l) => s + (Number(l.waste_prints) || 0), 0);
            const billProof = lines.reduce((s, l) => s + (Number(l.proof_prints) || 0), 0);
            return {
                id: `cp-${cp.id}`,
                type: 'billing',
                description: cp.customer_name,
                details: details || cp.description || '',
                copies: 0,
                payment_method: method,
                cash_amount: cashIn,
                upi_amount: upiIn,
                total: advPaid,
                time: cp.created_at,
                waste_prints: billWaste,
                proof_prints: billProof,
                discount_percent: Number(cp.discount_percent) || 0,
                discount_amount: Number(cp.discount_amount) || 0,
                is_internal: Number(cp.is_internal) || 0,
                internal_department: cp.internal_department || null,
                order_lines: lines.map(l => ({
                    name: l.product_name || l.job_name || '',
                    qty: l.quantity || 1,
                    amount: Number(l.total_amount || 0),
                    waste_prints: Number(l.waste_prints) || 0,
                    proof_prints: Number(l.proof_prints) || 0
                }))
            };
        });

        // 5. Calculate totals (machine work entries + billing entries)
        let totalCashIn = 0, totalUpiIn = 0, totalCopies = 0;
        let totalCashOut = 0, totalUpiOut = 0;
        let totalWastePrints = 0, totalProofPrints = 0;
        let internalPrints = 0, internalBillCount = 0;
        workEntries.forEach(e => {
            totalCashIn += e.cash_amount;
            totalUpiIn += e.upi_amount;
            totalCopies += e.copies;
        });
        billingEntries.forEach(e => {
            if (!e.is_internal) {
                totalCashIn += e.cash_amount;
                totalUpiIn += e.upi_amount;
            }
            totalWastePrints += (e.waste_prints || 0);
            totalProofPrints += (e.proof_prints || 0);
            if (e.is_internal) {
                // Sum prints from order_lines quantities for internal bills
                const linePrints = (e.order_lines || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
                internalPrints += linePrints || e.copies || 0;
                internalBillCount++;
            }
        });
        // Aggregate waste/proof from machineData (per-reading totals)
        machineData.forEach(m => {
            totalWastePrints += m.waste_prints || 0;
            totalProofPrints += m.proof_prints || 0;
        });

        // Also add waste/proof logged from billing jobs for today
        if (machineIds.length > 0) {
            const [jobWaste] = await pool.query(
                `SELECT machine_id,
                        COALESCE(SUM(waste_prints), 0) AS billing_waste,
                        COALESCE(SUM(proof_prints), 0) AS billing_proof
                 FROM sarga_jobs
                 WHERE DATE(created_at) = ?
                   AND machine_id IN (${machineIds.map(() => '?').join(',')})
                   AND (waste_prints > 0 OR proof_prints > 0)
                 GROUP BY machine_id`,
                [date, ...machineIds]
            );
            jobWaste.forEach(row => {
                const bw = Number(row.billing_waste) || 0;
                const bp = Number(row.billing_proof) || 0;
                totalWastePrints += bw;
                totalProofPrints += bp;
                // Merge into the corresponding machineData entry so the card shows combined
                const m = machineData.find(m => m.id === row.machine_id);
                if (m) {
                    m.waste_prints = (m.waste_prints || 0) + bw;
                    m.proof_prints = (m.proof_prints || 0) + bp;
                    m.billing_waste = bw;
                    m.billing_proof = bp;
                }
            });
        }

        // 5. Internal transfers for this date (affect totals)
        const [transfers] = await pool.query(
            `SELECT id, amount, from_book_type, to_book_type, note, created_at FROM sarga_internal_transfers WHERE DATE(created_at) = ? AND branch_id = ?`,
            [date, branchId]
        );
        const transferEntries = (transfers || []).map(t => {
            const amt = Number(t.amount || 0);
            if (t.from_book_type === 'Laser') {
                totalCashOut += amt;
                return {
                    id: `transfer-${t.id}`,
                    type: 'expense',
                    machine_id: null,
                    machine_name: null,
                    description: `Transfer to ${t.to_book_type}`,
                    details: t.note || '',
                    copies: 0,
                    payment_method: 'Transfer',
                    cash_amount: amt,
                    upi_amount: 0,
                    total: amt,
                    time: t.created_at
                };
            } else if (t.to_book_type === 'Laser') {
                totalCashIn += amt;
                return {
                    id: `transfer-${t.id}`,
                    type: 'income',
                    machine_id: null,
                    machine_name: null,
                    description: `Transfer from ${t.from_book_type}`,
                    details: t.note || '',
                    copies: 0,
                    payment_method: 'Transfer',
                    cash_amount: amt,
                    upi_amount: 0,
                    total: amt,
                    time: t.created_at
                };
            }
            return null;
        }).filter(Boolean);

        // 6. Manual Credits
        const [manualCredits] = await pool.query(
            `SELECT id, transaction_type, amount, description, customer_id, report_date, branch_id, book_type FROM sarga_daily_credit_transactions 
             WHERE report_date = ? AND branch_id = ? AND book_type = 'Laser'`,
            [date, branchId]
        );
        const creditIn = manualCredits.filter(c => c.transaction_type === 'Credit In').reduce((s, c) => s + Number(c.amount), 0);
        const creditOut = manualCredits.filter(c => c.transaction_type === 'Credit Out').reduce((s, c) => s + Number(c.amount), 0);

        // 7. Opening balance
        const [openingRows] = await pool.query(
            `SELECT cash_opening FROM sarga_daily_opening_balances
             WHERE report_date = ? AND branch_id = ? AND book_type = 'Laser'`,
            [date, branchId]
        );
        const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;
        const cashClosing = cashOpening + totalCashIn + creditIn - totalCashOut - creditOut;

        const allEntries = [...workEntries, ...billingEntries, ...transferEntries].sort((a, b) => new Date(b.time) - new Date(a.time));
        const entryCount = allEntries.length;
        const _incomeCount = workEntries.length + billingEntries.length + transferEntries.filter(e => e.type === 'income').length;

        res.json({
            machines: machineData,
            entries: allEntries,
            credits: manualCredits,
            summary: {
                cash_opening: cashOpening,
                total_cash_in: totalCashIn,
                total_upi_in: totalUpiIn,
                total_cash_out: totalCashOut,
                total_upi_out: totalUpiOut,
                total_credit_in: creditIn,
                total_credit_out: creditOut,
                total_copies: totalCopies,
                waste_prints: totalWastePrints,
                proof_prints: totalProofPrints,
                cash_closing: cashClosing,
                machine_count: machines.length,
                entry_count: entryCount,
                internal_prints: internalPrints,
                internal_bill_count: internalBillCount
            }
        });
    } catch (error) {
        console.error('Error fetching laser live data:', error);
        res.status(500).json({ error: 'Failed to fetch laser data' });
    }
});

// ==================== OTHER TAB: LIVE DATA ====================
router.get('/other-live', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // Billing payments tagged as Other (from customer_payments)
        const [otherPayments] = await pool.query(
            `SELECT cp.id, cp.customer_name, cp.advance_paid, cp.payment_method,
                    cp.cash_amount, cp.upi_amount, cp.description, cp.order_lines, cp.created_at,
                    COALESCE(cp.discount_percent, 0) as discount_percent,
                    COALESCE(cp.discount_amount, 0) as discount_amount
             FROM sarga_customer_payments cp
             WHERE DATE(cp.payment_date) = ? AND cp.branch_id = ? AND cp.book_type = 'Other'
             ORDER BY cp.created_at DESC`,
            [date, branchId]
        );

        // Fetch jobs linked to these payments (for grouping when order_lines is empty)
        let linkedJobsByPaymentOther = {};
        if (otherPayments.length > 0) {
            const cpIds = otherPayments.map(cp => cp.id);
            const [linkedJobs] = await pool.query(
                `SELECT j.payment_id, j.job_name, j.quantity, j.total_amount,
                        COALESCE(j.waste_prints, 0) as waste_prints,
                        COALESCE(j.proof_prints, 0) as proof_prints
                 FROM sarga_jobs j
                 WHERE j.payment_id IN (${cpIds.map(() => '?').join(',')})
                 ORDER BY j.id ASC`,
                cpIds
            );
            for (const j of linkedJobs) {
                if (!linkedJobsByPaymentOther[j.payment_id]) linkedJobsByPaymentOther[j.payment_id] = [];
                linkedJobsByPaymentOther[j.payment_id].push(j);
            }
        }

        // Calculate totals
        let totalCashIn = 0, totalUpiIn = 0;
        let totalWastePrints = 0, totalProofPrints = 0;
        const entries = otherPayments.map(cp => {
            const cashAmt = Number(cp.cash_amount || 0);
            const upiAmt = Number(cp.upi_amount || 0);
            const advPaid = Number(cp.advance_paid || 0);
            const method = cp.payment_method || 'Cash';
            let cashIn = 0, upiIn = 0;
            if (method === 'Both') { cashIn = cashAmt; upiIn = upiAmt; }
            else if (method === 'UPI') { upiIn = advPaid; }
            else { cashIn = advPaid; }
            totalCashIn += cashIn;
            totalUpiIn += upiIn;

            const parsedLines = (() => { try { return JSON.parse(cp.order_lines || '[]'); } catch { return []; } })();
            const jobLines = linkedJobsByPaymentOther[cp.id] || [];
            const lines = parsedLines.length > 0 ? parsedLines : jobLines.map(j => ({
                product_name: j.job_name,
                quantity: j.quantity,
                total_amount: j.total_amount,
                waste_prints: j.waste_prints,
                proof_prints: j.proof_prints
            }));

            const details = lines.map(l => l.product_name || l.job_name || '').filter(Boolean).join(', ');
            const billWaste = lines.reduce((s, l) => s + (Number(l.waste_prints) || 0), 0);
            const billProof = lines.reduce((s, l) => s + (Number(l.proof_prints) || 0), 0);
            totalWastePrints += billWaste;
            totalProofPrints += billProof;
            const discountPct = Number(cp.discount_percent) || 0;
            const discountAmt = Number(cp.discount_amount) || 0;
            return {
                id: `cp-${cp.id}`,
                type: 'income',
                description: cp.customer_name,
                details: details || cp.description || '',
                payment_method: method,
                cash_amount: cashIn,
                upi_amount: upiIn,
                total: advPaid,
                time: cp.created_at,
                waste_prints: billWaste,
                proof_prints: billProof,
                discount_percent: discountPct,
                discount_amount: discountAmt,
                order_lines: lines.map(l => ({ name: l.product_name || l.job_name || '', qty: l.quantity || 1, amount: Number(l.total_amount || 0), waste_prints: Number(l.waste_prints) || 0, proof_prints: Number(l.proof_prints) || 0 }))
            };
        });

        // Internal transfers affecting Other book
        const [transfers] = await pool.query(
            `SELECT id, amount, from_book_type, to_book_type, note, created_at FROM sarga_internal_transfers WHERE DATE(created_at) = ? AND branch_id = ?`,
            [date, branchId]
        );
        let totalCashOut = 0, totalUpiOut = 0;
        const transferEntries = (transfers || []).map(t => {
            const amt = Number(t.amount || 0);
            if (t.from_book_type === 'Other') {
                totalCashOut += amt;
                return {
                    id: `transfer-${t.id}`,
                    type: 'expense',
                    description: `Transfer to ${t.to_book_type}`,
                    details: t.note || '',
                    payment_method: 'Transfer',
                    cash_amount: amt,
                    upi_amount: 0,
                    total: amt,
                    time: t.created_at
                };
            } else if (t.to_book_type === 'Other') {
                // incoming
                totalCashIn += amt;
                return {
                    id: `transfer-${t.id}`,
                    type: 'income',
                    description: `Transfer from ${t.from_book_type}`,
                    details: t.note || '',
                    payment_method: 'Transfer',
                    cash_amount: amt,
                    upi_amount: 0,
                    total: amt,
                    time: t.created_at
                };
            }
            return null;
        }).filter(Boolean);

        // 5. Manual Credits
        const [manualCredits] = await pool.query(
            `SELECT id, transaction_type, amount, description, customer_id, report_date, branch_id, book_type FROM sarga_daily_credit_transactions 
             WHERE report_date = ? AND branch_id = ? AND book_type = 'Other'`,
            [date, branchId]
        );
        const creditIn = manualCredits.filter(c => c.transaction_type === 'Credit In').reduce((s, c) => s + Number(c.amount), 0);
        const creditOut = manualCredits.filter(c => c.transaction_type === 'Credit Out').reduce((s, c) => s + Number(c.amount), 0);

        // 6. Opening balance
        const [openingRows] = await pool.query(
            `SELECT cash_opening FROM sarga_daily_opening_balances
             WHERE report_date = ? AND branch_id = ? AND book_type = 'Other'`,
            [date, branchId]
        );
        const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;

        const cashClosing = cashOpening + totalCashIn + creditIn - totalCashOut - creditOut;

        const allEntries = [...entries, ...transferEntries].sort((a, b) => new Date(b.time) - new Date(a.time));

        res.json({
            entries: allEntries,
            credits: manualCredits,
            summary: {
                cash_opening: cashOpening,
                total_cash_in: totalCashIn,
                total_upi_in: totalUpiIn,
                total_cash_out: totalCashOut,
                total_upi_out: totalUpiOut,
                total_credit_in: creditIn,
                total_credit_out: creditOut,
                waste_prints: totalWastePrints,
                proof_prints: totalProofPrints,
                cash_closing: cashClosing,
                entry_count: allEntries.length
            }
        });
    } catch (error) {
        console.error('Error fetching other live data:', error);
        res.status(500).json({ error: 'Failed to fetch other data' });
    }
});

// ==================== INTERNAL USAGE REPORT ====================
router.get('/internal-usage', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { from, to, department } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

        let where = 'WHERE cp.is_internal = 1 AND DATE(cp.payment_date) BETWEEN ? AND ? AND cp.branch_id = ?';
        const params = [from, to, branchId];
        if (department && department !== 'all') {
            where += ' AND cp.internal_department = ?';
            params.push(department);
        }

        // All internal bills
        const [bills] = await pool.query(
            `SELECT cp.id, cp.customer_name, cp.internal_department, cp.description,
                    cp.order_lines, cp.payment_date, cp.created_at,
                    s.name as added_by
             FROM sarga_customer_payments cp
             LEFT JOIN sarga_staff s ON cp.verified_by = s.id
             ${where}
             ORDER BY cp.payment_date DESC, cp.created_at DESC`,
            params
        );

        // Parse order_lines for sheets/prints
        const rows = bills.map(b => {
            let lines = [];
            try { lines = JSON.parse(b.order_lines || '[]'); } catch (_ignored) { /* ignored */ }
            const totalPrints = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            const totalSheets = lines.reduce((s, l) => s + (Number(l.sheets) || 0), 0);
            return {
                id: b.id,
                date: b.payment_date,
                department: b.internal_department,
                customer_name: b.customer_name,
                description: b.description || lines.map(l => l.product_name || l.job_name || '').filter(Boolean).join(', '),
                sheets: totalSheets,
                prints: totalPrints,
                added_by: b.added_by || '—',
                created_at: b.created_at
            };
        });

        // Summary per department
        const deptSummary = {};
        rows.forEach(r => {
            const dept = r.department || 'unknown';
            if (!deptSummary[dept]) deptSummary[dept] = { prints: 0, jobs: 0 };
            deptSummary[dept].prints += r.prints;
            deptSummary[dept].jobs += 1;
        });

        // Monthly trend (last 6 months)
        const [trend] = await pool.query(
            `SELECT DATE_FORMAT(cp.payment_date, '%Y-%m') as month,
                    cp.internal_department as department,
                    COUNT(*) as jobs,
                    SUM(
                      (SELECT COALESCE(SUM(
                        CAST(JSON_EXTRACT(j.value, '$.quantity') AS UNSIGNED)
                      ), 0)
                      FROM JSON_TABLE(cp.order_lines, '$[*]' COLUMNS (value JSON PATH '$')) j)
                    ) as prints
             FROM sarga_customer_payments cp
             WHERE cp.is_internal = 1
               AND cp.branch_id = ?
               AND cp.payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
             GROUP BY month, department
             ORDER BY month ASC`,
            [branchId]
        );

        res.json({ bills: rows, summary: deptSummary, trend });
    } catch (error) {
        console.error('Error fetching internal usage:', error);
        res.status(500).json({ error: 'Failed to fetch internal usage data' });
    }
});

// ==================== LIVE COUNTS (for auto-refresh) ====================
router.get('/live-counts', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { date } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date) return res.status(400).json({ error: 'Date is required' });

        // Offset count
        const [[offsetCount]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_customer_payments
             WHERE DATE(payment_date) = ? AND branch_id = ?
               AND COALESCE(book_type, 'Offset') = 'Offset'`,
            [date, branchId]
        );

        // Offset cash/upi totals
        const [[offsetTotals]] = await pool.query(
            `SELECT COALESCE(SUM(cash_amount), 0) as total_cash,
                    COALESCE(SUM(upi_amount), 0) as total_upi,
                    COALESCE(SUM(advance_paid), 0) as total_collected
             FROM sarga_customer_payments
             WHERE DATE(payment_date) = ? AND branch_id = ?
               AND COALESCE(book_type, 'Offset') = 'Offset'`,
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
            `SELECT COALESCE(SUM(GREATEST(0, COALESCE(mr.closing_count, 0) - mr.opening_count)), 0) as total
             FROM sarga_machine_readings mr
             JOIN sarga_machines m ON mr.machine_id = m.id
             WHERE mr.reading_date = ? AND m.branch_id = ? AND m.machine_type = 'Digital'`,
            [date, branchId]
        );

        // 4. Laser income counts (from machine work entries, grouped by payment_id like laser-live)
        const [[laserIncome]] = await pool.query(
            `SELECT
                -- Count distinct bills (grouped by payment_id) + manual entries (no payment_id)
                (SELECT COUNT(DISTINCT COALESCE(j.payment_id, mwe.id))
                 FROM sarga_machine_work_entries mwe
                 JOIN sarga_daily_report_machine drm2 ON mwe.report_id = drm2.id
                 LEFT JOIN sarga_jobs j ON mwe.job_id = j.id
                                 WHERE drm2.report_date = ? AND drm2.branch_id = ?
                                     AND NOT (mwe.remarks LIKE 'Auto-synced from Job%' AND j.payment_id IS NULL)) as count,
                COALESCE(SUM(mwe.total_amount), 0) as total_amount,
                COALESCE(SUM(mwe.cash_amount), 0) as total_cash,
                COALESCE(SUM(mwe.upi_amount), 0) as total_upi
             FROM sarga_machine_work_entries mwe
             JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
                         LEFT JOIN sarga_jobs j ON mwe.job_id = j.id
                         WHERE drm.report_date = ? AND drm.branch_id = ?
                             AND NOT (mwe.remarks LIKE 'Auto-synced from Job%' AND j.payment_id IS NULL)`,
            [date, branchId, date, branchId]
        );

        // 4b. Laser billing payments (customer_payments with book_type = 'Laser')
        //     Only count those NOT already covered by machine work entries above
        const [[laserBilling]] = await pool.query(
            `SELECT COUNT(*) as count,
                    COALESCE(SUM(cash_amount), 0) as total_cash,
                    COALESCE(SUM(upi_amount), 0) as total_upi
             FROM sarga_customer_payments cp
             WHERE DATE(payment_date) = ? AND branch_id = ? AND book_type = 'Laser'
               AND id NOT IN (
                   SELECT DISTINCT j.payment_id
                   FROM sarga_machine_work_entries mwe
                   JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
                   LEFT JOIN sarga_jobs j ON mwe.job_id = j.id
                   WHERE drm.report_date = ? AND drm.branch_id = ?
                     AND j.payment_id IS NOT NULL
               )`,
            [date, branchId, date, branchId]
        );

        // 5. Other income counts (from customer_payments with book_type = 'Other')
        const [[otherIncome]] = await pool.query(
            `SELECT COUNT(*) as count,
                    COALESCE(SUM(advance_paid), 0) as total_collected
             FROM sarga_customer_payments
             WHERE DATE(payment_date) = ? AND branch_id = ? AND book_type = 'Other'`,
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
                income_count: Number(laserIncome.count) + Number(laserBilling.count),
                total_collected: Number(laserIncome.total_cash) + Number(laserIncome.total_upi) + Number(laserBilling.total_cash) + Number(laserBilling.total_upi),
                total_cash_in: Number(laserIncome.total_cash) + Number(laserBilling.total_cash),
                total_upi_in: Number(laserIncome.total_upi) + Number(laserBilling.total_upi)
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

// ==================== MANUAL CREDIT TRANSACTIONS ====================
router.get('/credits', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { date, book_type } = req.query;
        const branchId = getBranchId(req.user, req.query.branch_id);

        if (!date || !book_type) return res.status(400).json({ error: 'Date and book_type are required' });

        const [rows] = await pool.query(
            `SELECT id, transaction_type, amount, description, customer_id, customer_name, report_date, branch_id, book_type, created_at FROM sarga_daily_credit_transactions 
             WHERE report_date = ? AND branch_id = ? AND book_type = ?
             ORDER BY created_at ASC`,
            [date, branchId, book_type]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching credits:', error);
        res.status(500).json({ error: 'Failed to fetch credits' });
    }
});

router.post('/credits', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { date, book_type, transaction_type, customer_name, customer_phone, amount, remarks } = req.body;
        const branchId = getBranchId(req.user, req.body.branch_id);

        if (!date || !book_type || !transaction_type || !customer_name || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [result] = await pool.query(
            `INSERT INTO sarga_daily_credit_transactions 
             (branch_id, report_date, book_type, transaction_type, customer_name, customer_phone, amount, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [branchId, date, book_type, transaction_type, customer_name, customer_phone || '', amount, remarks || '']
        );

        auditLog(req.user.id, 'CREDIT_TXN_ADD', `Added ${transaction_type} of ₹${amount} for ${customer_name} in ${book_type} book`, { entity_type: 'credit_transaction', entity_id: result.insertId });
        res.json({ id: result.insertId, message: 'Credit transaction added' });
    } catch (error) {
        console.error('Error adding credit:', error);
        res.status(500).json({ error: 'Failed to add credit transaction' });
    }
});

router.delete('/credits/:id', auth.authenticate, auth.authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const creditId = req.params.id;
        
        // Fetch before delete for logging
        const [[existing]] = await pool.query('SELECT id, customer_name, amount, branch_id FROM sarga_daily_credit_transactions WHERE id = ?', [creditId]);
        if (!existing) return res.status(404).json({ error: 'Credit transaction not found' });
        if (req.user.role !== 'Admin' && Number(existing.branch_id) !== Number(req.user.branch_id)) {
            return res.status(403).json({ error: 'Access denied: credit transaction belongs to a different branch.' });
        }

        await pool.query('DELETE FROM sarga_daily_credit_transactions WHERE id = ?', [creditId]);

        auditLog(req.user.id, 'CREDIT_TXN_DELETE', `Deleted credit transaction for ${existing.customer_name} of ₹${existing.amount}`, { entity_type: 'credit_transaction', entity_id: creditId });
        res.json({ message: 'Credit transaction deleted' });
    } catch (error) {
        console.error('Error deleting credit:', error);
        res.status(500).json({ error: 'Failed to delete credit transaction' });
    }
});

module.exports = router;


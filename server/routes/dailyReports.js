const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { auditLog } = require('../helpers');

// ==================== GET DAILY REPORTS (OFFSET) ====================
router.get('/offset', auth.authenticate, async (req, res) => {
    try {
        const { branch_id, start_date, end_date, status } = req.query;
        const user = req.user;

        let query = `
      SELECT dr.*, b.name as branch_name, s.name as created_by_name
      FROM sarga_daily_report_offset dr
      LEFT JOIN sarga_branches b ON dr.branch_id = b.id
      LEFT JOIN sarga_staff s ON dr.created_by = s.id
      WHERE 1=1
    `;
        const params = [];

        // Filter by branch
        if (user.role !== 'Admin' && user.role !== 'Accountant') {
            query += ` AND dr.branch_id = ?`;
            params.push(user.branch_id);
        } else if (branch_id) {
            query += ` AND dr.branch_id = ?`;
            params.push(branch_id);
        }

        if (start_date) {
            query += ` AND dr.report_date >= ?`;
            params.push(start_date);
        }
        if (end_date) {
            query += ` AND dr.report_date <= ?`;
            params.push(end_date);
        }
        if (status) {
            query += ` AND dr.status = ?`;
            params.push(status);
        }

        query += ` ORDER BY dr.report_date DESC LIMIT 100`;

        const [reports] = await pool.query(query, params);
        res.json(reports);
    } catch (error) {
        console.error('Error fetching offset reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// ==================== SYNC: GET DAY'S DATA FROM BILLING/PAYMENTS/JOBS ====================
router.get('/offset/sync-data', auth.authenticate, async (req, res) => {
    try {
        const { date } = req.query;
        const user = req.user;

        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required' });
        }

        const branchId = (user.role === 'Admin' || user.role === 'Accountant')
            ? (req.query.branch_id || null)
            : user.branch_id;

        // 1) Customer Payments (billing) for the day — these are INCOME work entries
        const [customerPayments] = await pool.query(
            `SELECT cp.id, cp.customer_name, cp.total_amount, cp.advance_paid,
                    cp.payment_method, cp.cash_amount, cp.upi_amount,
                    cp.description, cp.reference_number, cp.order_lines
             FROM sarga_customer_payments cp
             WHERE DATE(cp.payment_date) = ? AND cp.branch_id = ?
             ORDER BY cp.created_at ASC`,
            [date, branchId]
        );

        // 2) Completed / Delivered Jobs for the day (not already billed via customer payments)
        const [completedJobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.description, j.total_amount,
                    j.advance_paid, j.balance_amount, j.payment_status, j.status,
                    COALESCE(c.name, 'Walk-in') as customer_name
             FROM sarga_jobs j
             LEFT JOIN sarga_customers c ON j.customer_id = c.id
             WHERE (j.status IN ('Completed', 'Delivered'))
               AND DATE(j.updated_at) = ?
               AND j.branch_id = ?
             ORDER BY j.updated_at ASC`,
            [date, branchId]
        );

        // 3) Expense Payments for the day — these are EXPENSE entries
        const [expensePayments] = await pool.query(
            `SELECT p.id, p.type, p.payee_name, p.amount, p.payment_method,
                    p.cash_amount, p.upi_amount, p.description, p.reference_number
             FROM sarga_payments p
             WHERE DATE(p.payment_date) = ? AND p.branch_id = ?
             ORDER BY p.created_at ASC`,
            [date, branchId]
        );

        // 4) Previous day's closing balance → today's opening balance
        const [prevReport] = await pool.query(
            `SELECT closing_balance FROM sarga_daily_report_offset
             WHERE report_date < ? AND branch_id = ?
             ORDER BY report_date DESC LIMIT 1`,
            [date, branchId]
        );

        const previousClosing = prevReport.length > 0 ? Number(prevReport[0].closing_balance) : 0;

        res.json({
            customer_payments: customerPayments,
            completed_jobs: completedJobs,
            expense_payments: expensePayments,
            previous_closing_balance: previousClosing
        });
    } catch (error) {
        console.error('Error fetching sync data:', error);
        res.status(500).json({ error: 'Failed to fetch sync data' });
    }
});

// ==================== GET SINGLE OFFSET REPORT ====================
router.get('/offset/:id', auth.authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Get report header
        const [reports] = await pool.query(
            `SELECT dr.*, b.name as branch_name, s.name as created_by_name
       FROM sarga_daily_report_offset dr
       LEFT JOIN sarga_branches b ON dr.branch_id = b.id
       LEFT JOIN sarga_staff s ON dr.created_by = s.id
       WHERE dr.id = ?`,
            [id]
        );

        if (reports.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const report = reports[0];

        // Get work entries
        const [workEntries] = await pool.query(
            'SELECT * FROM sarga_daily_work_entries WHERE report_id = ? ORDER BY entry_time',
            [id]
        );

        // Get expenses
        const [expenses] = await pool.query(
            'SELECT * FROM sarga_daily_expenses WHERE report_id = ? ORDER BY created_at',
            [id]
        );

        // Get credit transactions
        const [creditTransactions] = await pool.query(
            'SELECT * FROM sarga_daily_credit_transactions WHERE report_id = ? ORDER BY created_at',
            [id]
        );

        // Get staff attendance for the day
        const [attendance] = await pool.query(
            `SELECT sa.*, s.name as staff_name
       FROM sarga_staff_attendance sa
       LEFT JOIN sarga_staff s ON sa.staff_id = s.id
       WHERE sa.attendance_date = ? AND s.branch_id = ?`,
            [report.report_date, report.branch_id]
        );

        res.json({
            ...report,
            work_entries: workEntries,
            expenses,
            credit_transactions: creditTransactions,
            staff_attendance: attendance
        });
    } catch (error) {
        console.error('Error fetching offset report:', error);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// ==================== CREATE/UPDATE OFFSET REPORT ====================
router.post('/offset', auth.authenticate, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            report_date,
            branch_id,
            opening_balance,
            work_entries = [],
            expenses = [],
            credit_transactions = [],
            staff_attendance = []
        } = req.body;

        const user = req.user;
        const effectiveBranchId = ['Admin', 'Accountant'].includes(user.role) ? (branch_id || null) : user.branch_id;

        // Check if report exists for this date and branch
        const [existing] = await connection.query(
            'SELECT id FROM sarga_daily_report_offset WHERE report_date = ? AND branch_id = ?',
            [report_date, effectiveBranchId]
        );

        let reportId;

        if (existing.length > 0) {
            reportId = existing[0].id;
            // Update existing report
            await connection.query(
                'UPDATE sarga_daily_report_offset SET opening_balance = ? WHERE id = ?',
                [opening_balance, reportId]
            );
        } else {
            // Create new report
            const [result] = await connection.query(
                `INSERT INTO sarga_daily_report_offset (report_date, branch_id, opening_balance, created_by)
         VALUES (?, ?, ?, ?)`,
                [report_date, effectiveBranchId, opening_balance, user.id]
            );
            reportId = result.insertId;
        }

        // Delete existing entries
        await connection.query('DELETE FROM sarga_daily_work_entries WHERE report_id = ?', [reportId]);
        await connection.query('DELETE FROM sarga_daily_expenses WHERE report_id = ?', [reportId]);
        await connection.query('DELETE FROM sarga_daily_credit_transactions WHERE report_id = ?', [reportId]);

        // Insert work entries
        for (const entry of work_entries) {
            await connection.query(
                `INSERT INTO sarga_daily_work_entries 
         (report_id, work_name, work_details, payment_type, cash_amount, upi_amount, amount_collected, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [reportId, entry.work_name, entry.work_details, entry.payment_type,
                    entry.cash_amount || 0, entry.upi_amount || 0, entry.amount_collected, entry.remarks]
            );
        }

        // Insert expenses
        for (const expense of expenses) {
            await connection.query(
                `INSERT INTO sarga_daily_expenses (report_id, expense_description, amount, payment_method, remarks)
         VALUES (?, ?, ?, ?, ?)`,
                [reportId, expense.expense_description, expense.amount, expense.payment_method, expense.remarks]
            );
        }

        // Insert credit transactions
        for (const txn of credit_transactions) {
            await connection.query(
                `INSERT INTO sarga_daily_credit_transactions 
         (report_id, transaction_type, customer_name, customer_phone, amount, remarks)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [reportId, txn.transaction_type, txn.customer_name, txn.customer_phone, txn.amount, txn.remarks]
            );
        }

        // Update staff attendance
        for (const att of staff_attendance) {
            await connection.query(
                `INSERT INTO sarga_staff_attendance 
         (staff_id, attendance_date, status, in_time, out_time, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         status = VALUES(status), in_time = VALUES(in_time), out_time = VALUES(out_time), notes = VALUES(notes)`,
                [att.staff_id, report_date, att.status, att.in_time, att.out_time, att.notes, user.id]
            );
        }

        // Calculate totals
        const [totals] = await connection.query(
            `SELECT 
        COALESCE(SUM(amount_collected), 0) as total_collected
       FROM sarga_daily_work_entries WHERE report_id = ?`,
            [reportId]
        );

        const [expenseTotals] = await connection.query(
            `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM sarga_daily_expenses WHERE report_id = ?`,
            [reportId]
        );

        const [creditTotals] = await connection.query(
            `SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'Credit Out' THEN amount ELSE 0 END), 0) as credit_out,
        COALESCE(SUM(CASE WHEN transaction_type = 'Credit In' THEN amount ELSE 0 END), 0) as credit_in
       FROM sarga_daily_credit_transactions WHERE report_id = ?`,
            [reportId]
        );

        const closingBalance = parseFloat(opening_balance) +
            parseFloat(totals[0].total_collected) +
            parseFloat(creditTotals[0].credit_in) -
            parseFloat(expenseTotals[0].total_expenses) -
            parseFloat(creditTotals[0].credit_out);

        // Update report totals
        await connection.query(
            `UPDATE sarga_daily_report_offset 
       SET total_collected = ?, total_expenses = ?, total_credit_out = ?, 
           total_credit_in = ?, closing_balance = ?
       WHERE id = ?`,
            [totals[0].total_collected, expenseTotals[0].total_expenses,
            creditTotals[0].credit_out, creditTotals[0].credit_in, closingBalance, reportId]
        );

        await connection.commit();

        // Fetch and return complete report
        const [finalReport] = await connection.query(
            `SELECT dr.*, b.name as branch_name
       FROM sarga_daily_report_offset dr
       LEFT JOIN sarga_branches b ON dr.branch_id = b.id
       WHERE dr.id = ?`,
            [reportId]
        );

        auditLog(req.user.id, 'DAILY_REPORT_SAVE', `Saved offset daily report for ${report_date}, branch ${branchId}`, { entity_type: 'daily_report', entity_id: reportId });
        res.json(finalReport[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error saving offset report:', error);
        res.status(500).json({ error: 'Failed to save report' });
    } finally {
        connection.release();
    }
});

// ==================== FINALIZE REPORT ====================
router.post('/offset/:id/finalize', auth.authenticate, auth.requireRole(['Admin', 'Accountant']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        await pool.query(
            `UPDATE sarga_daily_report_offset 
       SET status = 'Finalized', finalized_by = ?, finalized_at = NOW()
       WHERE id = ?`,
            [user.id, id]
        );

        auditLog(req.user.id, 'DAILY_REPORT_FINALIZE', `Finalized daily report #${id}`, { entity_type: 'daily_report', entity_id: id });
        res.json({ message: 'Report finalized successfully' });
    } catch (error) {
        console.error('Error finalizing report:', error);
        res.status(500).json({ error: 'Failed to finalize report' });
    }
});

module.exports = router;


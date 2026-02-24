const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog } = require('../helpers');
const { validate, addPaymentSchema } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// --- PAYMENT ROUTES ---

// List Payments
router.get('/payments', authenticateToken, async (req, res) => {
    const { branch_id, type, startDate, endDate } = req.query;
    const { page, limit, offset } = parsePagination(req);
    const usePagination = !!req.query.page;
    try {
        let where = '';
        const params = [];
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            where += " AND p.branch_id = ?";
            params.push(branchId);
        } else if (branch_id) {
            where += " AND p.branch_id = ?";
            params.push(branch_id);
        }
        if (type) {
            where += " AND p.type = ?";
            params.push(type);
        }
        if (startDate) {
            where += " AND p.payment_date >= ?";
            params.push(startDate);
        }
        if (endDate) {
            where += " AND p.payment_date <= ?";
            params.push(endDate);
        }

        const baseFrom = `
            FROM sarga_payments p
            JOIN sarga_branches b ON p.branch_id = b.id
            LEFT JOIN sarga_vendors v ON p.vendor_id = v.id
            WHERE 1=1 ${where}`;

        if (usePagination) {
            const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseFrom}`, params);
            const [rows] = await pool.query(`SELECT p.*, b.name as branch_name, v.name as vendor_name ${baseFrom} ORDER BY p.payment_date DESC, p.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
            return res.json(paginatedResponse(rows, cnt, page, limit));
        }

        const [rows] = await pool.query(`SELECT p.*, b.name as branch_name, v.name as vendor_name ${baseFrom} ORDER BY p.payment_date DESC, p.created_at DESC`, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Payment
router.post('/payments', authenticateToken, validate(addPaymentSchema), async (req, res) => {
    const { branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, vendor_id, period_start, period_end, bill_total_amount, is_partial_payment } = req.body;

    // Validate "Both" payment method
    if (payment_method === 'Both') {
        const cash = Number(cash_amount) || 0;
        const upi = Number(upi_amount) || 0;
        const total = Number(amount) || 0;

        if (Math.abs(cash + upi - total) > 0.01) {
            return res.status(400).json({ message: 'Cash + UPI must equal total amount' });
        }
    }

    try {
        let finalBranchId = req.user.role === 'Admin' ? branch_id : await getUserBranchId(req.user.id);
        if (!finalBranchId) finalBranchId = await getUserBranchId(req.user.id);

        // Convert datetime-local format (YYYY-MM-DDTHH:MM) to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
        let mysqlDateTime = payment_date;
        if (payment_date && payment_date.includes('T')) {
            mysqlDateTime = payment_date.replace('T', ' ') + ':00';
        } else if (payment_date && !payment_date.includes(' ') && payment_date.length === 10) {
            // Date-only format (YYYY-MM-DD) — append current time
            mysqlDateTime = payment_date + ' ' + new Date().toTimeString().slice(0, 8);
        }

        // Determine payment status for partial payments
        let paymentStatus = 'Fully Paid';
        if (is_partial_payment && bill_total_amount && Number(bill_total_amount) > 0) {
            paymentStatus = Number(amount) >= Number(bill_total_amount) ? 'Fully Paid' : 'Partially Paid';
        }

        const [result] = await pool.query(
            `INSERT INTO sarga_payments 
            (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, vendor_id, period_start, period_end, staff_id, bill_total_amount, is_partial_payment, payment_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            , [
                finalBranchId,
                type,
                payee_name,
                amount,
                payment_method,
                Number(cash_amount) || 0,
                Number(upi_amount) || 0,
                reference_number,
                description,
                mysqlDateTime,
                vendor_id || null,
                period_start || null,
                period_end || null,
                req.body.staff_id || null,
                Number(bill_total_amount) || null,
                is_partial_payment ? 1 : 0,
                paymentStatus
            ]
        );

        // Sync with Staff Salary Payments if applicable
        if (type === 'Salary' && req.body.staff_id) {
            await pool.query(
                `INSERT INTO sarga_staff_salary_payments 
                (staff_id, payment_date, payment_amount, payment_method, reference_number, notes, created_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.body.staff_id,
                    mysqlDateTime,
                    amount,
                    payment_method,
                    reference_number,
                    description,
                    req.user.id
                ]
            );
        }

        // Track payment frequency for "Other" payments to suggest adding as vendor
        if (type === 'Other' || type === 'Miscellaneous') {
            const expensesRouter = require('./expenses');
            if (expensesRouter.trackPaymentFrequency) {
                await expensesRouter.trackPaymentFrequency(payee_name, type, amount);
            }
        }

        auditLog(req.user.id, 'PAYMENT_ADD', `Added ${type} payment of ${amount} to ${payee_name}`);
        res.status(201).json({ id: result.insertId, message: 'Payment recorded successfully' });
    } catch (err) {
        console.error('Payment creation error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Payment (Admin Only)
router.delete('/payments/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query("DELETE FROM sarga_payments WHERE id = ?", [req.params.id]);
        auditLog(req.user.id, 'PAYMENT_DELETE', `Deleted payment record ${req.params.id}`);
        res.json({ message: 'Payment record deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- PAYMENT METHOD ROUTES ---

// List Payment Methods
router.get('/payment-methods', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sarga_payment_methods WHERE is_active = 1 ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Payment Method (Admin Only)
router.post('/payment-methods', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'Payment method name is required' });
    }
    try {
        const [result] = await pool.query(
            "INSERT INTO sarga_payment_methods (name, is_active) VALUES (?, 1)",
            [String(name).trim()]
        );
        auditLog(req.user.id, 'PAYMENT_METHOD_ADD', `Added payment method: ${name}`);
        res.status(201).json({ id: result.insertId, message: 'Payment method added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Payment method already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Payment Method (Admin Only)
router.put('/payment-methods/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'Payment method name is required' });
    }
    try {
        await pool.query(
            "UPDATE sarga_payment_methods SET name = ? WHERE id = ?",
            [String(name).trim(), id]
        );
        auditLog(req.user.id, 'PAYMENT_METHOD_UPDATE', `Updated payment method ${id} to: ${name}`);
        res.json({ message: 'Payment method updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Payment method already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Payment Method (Admin Only - Soft Delete)
router.delete('/payment-methods/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("UPDATE sarga_payment_methods SET is_active = 0 WHERE id = ?", [id]);
        auditLog(req.user.id, 'PAYMENT_METHOD_DELETE', `Deleted payment method ${id}`);
        res.json({ message: 'Payment method deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;

const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog, normalizeMobile } = require('../helpers');
const { validate, addCustomerSchema } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// --- CUSTOMER ROUTES ---

// List Customers
router.get('/customers', authenticateToken, async (req, res) => {
    try {
        const { search, type: typeFilter } = req.query;
        const { page, limit, offset } = parsePagination(req);
        const usePagination = !!req.query.page;

        let where = '';
        const params = [];

        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            where += ' AND branch_id = ?';
            params.push(branchId);
        }
        if (typeFilter) {
            where += ' AND type = ?';
            params.push(typeFilter);
        }
        if (search) {
            where += ' AND (name LIKE ? OR mobile LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s);
        }

        const baseFrom = `FROM sarga_customers WHERE 1=1 ${where}`;

        if (usePagination) {
            const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseFrom}`, params);
            const [rows] = await pool.query(`SELECT * ${baseFrom} ORDER BY name ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
            return res.json(paginatedResponse(rows, cnt, page, limit));
        }

        const [rows] = await pool.query(`SELECT * ${baseFrom} ORDER BY name ASC`, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Get Customer Details
router.get('/customers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            const [rows] = await pool.query("SELECT * FROM sarga_customers WHERE id = ? AND branch_id = ?", [id, branchId]);
            if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });
            return res.json(rows[0]);
        }
        const [rows] = await pool.query("SELECT * FROM sarga_customers WHERE id = ?", [id]);
        if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Customer
router.post('/customers', authenticateToken, validate(addCustomerSchema), async (req, res) => {
    const { mobile, name, type, email, gst, address } = req.body;
    const normalizedMobile = normalizeMobile(mobile);

    if (normalizedMobile.length !== 10) {
        return res.status(400).json({ message: 'Mobile number must be 10 digits' });
    }

    try {
        const branchId = req.user.role === 'Admin' ? null : await getUserBranchId(req.user.id);
        const [result] = await pool.query(
            "INSERT INTO sarga_customers (mobile, name, type, email, gst, address, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [normalizedMobile, name, type, email, gst, address, branchId]
        );
        auditLog(req.user.id, 'CUSTOMER_ADD', `Added customer ${name} (${normalizedMobile})`);
        res.status(201).json({ id: result.insertId, message: 'Customer added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Mobile number already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Customer
router.put('/customers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { mobile, name, type, email, gst, address } = req.body;
    const normalizedMobile = normalizeMobile(mobile);

    if (normalizedMobile.length !== 10) {
        return res.status(400).json({ message: 'Mobile number must be 10 digits' });
    }

    try {
        await pool.query(
            "UPDATE sarga_customers SET mobile = ?, name = ?, type = ?, email = ?, gst = ?, address = ? WHERE id = ?",
            [normalizedMobile, name, type, email, gst, address, id]
        );
        auditLog(req.user.id, 'CUSTOMER_UPDATE', `Updated customer ${id} (${name})`);
        res.json({ message: 'Customer details updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Mobile number already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Customer
router.delete('/customers/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query("DELETE FROM sarga_customers WHERE id = ?", [id]);
        auditLog(req.user.id, 'CUSTOMER_DELETE', `Deleted customer ${id}`);
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// ========== CUSTOMER DASHBOARD (Aggregated) ==========
router.get('/customers/:id/dashboard', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Customer profile
        const [custRows] = await pool.query("SELECT * FROM sarga_customers WHERE id = ?", [id]);
        if (!custRows[0]) return res.status(404).json({ message: 'Customer not found' });
        const customer = custRows[0];

        // 2. All jobs for this customer
        const [jobs] = await pool.query(`
            SELECT j.*, b.name as branch_name
            FROM sarga_jobs j
            LEFT JOIN sarga_branches b ON j.branch_id = b.id
            WHERE j.customer_id = ?
            ORDER BY j.created_at DESC
        `, [id]);

        // 3. Order summary KPIs
        const totalOrders = jobs.length;
        const totalSpent = jobs.reduce((s, j) => s + Number(j.total_amount || 0), 0);
        const pendingOrders = jobs.filter(j => j.status === 'Pending').length;
        const processingOrders = jobs.filter(j => j.status === 'Processing').length;
        const completedOrders = jobs.filter(j => j.status === 'Completed' || j.status === 'Delivered').length;
        const cancelledOrders = jobs.filter(j => j.status === 'Cancelled').length;
        const lastOrderDate = jobs.length > 0 ? jobs[0].created_at : null;

        // 4. All payments
        const [payments] = await pool.query(`
            SELECT * FROM sarga_customer_payments
            WHERE customer_id = ?
            ORDER BY payment_date DESC, created_at DESC
        `, [id]);

        const totalBilled = jobs.reduce((s, j) => s + Number(j.total_amount || 0), 0);
        const totalPaid = jobs.reduce((s, j) => s + Number(j.advance_paid || 0), 0);
        const outstandingBalance = jobs.reduce((s, j) => {
            const total = Number(j.total_amount || 0);
            const advance = Number(j.advance_paid || 0);
            const bal = Math.max(total - advance, 0);
            return s + (bal < 1 ? 0 : bal);
        }, 0);
        const lastPaymentDate = payments.length > 0 ? payments[0].payment_date : null;

        // Payment method breakdown
        const methodBreakdown = {};
        payments.forEach(p => {
            const m = p.payment_method || 'Cash';
            methodBreakdown[m] = (methodBreakdown[m] || 0) + Number(p.advance_paid || 0);
        });

        // 5. Staff assignments / order tracking for recent jobs
        const recentJobIds = jobs.slice(0, 20).map(j => j.id);
        let assignments = [];
        if (recentJobIds.length > 0) {
            const [rows] = await pool.query(`
                SELECT jsa.job_id, jsa.\`role\`, jsa.status as assignment_status,
                       jsa.assigned_date, jsa.completed_date,
                       s.name as staff_name
                FROM sarga_job_staff_assignments jsa
                LEFT JOIN sarga_staff s ON jsa.staff_id = s.id
                WHERE jsa.job_id IN (?)
                ORDER BY jsa.assigned_date DESC
            `, [recentJobIds]);
            assignments = rows;
        }

        // 6. Unique products ordered (for reorder)
        const productMap = {};
        jobs.forEach(j => {
            if (j.product_id && !productMap[j.product_id]) {
                productMap[j.product_id] = {
                    product_id: j.product_id,
                    job_name: j.job_name,
                    last_quantity: Number(j.quantity),
                    last_unit_price: Number(j.unit_price),
                    last_total: Number(j.total_amount),
                    last_ordered: j.created_at,
                    order_count: 0
                };
            }
            if (j.product_id && productMap[j.product_id]) {
                productMap[j.product_id].order_count += 1;
            }
        });
        const reorderItems = Object.values(productMap).sort((a, b) => b.order_count - a.order_count);

        res.json({
            customer,
            summary: {
                totalOrders,
                totalSpent,
                pendingOrders,
                processingOrders,
                completedOrders,
                cancelledOrders,
                lastOrderDate
            },
            payments: {
                records: payments,
                totalPaid,
                totalBilled,
                outstandingBalance,
                lastPaymentDate,
                methodBreakdown
            },
            jobs,
            assignments,
            reorderItems
        });
    } catch (err) {
        console.error('Customer dashboard error:', err);
        res.status(500).json({ message: 'Failed to load customer dashboard' });
    }
});

module.exports = router;

const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog, normalizeMobileWithCountry } = require('../helpers');
const { attachNormalizedMobile } = require('../middleware/phone');
const { branchFilter } = require('../middleware/branchFilter');
const { validate, addCustomerSchema } = require('../middleware/validate');
const { paginate } = require('../helpers/pagination');
// Redis caching via customerCache (middleware/cache.js) — node-cache removed
const { customerCache } = require('../middleware/cache');
const { invalidateCustomerCache, invalidateDashboardCache } = require('../services/cacheService');
const logger = require('../helpers/logger');

const CUSTOMER_COLUMNS = [
    'id',
    'mobile',
    'name',
    'type',
    'email',
    'gst',
    'address',
    'branch_id',
    'client_type',
    'internal_branch',
    'created_at',
    'updated_at'
].join(', ');

const CUSTOMER_PAYMENT_SUMMARY_COLUMNS = [
    'id',
    'customer_id',
    'total_amount',
    'advance_paid',
    'balance_amount',
    'payment_method',
    'payment_date',
    'created_at'
].join(', ');

// --- CUSTOMER ROUTES ---

// List Customers
router.get('/customers', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office', 'Designer'), customerCache(), async (req, res) => {
    try {
        const { search, type: typeFilter, export: exportMode, filter: exportFilter } = req.query;
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

        let where = '';
        const params = [];

        // By default, hide internal customers from the general customers list.
        // Pass `include_internal=1` from the client when internal customers are required (e.g., Internal Billing page).
        const includeInternal = req.query.include_internal === '1' || req.query.include_internal === 'true';
        if (!includeInternal) {
            where += " AND COALESCE(client_type, '') != 'internal'";
        }

        // Customers are a global entity; we allow cross-branch lookup by default (cross_branch !== '0')
        // to avoid duplicate mobile conflicts when customers visit different branches.
        const crossBranch = req.query.cross_branch !== '0';
        if (!crossBranch) {
            const branchScope = await branchFilter(req, { column: 'branch_id', allowPrivilegedQuery: false });
            where += branchScope.clause;
            params.push(...branchScope.params);
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

        // Export mode: return all customers without pagination
        if (exportMode === '1') {
            let filterWhere = '';
            if (exportFilter === 'due') {
                filterWhere = "AND (SELECT COALESCE(SUM(balance_amount), 0) FROM sarga_jobs WHERE customer_id = sarga_customers.id AND status != 'Cancelled') > 0";
            } else if (exportFilter === 'has_orders') {
                filterWhere = "AND EXISTS (SELECT 1 FROM sarga_jobs WHERE customer_id = sarga_customers.id)";
            } else if (exportFilter === 'new') {
                filterWhere = 'AND DATE(created_at) = CURDATE()';
            }
            const [rows] = await pool.query(`
                SELECT id, mobile, name, type, email, gst, address, branch_id, client_type, internal_branch, created_at, updated_at,
                       (SELECT COALESCE(SUM(balance_amount), 0) FROM sarga_jobs WHERE customer_id = sarga_customers.id AND status != 'Cancelled') AS outstanding_balance,
                       (SELECT MAX(created_at) FROM sarga_jobs WHERE customer_id = sarga_customers.id) AS last_order_date
                ${baseFrom} ${filterWhere}
                ORDER BY (client_type = 'internal') DESC, name ASC
            `, params);
            return res.json(rows);
        }

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
        const [rows] = await pool.query(`
            SELECT id, mobile, name, type, email, gst, address, branch_id, client_type, internal_branch, created_at, updated_at,
                   (SELECT COALESCE(SUM(balance_amount), 0) FROM sarga_jobs WHERE customer_id = sarga_customers.id AND status != 'Cancelled') AS outstanding_balance,
                   (SELECT MAX(created_at) FROM sarga_jobs WHERE customer_id = sarga_customers.id) AS last_order_date
            ${baseFrom}
            ORDER BY (client_type = 'internal') DESC, name ASC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        res.json(response(rows, total));
    } catch (err) {
        logger.error('List customers error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Get Customer Details
router.get('/customers/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { id } = req.params;
    try {
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            // Allow looking up a customer by ID regardless of branch (needed for cross-branch payments)
            const [rows] = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM sarga_customers WHERE id = ?`, [id]);
            if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });
            return res.json(rows[0]);
        }
        const [rows] = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM sarga_customers WHERE id = ?`, [id]);
        if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });
        res.json(rows[0]);
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Customer
router.post('/customers', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addCustomerSchema), attachNormalizedMobile('mobile', 'countryCode'), async (req, res) => {
    const { mobile, countryCode, name, type, email, gst, address } = req.body;

    // Normalize mobile using optional countryCode (handles region codes and calling codes).
    const normalizedMobile = normalizeMobileWithCountry(mobile, countryCode);
    if (!normalizedMobile || (!(normalizedMobile.startsWith('+') || normalizedMobile.length === 10))) {
        return res.status(400).json({ message: 'Invalid mobile number' });
    }

    try {
        const { branchId } = await branchFilter(req, { allowPrivilegedQuery: false });
        const [result] = await pool.query(
            "INSERT INTO sarga_customers (mobile, name, type, email, gst, address, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [normalizedMobile, name, type, email, gst, address, branchId]
        );
        auditLog(req.user.id, 'CUSTOMER_ADD', `Added customer ${name} (${normalizedMobile})`);
        res.status(201).json({ id: result.insertId, message: 'Customer added successfully' });
        auditLog(req.user.id, 'CUSTOMER_ADD', `Added customer: ${name}`, { entity_type: 'customer', entity_id: result.insertId });
        invalidateCustomerCache().catch(() => {});
        invalidateDashboardCache().catch(() => {});
    } catch (err) {
        logger.error('Add Customer error:', err);
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Customer mobile number already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Customer
router.put('/customers/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), attachNormalizedMobile('mobile', 'countryCode'), async (req, res) => {
    const { id } = req.params;
    const { mobile, countryCode, name, type, email, gst, address } = req.body;

    // Normalize mobile using optional countryCode (handles region codes and calling codes).
    const normalizedMobile = normalizeMobileWithCountry(mobile, countryCode);
    if (!normalizedMobile || (!(normalizedMobile.startsWith('+') || normalizedMobile.length === 10))) {
        return res.status(400).json({ message: 'Invalid mobile number' });
    }

    try {
        // Branch ownership check: non-admin/accountant users can only update customers in their own branch or global ones
        const branchScope = await branchFilter(req, { allowPrivilegedQuery: false });
        if (!branchScope.isPrivileged) {
            const branchId = branchScope.branchId;
            const [check] = await pool.query("SELECT id FROM sarga_customers WHERE id = ? AND (branch_id = ? OR branch_id IS NULL)", [id, branchId]);
            if (!check[0]) return res.status(403).json({ message: 'Access denied. Customer belongs to a different branch.' });
        }

        await pool.query(
            "UPDATE sarga_customers SET mobile = ?, name = ?, type = ?, email = ?, gst = ?, address = ? WHERE id = ?",
            [normalizedMobile, name, type, email, gst, address, id]
        );
        auditLog(req.user.id, 'CUSTOMER_UPDATE', `Updated customer ${id} (${name})`);
        res.json({ message: 'Customer details updated' });
        invalidateCustomerCache().catch(() => {});
        invalidateDashboardCache().catch(() => {});
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Mobile number already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Customer
router.delete('/customers/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;

    try {
        // Check for linked jobs or payments before deleting
        const [[{ jobCount }]] = await pool.query("SELECT COUNT(*) as jobCount FROM sarga_jobs WHERE customer_id = ?", [id]);
        if (jobCount > 0) {
            return res.status(409).json({ message: `Cannot delete customer: ${jobCount} job(s) are linked to this customer. Remove them first.` });
        }

        await pool.query("DELETE FROM sarga_customers WHERE id = ?", [id]);
        auditLog(req.user.id, 'CUSTOMER_DELETE', `Deleted customer ${id}`);
        res.json({ message: 'Customer deleted successfully' });
        invalidateCustomerCache().catch(() => {});
        invalidateDashboardCache().catch(() => {});
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
            return res.status(409).json({ message: 'Cannot delete customer: linked records exist.' });
        }
        res.status(500).json({ message: 'Database error' });
    }
});

// ========== CUSTOMER DASHBOARD (Aggregated) ==========
router.get('/customers/:id/dashboard', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Customer profile
        const [custRows] = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM sarga_customers WHERE id = ?`, [id]);
        if (!custRows[0]) return res.status(404).json({ message: 'Customer not found' });
        const customer = custRows[0];

        // 2. All jobs for this customer
        const [jobs] = await pool.query(`
            SELECT j.id, j.job_number, j.job_name, j.total_amount, j.advance_paid, j.balance_amount, j.status, j.created_at, j.payment_id, b.name as branch_name
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

        // 4. Payments (support optional pagination via ?page & ?limit)
        const { limit: _limit, offset: _offset, page: _page } = paginate(req.query, req.query.page, req.query.limit);
        let payments = [];
        let paymentMeta = {};

        if (req.query.page || req.query.limit) {
            const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM sarga_customer_payments WHERE customer_id = ?`, [id]);
            const totalPayments = total || 0;
            const [rows] = await pool.query(
                `SELECT ${CUSTOMER_PAYMENT_SUMMARY_COLUMNS} FROM sarga_customer_payments WHERE customer_id = ? ORDER BY payment_date DESC, created_at DESC LIMIT ? OFFSET ?`,
                [id, _limit, _offset]
            );
            payments = rows;
            paymentMeta = {
                total: totalPayments,
                page: _page,
                limit: _limit,
                totalPages: Math.ceil(totalPayments / (_limit || 1)),
                hasNext: _page < Math.ceil(totalPayments / (_limit || 1)),
                hasPrev: _page > 1
            };
        } else {
            const [rows] = await pool.query(`
                SELECT ${CUSTOMER_PAYMENT_SUMMARY_COLUMNS} FROM sarga_customer_payments
                WHERE customer_id = ?
                ORDER BY payment_date DESC, created_at DESC
            `, [id]);
            payments = rows;
        }

        const totalBilled = jobs.reduce((s, j) => s + Number(j.total_amount || 0), 0);
        const totalPaid = jobs.reduce((s, j) => s + Number(j.advance_paid || 0), 0);
        const outstandingBalance = jobs.reduce((s, j) => {
            if (j.status === 'Cancelled') return s;
            return s + (Number(j.balance_amount) || 0);
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
            payments: Object.assign({
                records: payments,
                totalPaid,
                totalBilled,
                outstandingBalance,
                lastPaymentDate,
                methodBreakdown
            }, paymentMeta),
            jobs,
            assignments,
            reorderItems
        });
    } catch (err) {
        logger.error('Customer dashboard error:', err);
        res.status(500).json({ message: 'Failed to load customer dashboard' });
    }
});

module.exports = router;


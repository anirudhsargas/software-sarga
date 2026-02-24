const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog, getUsageMap, sortByPositionThenName, sortByUsageThenPosition, bumpUsageForUser } = require('../helpers');
const { validate, addJobSchema } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// --- HELPER: PRICING ENGINE ---
const calculateProductPrice = (product, quantity, slabs) => {
    let result = { unit_price: 0, total: 0 };
    const qty = Number(quantity) || 0;

    if (product.calculation_type === 'Normal') {
        const rate = slabs && slabs.length > 0 ? slabs[0].unit_rate : 0;
        result = { unit_price: rate, total: rate * qty };
    } else if (product.calculation_type === 'Slab') {
        // Linear Interpolation
        if (slabs && slabs.length > 0) {
            const sortedSlabs = [...slabs].sort((a, b) => a.min_qty - b.min_qty);
            const exactMatch = sortedSlabs.find(s => Number(s.min_qty) === qty);

            if (exactMatch) {
                result.total = Number(exactMatch.base_value);
            } else if (qty < sortedSlabs[0].min_qty) {
                result.total = Number(sortedSlabs[0].base_value);
            } else if (qty > sortedSlabs[sortedSlabs.length - 1].min_qty) {
                const lastSlab = sortedSlabs[sortedSlabs.length - 1];
                const lastMin = Number(lastSlab.min_qty) || 0;
                const lastBase = Number(lastSlab.base_value) || 0;
                const lastUnit = lastMin > 0 ? lastBase / lastMin : 0;
                result.total = lastUnit * qty;
            } else {
                for (let i = 0; i < sortedSlabs.length - 1; i++) {
                    const s1 = sortedSlabs[i];
                    const s2 = sortedSlabs[i + 1];
                    if (qty > s1.min_qty && qty < s2.min_qty) {
                        const ratio = (qty - s1.min_qty) / (s2.min_qty - s1.min_qty);
                        result.total = Number(s1.base_value) + ratio * (s2.base_value - s1.base_value);
                        break;
                    }
                }
            }
            result.unit_price = qty > 0 ? result.total / qty : 0;
        }
    } else if (product.calculation_type === 'Range') {
        if (slabs && slabs.length > 0) {
            const sortedSlabs = [...slabs].sort((a, b) => a.min_qty - b.min_qty);
            const matched = sortedSlabs.find(s => {
                const maxQty = s.max_qty === null || s.max_qty === undefined || s.max_qty === '' ? Infinity : Number(s.max_qty);
                return qty >= Number(s.min_qty) && qty <= maxQty;
            });
            if (matched) {
                const rate = Number(matched.unit_rate) || 0;
                result = { unit_price: rate, total: rate * qty };
            } else {
                const lastSlab = sortedSlabs[sortedSlabs.length - 1];
                const maxQty = lastSlab?.max_qty === null || lastSlab?.max_qty === undefined || lastSlab?.max_qty === ''
                    ? Infinity
                    : Number(lastSlab.max_qty);
                if (qty > maxQty) {
                    const rate = Number(lastSlab?.unit_rate) || 0;
                    result = { unit_price: rate, total: rate * qty };
                }
            }
        }
    }

    // Add Paper Rate Add-on if applicable (Slab only)
    if (product.calculation_type === 'Slab' && product.has_paper_rate && product.paper_rate > 0) {
        result.total += (Number(product.paper_rate) * qty);
        result.unit_price = qty > 0 ? result.total / qty : 0;
    }

    if (product.calculation_type === 'Slab' && product.has_double_side_rate) {
        const doubleSideRate = Number(slabs?.[0]?.double_side_unit_rate) || 0;
        if (doubleSideRate > 0) {
            result.total += (doubleSideRate * qty);
            result.unit_price = qty > 0 ? result.total / qty : 0;
        }
    }

    return result;
};

// --- JOB ROUTES ---

// List All Jobs (with Customer details)
router.get('/jobs', authenticateToken, async (req, res) => {
    try {
        const { search, status, branch_id: qBranch } = req.query;
        const { page, limit, offset } = parsePagination(req);
        const usePagination = !!req.query.page;

        let where = '';
        const params = [];

        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            where += ' AND j.branch_id = ?';
            params.push(branchId);
        } else if (qBranch) {
            where += ' AND j.branch_id = ?';
            params.push(qBranch);
        }
        if (status) {
            where += ' AND j.status = ?';
            params.push(status);
        }
        if (search) {
            where += ' AND (COALESCE(c.name, "Walk-in") LIKE ? OR c.mobile LIKE ? OR j.id LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        const baseFrom = `
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            LEFT JOIN sarga_branches b ON j.branch_id = b.id
            WHERE 1=1 ${where}`;

        if (usePagination) {
            const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseFrom}`, params);
            const [rows] = await pool.query(`
                SELECT j.*, COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile, b.name as branch_name
                ${baseFrom} ORDER BY j.created_at DESC LIMIT ? OFFSET ?
            `, [...params, limit, offset]);
            return res.json(paginatedResponse(rows, cnt, page, limit));
        }

        const [rows] = await pool.query(`
            SELECT j.*, COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile, b.name as branch_name
            ${baseFrom} ORDER BY j.created_at DESC
        `, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

    // Get completed jobs for a specific date (for daily report sync)
    router.get('/jobs/completed-by-date', authenticateToken, async (req, res) => {
        try {
            const { date, branch_id: qBranch } = req.query;

            if (!date) {
                return res.status(400).json({ message: 'Date parameter is required' });
            }

            let where = ' AND (j.status = ? OR j.status = ?)';
            const params = ['Completed', 'Delivered'];

            // Filter by branch
            if (req.user.role !== 'Admin') {
                const branchId = await getUserBranchId(req.user.id);
                where += ' AND j.branch_id = ?';
                params.push(branchId);
            } else if (qBranch) {
                where += ' AND j.branch_id = ?';
                params.push(qBranch);
            }

            // Filter by date - jobs updated to Completed/Delivered on this date
            where += ' AND DATE(j.updated_at) = ?';
            params.push(date);

            const [rows] = await pool.query(`
            SELECT 
                j.id,
                j.job_number,
                j.job_name,
                j.description,
                j.total_amount,
                j.advance_paid,
                j.balance_amount,
                j.payment_status,
                j.status,
                j.updated_at,
                COALESCE(c.name, 'Walk-in') as customer_name,
                c.mobile as customer_mobile
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            WHERE 1=1 ${where}
            ORDER BY j.updated_at DESC
        `, params);

            res.json(rows);
        } catch (err) {
            console.error('Error fetching completed jobs:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List Jobs for a specific Customer
    router.get('/customers/:id/jobs', authenticateToken, async (req, res) => {
        try {
            console.log('Fetching jobs for customer:', req.params.id);
            const [rows] = await pool.query("SELECT * FROM sarga_jobs WHERE customer_id = ? ORDER BY created_at DESC", [req.params.id]);
            console.log('Found jobs:', rows.length);
            res.json(rows);
        } catch (err) {
            console.error('Error fetching customer jobs:', err);
            res.status(500).json({ message: 'Database error', error: err.message });
        }
    });

    // Bulk create jobs for multiple line items
    router.post('/jobs/bulk', authenticateToken, async (req, res) => {
        const { customer_id, order_lines } = req.body;

        if (!Array.isArray(order_lines) || order_lines.length === 0) {
            return res.status(400).json({ message: 'Order lines are required' });
        }
        if (order_lines.length > 50) {
            return res.status(400).json({ message: 'Too many order lines (max 50)' });
        }

        // Validate each order line
        for (let i = 0; i < order_lines.length; i++) {
            const line = order_lines[i] || {};
            const qty = Number(line.quantity);
            const price = Number(line.unit_price);
            const total = Number(line.total_amount);
            if (!qty || qty <= 0) {
                return res.status(400).json({ message: `Line ${i + 1}: Quantity must be greater than 0` });
            }
            if (price < 0) {
                return res.status(400).json({ message: `Line ${i + 1}: Unit price cannot be negative` });
            }
            if (total < 0) {
                return res.status(400).json({ message: `Line ${i + 1}: Total amount cannot be negative` });
            }
            if (total > 10000000) {
                return res.status(400).json({ message: `Line ${i + 1}: Total amount exceeds limit` });
            }
        }

        try {
            const branchId = req.user.role === 'Admin' ? null : await getUserBranchId(req.user.id);
            const created = [];

            for (let i = 0; i < order_lines.length; i += 1) {
                const line = order_lines[i] || {};
                const jobNumber = `J-${Date.now().toString().slice(-8)}-${i + 1}`;
                const total = Number(line.total_amount) || 0;

                try {
                    const [result] = await pool.query(
                        `INSERT INTO sarga_jobs
                    (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            customer_id || null,
                            line.product_id || null,
                            branchId,
                            jobNumber,
                            line.product_name || line.job_name || 'Job',
                            line.description || null,
                            Number(line.quantity) || 1,
                            Number(line.unit_price) || 0,
                            total,
                            0,
                            total,
                            'Unpaid',
                            null,
                            JSON.stringify(line.applied_extras || [])
                        ]
                    );
                    created.push({ id: result.insertId, job_number: jobNumber });
                } catch (err) {
                    if (err.code === 'ER_BAD_FIELD_ERROR') {
                        const [result] = await pool.query(
                            `INSERT INTO sarga_jobs
                        (customer_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                customer_id || null,
                                branchId,
                                jobNumber,
                                line.product_name || line.job_name || 'Job',
                                line.description || null,
                                Number(line.quantity) || 1,
                                Number(line.unit_price) || 0,
                                total,
                                0,
                                total,
                                'Unpaid',
                                null
                            ]
                        );
                        created.push({ id: result.insertId, job_number: jobNumber });
                    } else {
                        throw err;
                    }
                }
            }

            res.status(201).json({ jobs: created });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Create Single Job
    router.post('/jobs', authenticateToken, validate(addJobSchema), async (req, res) => {
        const {
            customer_id, product_id, branch_id, job_name, description, quantity,
            unit_price, total_amount, advance_paid, delivery_date, applied_extras
        } = req.body;

        const balance_amount = (total_amount || 0) - (advance_paid || 0);
        const payment_status = advance_paid >= total_amount ? 'Paid' : (advance_paid > 0 ? 'Partial' : 'Unpaid');
        const job_number = `J-${Date.now().toString().slice(-8)}`;

        try {
            const [result] = await pool.query(
                `INSERT INTO sarga_jobs 
            (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                , [customer_id || null, product_id || null, branch_id || null, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date || null, JSON.stringify(applied_extras || [])]
            );

            if (product_id) {
                await bumpUsageForUser(req.user.id, product_id);
            }

            auditLog(req.user.id, 'JOB_CREATE', `Created job ${job_number} for customer ${customer_id || 'walk-in'} in branch ${branch_id}`);
            // Auto-calculate and store cost/profit
            const { calculateAndUpdateJobCost } = require('../helpers/jobCost');
            await calculateAndUpdateJobCost({
                id: result.insertId,
                product_id,
                quantity,
                total_amount
            });
            res.status(201).json({ id: result.insertId, job_number, message: 'Job created successfully' });
        } catch (err) {
            console.error("Job create error:", err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Fetch Hierarchy Tree
    router.get('/product-hierarchy', authenticateToken, async (req, res) => {
        try {
            // Always fetch usage map for the current user to personalize sorting
            const usageMap = await getUsageMap(req.user.id);

            const [categories] = await pool.query("SELECT * FROM sarga_product_categories");
            const [subcategories] = await pool.query("SELECT * FROM sarga_product_subcategories");
            const [products] = await pool.query("SELECT * FROM sarga_products");

            // Apply usage-based sorting for everyone
            const categorySorter = sortByUsageThenPosition(usageMap, 'category');
            const subcategorySorter = sortByUsageThenPosition(usageMap, 'subcategory');
            const productSorter = sortByUsageThenPosition(usageMap, 'product');

            const sortedCategories = [...categories].sort(categorySorter);

            const hierarchy = sortedCategories.map(cat => ({
                ...cat,
                subcategories: subcategories
                    .filter(sub => sub.category_id === cat.id)
                    .sort(subcategorySorter)
                    .map(sub => ({
                        ...sub,
                        products: products
                            .filter(p => p.subcategory_id === sub.id)
                            .sort(productSorter)
                    }))
            }));

            res.json(hierarchy);
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // --- JOB STAFF ASSIGNMENTS ---

    // Suggest staff for jobs by product usage
    router.get('/jobs/assignments/suggestions', authenticateToken, async (req, res) => {
        try {
            const rawIds = String(req.query.product_ids || '').split(',').map((v) => v.trim()).filter(Boolean);
            const productIds = rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
            const role = req.query.role ? String(req.query.role) : '';

            if (productIds.length === 0) {
                return res.json({ suggestions: {} });
            }

            const params = [...productIds];
            let branchFilter = '';
            let roleFilter = '';
            if (req.user.role !== 'Admin') {
                const branchId = await getUserBranchId(req.user.id);
                if (branchId) {
                    branchFilter = ' AND j.branch_id = ?';
                    params.push(branchId);
                }
            }
            if (role) {
                roleFilter = ' AND s.role = ? AND jsa.`role` = ?';
                params.push(role, role);
            }

            const [rows] = await pool.query(
                `SELECT j.product_id, jsa.staff_id, s.name, s.role,
                    COUNT(*) AS assigned_count, MAX(jsa.assigned_date) AS last_assigned
             FROM sarga_job_staff_assignments jsa
             INNER JOIN sarga_jobs j ON j.id = jsa.job_id
             INNER JOIN sarga_staff s ON s.id = jsa.staff_id
             WHERE j.product_id IN (${productIds.map(() => '?').join(',')})${branchFilter}${roleFilter}
             GROUP BY j.product_id, jsa.staff_id
             ORDER BY j.product_id, assigned_count DESC, last_assigned DESC`,
                params
            );

            const suggestions = {};
            for (const row of rows) {
                if (suggestions[row.product_id]) continue;
                suggestions[row.product_id] = {
                    staff_id: row.staff_id,
                    name: row.name,
                    role: row.role
                };
            }

            res.json({ suggestions });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Bulk assign staff to jobs
    router.post('/jobs/assignments/bulk', authenticateToken, async (req, res) => {
        const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];
        if (assignments.length === 0) {
            return res.status(400).json({ message: 'Assignments are required' });
        }

        const jobIds = Array.from(new Set(assignments
            .map((a) => Number(a?.job_id))
            .filter((id) => Number.isFinite(id))
        ));
        const staffIds = Array.from(new Set(assignments
            .map((a) => Number(a?.staff_id))
            .filter((id) => Number.isFinite(id))
        ));

        if (jobIds.length === 0 || staffIds.length === 0) {
            return res.status(400).json({ message: 'Valid job_id and staff_id are required' });
        }

        try {
            const [jobs] = await pool.query(
                `SELECT id, branch_id FROM sarga_jobs WHERE id IN (${jobIds.map(() => '?').join(',')})`,
                jobIds
            );
            const [staff] = await pool.query(
                `SELECT id, branch_id, role FROM sarga_staff WHERE id IN (${staffIds.map(() => '?').join(',')})`,
                staffIds
            );

            const jobMap = new Map(jobs.map((j) => [j.id, j]));
            const staffMap = new Map(staff.map((s) => [s.id, s]));

            let branchId = null;
            if (req.user.role !== 'Admin') {
                branchId = await getUserBranchId(req.user.id);
            }

            for (const assignment of assignments) {
                const jobId = Number(assignment.job_id);
                const staffId = Number(assignment.staff_id);
                const job = jobMap.get(jobId);
                const staffMember = staffMap.get(staffId);
                if (!job || !staffMember) {
                    return res.status(400).json({ message: 'Invalid job or staff selection' });
                }
                if (branchId && (job.branch_id !== branchId || staffMember.branch_id !== branchId)) {
                    return res.status(403).json({ message: 'Cross-branch assignments are not allowed' });
                }
            }

            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();

                for (const assignment of assignments) {
                    const jobId = Number(assignment.job_id);
                    const staffId = Number(assignment.staff_id);
                    const staffMember = staffMap.get(staffId);
                    const role = assignment.role || staffMember?.role || null;
                    await conn.query(
                        `DELETE FROM sarga_job_staff_assignments WHERE job_id = ? AND role = ?`,
                        [jobId, role]
                    );
                    await conn.query(
                        `INSERT INTO sarga_job_staff_assignments (job_id, staff_id, role, status)
                     VALUES (?, ?, ?, 'Pending')`,
                        [jobId, staffId, role]
                    );
                }

                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }

            res.json({ message: 'Assignments saved', count: assignments.length });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Get Single Job Details
    router.get('/jobs/:id', authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;

            const [jobs] = await pool.query(`
                SELECT j.*,
                    COALESCE(c.name, 'Walk-in') as customer_name,
                    c.mobile as customer_mobile,
                    c.email as customer_email,
                    c.address as customer_address,
                    b.name as branch_name,
                    p.name as product_name,
                    p.calculation_type
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                LEFT JOIN sarga_branches b ON j.branch_id = b.id
                LEFT JOIN sarga_products p ON j.product_id = p.id
                WHERE j.id = ?
            `, [id]);

            if (jobs.length === 0) {
                return res.status(404).json({ message: 'Job not found' });
            }

            const job = jobs[0];

            // Staff assignments
            const [assignments] = await pool.query(`
                SELECT jsa.*, s.name as staff_name, s.role as staff_role
                FROM sarga_job_staff_assignments jsa
                LEFT JOIN sarga_staff s ON s.id = jsa.staff_id
                WHERE jsa.job_id = ?
            `, [id]);

            // Payment history
            let payments = [];
            try {
                const [rows] = await pool.query(`
                    SELECT * FROM sarga_customer_payments
                    WHERE job_id = ?
                    ORDER BY payment_date DESC
                `, [id]);
                payments = rows;
            } catch (e) { /* column may not exist in older schema */ }

            // Status history
            let statusHistory = [];
            try {
                const [history] = await pool.query(`
                    SELECT ssh.*, s.name as staff_name
                    FROM sarga_job_status_history ssh
                    LEFT JOIN sarga_staff s ON s.id = ssh.staff_id
                    WHERE ssh.job_id = ?
                    ORDER BY ssh.changed_at DESC
                `, [id]);
                statusHistory = history;
            } catch (e) { /* table may not exist */ }

            res.json({ job, assignments, payments, statusHistory });
        } catch (err) {
            console.error('Error fetching job details:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update Job Status/Payment
    router.put('/jobs/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;
        const { status, payment_status, advance_paid, total_amount, delivery_date, branch_id } = req.body;

        try {
            let updateQuery = "UPDATE sarga_jobs SET status = ?, payment_status = ?, delivery_date = ?";
            let params = [status, payment_status, delivery_date];

            if (advance_paid !== undefined && total_amount !== undefined) {
                const balance = total_amount - advance_paid;
                updateQuery += ", advance_paid = ?, total_amount = ?, balance_amount = ?";
                params.push(advance_paid, total_amount, balance);
            }

            if (branch_id !== undefined) {
                updateQuery += ", branch_id = ?";
                params.push(branch_id);
            }

            updateQuery += " WHERE id = ?";
            params.push(id);

            await pool.query(updateQuery, params);
            auditLog(req.user.id, 'JOB_UPDATE', `Updated job ${id}`);
            // Log status change if status is updated
            if (status !== undefined) {
                await pool.query(
                    `INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)` ,
                    [id, status, req.user.id]
                );
            }
            // Fetch updated job details for cost calculation
            const [jobs] = await pool.query('SELECT * FROM sarga_jobs WHERE id = ?', [id]);
            if (jobs.length > 0) {
                const { calculateAndUpdateJobCost } = require('../helpers/jobCost');
                await calculateAndUpdateJobCost(jobs[0]);
            }
            res.json({ message: 'Job updated successfully' });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Delete Job
    router.delete('/jobs/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        try {
            await pool.query("DELETE FROM sarga_jobs WHERE id = ?", [req.params.id]);
            auditLog(req.user.id, 'JOB_DELETE', `Deleted job ${req.params.id}`);
            res.json({ message: 'Job deleted successfully' });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    module.exports = router;

const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog, auditFieldChanges, getUsageMap, sortByPositionThenName, sortByUsageThenPosition, bumpUsageForUser } = require('../helpers');
const { analyzeDesign } = require('../helpers/designAnalyzer');
const { validate, addJobSchema } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// --- IN-MEMORY CACHE for product hierarchy data ---
const HIERARCHY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let hierarchyCache = { data: null, timestamp: 0 };

const getHierarchyData = async () => {
    const now = Date.now();
    if (hierarchyCache.data && (now - hierarchyCache.timestamp) < HIERARCHY_CACHE_TTL) {
        return hierarchyCache.data;
    }
    const [categories, subcategories, products, inventory] = await Promise.all([
        pool.query("SELECT * FROM sarga_product_categories").then(r => r[0]),
        pool.query("SELECT * FROM sarga_product_subcategories").then(r => r[0]),
        pool.query("SELECT * FROM sarga_products").then(r => r[0]),
        pool.query("SELECT i.*, p.id as linked_product_id FROM sarga_inventory i LEFT JOIN sarga_products p ON i.id = p.inventory_item_id").then(r => r[0])
    ]);
    hierarchyCache = { data: { categories, subcategories, products, inventory }, timestamp: now };
    return hierarchyCache.data;
};

// Invalidate hierarchy cache (call after product/category CRUD)
const invalidateHierarchyCache = () => { hierarchyCache = { data: null, timestamp: 0 }; };

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

// --- HELPER: SYNC TO MACHINE WORK ENTRIES ---
const syncJobToMachineWorkEntry = async (jobData, machineId, userId) => {
    if (!machineId) return;

    try {
        const jobId = jobData.id || null;
        const reportDate = new Date().toISOString().split('T')[0];

        // 1. Get or create daily report in a single query using UNIQUE KEY (machine_id, report_date)
        //    INSERT ... SELECT gets branch_id from machines table; ON DUPLICATE returns existing id
        const [reportResult] = await pool.query(
            `INSERT INTO sarga_daily_report_machine (report_date, machine_id, branch_id, created_by)
             SELECT ?, ?, branch_id, ? FROM sarga_machines WHERE id = ?
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
            [reportDate, machineId, userId, machineId]
        );
        const reportId = reportResult.insertId;
        if (!reportId) {
            console.error(`[MachineSync] Could not get/create report for machine ${machineId}`);
            return;
        }

        // 2. Check if a work entry already exists for this job_id (if provided)
        let existingEntryId = null;
        if (jobId) {
            const [existingEntries] = await pool.query(
                'SELECT id FROM sarga_machine_work_entries WHERE job_id = ? AND report_id = ?',
                [jobId, reportId]
            );
            if (existingEntries.length > 0) {
                existingEntryId = existingEntries[0].id;
            }
        }

        const cashAdd = jobData.cash_amount !== undefined ? parseFloat(jobData.cash_amount) : parseFloat(jobData.advance_paid) || 0;
        const upiAdd = parseFloat(jobData.upi_amount) || 0;
        const totalAdd = parseFloat(jobData.total_amount) || 0;
        const balanceVal = parseFloat(jobData.balance_amount) || 0;

        // Determine Payment Type for the Work Entry
        let paymentType = 'Credit';
        if (jobData.payment_status === 'Paid') {
            paymentType = 'Paid';
        } else if (cashAdd > 0 || upiAdd > 0 || parseFloat(jobData.advance_paid) > 0) {
            paymentType = 'Both';
        }

        if (existingEntryId) {
            await pool.query(
                `UPDATE sarga_machine_work_entries SET
                 customer_name = ?, work_details = ?, copies = ?, payment_type = ?, 
                 cash_amount = ?, upi_amount = ?, credit_amount = ?, total_amount = ?, 
                 remarks = ?
                 WHERE id = ?`,
                [
                    jobData.customer_name || 'Walk-in',
                    jobData.job_name || 'Job',
                    parseInt(jobData.quantity) || 0,
                    paymentType,
                    cashAdd,
                    upiAdd,
                    balanceVal,
                    totalAdd,
                    `Auto-synced from Job #${jobData.job_number} (Updated)`,
                    existingEntryId
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO sarga_machine_work_entries 
                 (report_id, job_id, customer_name, work_details, copies, payment_type, cash_amount, upi_amount, credit_amount, total_amount, remarks)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    reportId,
                    jobId,
                    jobData.customer_name || 'Walk-in',
                    jobData.job_name || 'Job',
                    parseInt(jobData.quantity) || 0,
                    paymentType,
                    cashAdd,
                    upiAdd,
                    balanceVal,
                    totalAdd,
                    `Auto-synced from Job #${jobData.job_number}`
                ]
            );
        }

        // 3. Update daily report totals
        await pool.query(
            `UPDATE sarga_daily_report_machine SET
                total_copies = (SELECT COALESCE(SUM(copies), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_cash = (SELECT COALESCE(SUM(cash_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_upi = (SELECT COALESCE(SUM(upi_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?),
                total_credit = (SELECT COALESCE(SUM(credit_amount), 0) FROM sarga_machine_work_entries WHERE report_id = ?)
             WHERE id = ?`,
            [reportId, reportId, reportId, reportId, reportId, reportId]
        );

        // 4. Update machine readings table as well (used for the machine status cards)
        // Combine the two SELECTs into one parallel fetch
        const [[reportInfo], [existingReading]] = await Promise.all([
            pool.query('SELECT total_copies, opening_count FROM sarga_daily_report_machine WHERE id = ?', [reportId]),
            pool.query('SELECT notes, closing_count FROM sarga_machine_readings WHERE machine_id = ? AND reading_date = ?', [machineId, reportDate])
        ]);
        if (reportInfo.length > 0) {
            const totalCopies = parseInt(reportInfo[0].total_copies) || 0;
            const opening = reportInfo[0].opening_count || 0;

            const isManualEntry = existingReading.length > 0 &&
                existingReading[0].closing_count !== null &&
                !(existingReading[0].notes || '').startsWith('[Auto-Sync]');

            if (isManualEntry) {
                // If it's a manual entry, only update the total_copies (sum of bills), leave closing_count alone
                await pool.query(
                    `UPDATE sarga_machine_readings SET total_copies = ? WHERE machine_id = ? AND reading_date = ?`,
                    [totalCopies, machineId, reportDate]
                );
            } else {
                // If it's empty or was auto-synced, update everything
                await pool.query(
                    `INSERT INTO sarga_machine_readings (machine_id, reading_date, opening_count, total_copies, closing_count, notes, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                        total_copies = VALUES(total_copies),
                        closing_count = opening_count + VALUES(total_copies),
                        notes = VALUES(notes),
                        updated_by = VALUES(created_by)`,
                    [machineId, reportDate, opening, totalCopies, opening + totalCopies, '[Auto-Sync] Live Billing', userId]
                );
            }
        }
    } catch (err) {
        console.error('[MachineSync] Error syncing job to machine:', err.message);
    }
};

// --- JOB ROUTES ---

// List All Jobs (with Customer details)
router.get('/jobs', authenticateToken, async (req, res) => {
    try {
        const { search, status, branch_id: qBranch, category } = req.query;
        const { page, limit, offset } = parsePagination(req);
        const usePagination = !!req.query.page;

        let where = '';
        const params = [];

        // For non-admin/non-accountant/non-front-office staff, include their personal assignment status
        const isStaff = !['Admin', 'Front Office', 'front office', 'Accountant'].includes(req.user.role);
        let myStatusSelect = '';
        const myStatusParams = [];
        if (isStaff) {
            myStatusSelect = `, (SELECT jsa2.status FROM sarga_job_staff_assignments jsa2 WHERE jsa2.job_id = j.id AND (jsa2.staff_id = ? OR (jsa2.staff_id IS NULL AND jsa2.role = ?)) LIMIT 1) as my_assignment_status`;
            myStatusParams.push(req.user.id, req.user.role);
        }

        if (!['Admin', 'Accountant', 'Front Office', 'front office'].includes(req.user.role)) {
            // Show jobs assigned to this staff directly OR by role, restricted to their branch
            const userBranchId = await getUserBranchId(req.user.id);
            where += ' AND EXISTS (SELECT 1 FROM sarga_job_staff_assignments jsa WHERE jsa.job_id = j.id AND (jsa.staff_id = ? OR (jsa.staff_id IS NULL AND jsa.role = ?)))';
            params.push(req.user.id, req.user.role);
            if (userBranchId) {
                where += ' AND j.branch_id = ?';
                params.push(userBranchId);
            }
        } else if (!['Admin', 'Accountant'].includes(req.user.role)) {
            // Front Office: can see all jobs in their branch
            try {
                const userBranchId = await getUserBranchId(req.user.id);
                if (userBranchId && !qBranch) {
                    where += ' AND j.branch_id = ?';
                    params.push(userBranchId);
                }
            } catch (e) { /* ignore if no branch assigned */ }
            if (qBranch) {
                where += ' AND j.branch_id = ?';
                params.push(qBranch);
            }
        } else if (qBranch) {
            where += ' AND j.branch_id = ?';
            params.push(qBranch);
        }
        if (status) {
            where += ' AND j.status = ?';
            params.push(status);
        }
        if (category) {
            const cat = String(category).trim().toUpperCase();
            if (cat === 'OTHER') {
                // "Others" means everything except explicit Offset/Laser buckets.
                where += " AND (j.category IS NULL OR UPPER(j.category) NOT IN ('OFFSET', 'LASER'))";
            } else {
                where += ' AND UPPER(COALESCE(j.category, "")) = ?';
                params.push(cat);
            }
        }
        if (search) {
            where += ' AND (COALESCE(c.name, "Walk-in") LIKE ? OR c.mobile LIKE ? OR j.id LIKE ? OR j.job_name LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s, s);
        }

        const baseFrom = `
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            LEFT JOIN sarga_branches b ON j.branch_id = b.id
            WHERE 1=1 ${where}`;

        if (usePagination) {
            const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseFrom}`, params);
            const [rows] = await pool.query(`
                SELECT j.*, COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile, b.name as branch_name${myStatusSelect}
                ${baseFrom} ORDER BY j.created_at DESC LIMIT ? OFFSET ?
            `, [...myStatusParams, ...params, limit, offset]);
            return res.json(paginatedResponse(rows, cnt, page, limit));
        }

        const [rows] = await pool.query(`
            SELECT j.*, COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile, b.name as branch_name${myStatusSelect}
            ${baseFrom} ORDER BY j.created_at DESC
        `, [...myStatusParams, ...params]);
        res.json(rows);
    } catch (err) {
        console.error('List jobs error:', err);
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
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
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

// List Jobs for a specific Customer (with optional search by name)
router.get('/customers/:id/jobs', authenticateToken, async (req, res) => {
    try {
        const customerId = req.params.id;
        const { search } = req.query;
        console.log('Fetching jobs for customer:', customerId, 'search=', search);

        let sql = "SELECT * FROM sarga_jobs WHERE customer_id = ?";
        const params = [customerId];

        if (search) {
            sql += " AND job_name LIKE ?";
            params.push(`%${search}%`);
        }

        sql += " ORDER BY created_at DESC";
        const [rows] = await pool.query(sql, params);
        console.log('Found jobs:', rows.length);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching customer jobs:', err);
        res.status(500).json({ message: 'Database error' });
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

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const branchId = ['Admin', 'Accountant'].includes(req.user.role) ? null : await getUserBranchId(req.user.id);
        const created = [];

        const bulkBaseTime = Date.now();
        for (let i = 0; i < order_lines.length; i += 1) {
            const line = order_lines[i] || {};
            const jobNumber = `J-${(bulkBaseTime + i).toString().slice(-8)}-${i + 1}`;
            const total = Number(line.total_amount) || 0;

            try {
                const [result] = await connection.query(
                    `INSERT INTO sarga_jobs
                (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras, category, subcategory, machine_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                        JSON.stringify(line.applied_extras || []),
                        line.category || null,
                        line.subcategory || null,
                        line.machine_id || null
                    ]
                );

                // Sync to machine if machine_id is provided
                if (line.machine_id) {
                    await syncJobToMachineWorkEntry({
                        id: result.insertId,
                        job_number: jobNumber,
                        job_name: line.product_name || line.job_name || 'Job',
                        quantity: line.quantity,
                        total_amount: total,
                        advance_paid: 0,
                        balance_amount: total,
                        payment_status: 'Unpaid',
                        customer_name: 'Walk-in'
                    }, line.machine_id, req.user.id);
                }

                created.push({ id: result.insertId, job_number: jobNumber });
            } catch (err) {
                console.error("BULK INSERT ERROR:", err.message);
                if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
                    // Fallback to basic schema if new columns are missing
                    const [result] = await connection.query(
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
                } else {
                    console.error('Job creation error:', err);
                    throw err;
                }
            }
        }

        await connection.commit();
        auditLog(req.user.id, 'JOB_BULK_CREATE', `Created ${created.length} jobs in bulk for customer ${customer_id || 'walk-in'}`, { entity_type: 'job' });
        res.status(201).json({ jobs: created });
    } catch (err) {
        await connection.rollback();
        console.error('Bulk job creation error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Create Single Job (ACID-compliant transaction)
router.post('/jobs', authenticateToken, validate(addJobSchema), async (req, res) => {
    const {
        customer_id, product_id, branch_id, job_name, description, quantity,
        unit_price, total_amount, advance_paid, delivery_date, applied_extras,
        category, subcategory, machine_id
    } = req.body;

    const balance_amount = (total_amount || 0) - (advance_paid || 0);
    const payment_status = (total_amount > 0 && advance_paid >= total_amount) ? 'Paid' : (advance_paid > 0 ? 'Partial' : 'Unpaid');
    const job_number = `J-${Date.now().toString().slice(-8)}`;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Insert job (atomic with payment)
        const [result] = await connection.query(
            `INSERT INTO sarga_jobs 
            (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras, category, subcategory, machine_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            , [customer_id || null, product_id || null, branch_id || null, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date || null, JSON.stringify(applied_extras || []), category || null, subcategory || null, machine_id || null]
        );

        // 2. SYNC WITH CUSTOMER PAYMENTS IF ADVANCE IS PAID (inside same transaction)
        if (advance_paid > 0) {
            let cName = 'Walk-in';
            let cMobile = null;
            if (customer_id) {
                const [[customer]] = await connection.query('SELECT name, mobile FROM sarga_customers WHERE id = ?', [customer_id]);
                if (customer) {
                    cName = customer.name;
                    cMobile = customer.mobile;
                }
            }

            const jobCash = Number(req.body.cash_amount) || 0;
            const jobUpi = Number(req.body.upi_amount) || 0;
            let jobPaymentMethod = req.body.payment_method || 'Cash';
            if (jobCash > 0 && jobUpi > 0) jobPaymentMethod = 'Both';
            else if (jobUpi > 0) jobPaymentMethod = 'UPI';
            else if (jobCash > 0) jobPaymentMethod = 'Cash';

            await connection.query(`
                INSERT INTO sarga_customer_payments 
                (customer_id, customer_name, customer_mobile, total_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, branch_id, description, payment_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())
            `, [
                customer_id || null,
                cName,
                cMobile,
                total_amount,
                advance_paid,
                balance_amount,
                jobPaymentMethod,
                jobCash || advance_paid,
                jobUpi,
                branch_id || null,
                `Advance for Job ${job_number}`,
            ]);
        }

        // 3. Audit log (inside transaction for consistency)
        await connection.query(
            `INSERT INTO sarga_audit_logs (user_id_internal, action, details, entity_type, entity_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, 'JOB_CREATE', `Created job ${job_number} for customer ${customer_id || 'walk-in'}`, 'job', result.insertId, req.ip]
        );

        // COMMIT — all-or-nothing
        await connection.commit();

        // Post-commit side effects (non-critical, outside transaction)
        if (product_id) {
            bumpUsageForUser(req.user.id, product_id).catch(() => { });
        }

        const { calculateAndUpdateJobCost } = require('../helpers/jobCost');
        calculateAndUpdateJobCost({ id: result.insertId, product_id, quantity, total_amount }).catch(err => console.error('Cost calc error:', err));

        if (machine_id) {
            let customerName = 'Walk-in';
            if (customer_id) {
                const [[customer]] = await pool.query('SELECT name FROM sarga_customers WHERE id = ?', [customer_id]);
                if (customer) customerName = customer.name;
            }
            syncJobToMachineWorkEntry({
                id: result.insertId, job_number, job_name, quantity, total_amount,
                advance_paid, balance_amount, payment_status, customer_name: customerName
            }, machine_id, req.user.id).catch(err => console.error('Machine sync error:', err));
        }

        res.status(201).json({ id: result.insertId, job_number, message: 'Job created successfully' });
    } catch (err) {
        await connection.rollback();
        console.error("Job create error:", err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Fetch Hierarchy Tree
router.get('/product-hierarchy', authenticateToken, async (req, res) => {
    try {
        const [usageMap, { categories, subcategories, products, inventory }] = await Promise.all([
            getUsageMap(req.user.id),
            getHierarchyData()
        ]);

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

        // Add Unlinked Inventory as a special category
        const unlinkedItems = inventory.filter(i => !i.linked_product_id);
        if (unlinkedItems.length > 0) {
            const inventoryGroups = {};
            unlinkedItems.forEach(item => {
                const catName = item.category || 'Uncategorized';
                if (!inventoryGroups[catName]) inventoryGroups[catName] = [];
                inventoryGroups[catName].push({
                    id: `inv-${item.id}`, // Virtual ID to avoid collisions
                    inventory_id: item.id,
                    name: item.name,
                    sku: item.sku,
                    product_code: item.sku, // Use SKU as product code for QR lookup
                    sell_price: item.sell_price,
                    calculation_type: 'Normal',
                    is_inventory_only: true
                });
            });

            const inventorySubcats = Object.entries(inventoryGroups).map(([name, items], idx) => ({
                id: `inv-sub-${idx}`,
                name: name,
                products: items
            }));

            hierarchy.push({
                id: 'inv-root',
                name: 'Raw Inventory',
                position: 999,
                subcategories: inventorySubcats
            });
        }

        res.json(hierarchy);
    } catch (err) {
        console.error('Hierarchy error:', err);
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
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
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
        .map((a) => a?.staff_id === 'role' ? null : Number(a?.staff_id))
        .filter((id) => id === null || Number.isFinite(id))
    ));

    // Only require staffIds if there are non-role assignments
    const nonRoleAssignments = assignments.filter(a => a?.staff_id !== 'role');
    if (jobIds.length === 0 || (nonRoleAssignments.length > 0 && staffIds.filter(id => id !== null).length === 0)) {
        return res.status(400).json({ message: 'Valid job_id and staff_id are required' });
    }

    try {
        const [jobs] = await pool.query(
            `SELECT id, branch_id FROM sarga_jobs WHERE id IN (${jobIds.map(() => '?').join(',')})`,
            jobIds
        );
        const actualStaffIds = staffIds.filter(id => id !== null);
        let staff = [];
        if (actualStaffIds.length > 0) {
            [staff] = await pool.query(
                `SELECT id, branch_id, role FROM sarga_staff WHERE id IN (${actualStaffIds.map(() => '?').join(',')})`,
                actualStaffIds
            );
        }

        const jobMap = new Map(jobs.map((j) => [j.id, j]));
        const staffMap = new Map(staff.map((s) => [s.id, s]));

        let branchId = null;
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            branchId = await getUserBranchId(req.user.id);
        }

        for (const assignment of assignments) {
            const jobId = Number(assignment.job_id);
            const isRoleAssignment = assignment.staff_id === 'role';
            const staffId = isRoleAssignment ? null : Number(assignment.staff_id);
            const job = jobMap.get(jobId);

            if (isRoleAssignment) {
                // Role-based assignment: no staff validation needed
                if (!job) {
                    return res.status(400).json({ message: 'Invalid job selection' });
                }
            } else {
                const staffMember = staffMap.get(staffId);
                if (!job || !staffMember) {
                    return res.status(400).json({ message: 'Invalid job or staff selection' });
                }
            }
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            for (const assignment of assignments) {
                const jobId = Number(assignment.job_id);
                const isRoleAssignment = assignment.staff_id === 'role';
                const staffId = isRoleAssignment ? null : Number(assignment.staff_id);
                const role = assignment.role || (isRoleAssignment ? null : staffMap.get(staffId)?.role) || null;
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

        auditLog(req.user.id, 'JOB_ASSIGNMENT_BULK', `Assigned staff to ${assignments.length} jobs`, { entity_type: 'job_assignment' });
        res.json({ message: 'Assignments saved', count: assignments.length });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Assignment Status
router.put('/jobs/assignments/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) return res.status(400).json({ message: 'Status is required' });
        const VALID_ASSIGNMENT_STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled'];
        if (!VALID_ASSIGNMENT_STATUSES.includes(status)) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${VALID_ASSIGNMENT_STATUSES.join(', ')}` });
        }

        await pool.query(
            'UPDATE sarga_job_staff_assignments SET status = ? WHERE id = ?',
            [status, id]
        );
        auditLog(req.user.id, 'ASSIGNMENT_STATUS_UPDATE', `Assignment #${id} status changed to ${status}`, { entity_type: 'job_assignment', entity_id: id });
        res.json({ message: 'Assignment status updated successfully' });
    } catch (err) {
        console.error('Update assignment status error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// GET /jobs/offset-pending — Fetch jobs explicitly for Offset Print Ganging (Plate Management)
router.get('/jobs/offset-pending', authenticateToken, async (req, res) => {
    try {
        const { branch_id: qBranch } = req.query;

        // Fetch jobs where category is 'Offset' and status is pending/processing (i.e. not completed, delivered, cancelled)
        let where = " AND j.category = 'Offset' AND j.status NOT IN ('Completed', 'Delivered', 'Cancelled')";
        const params = [];

        // Apply branch filtering
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            const branchId = await getUserBranchId(req.user.id);
            if (branchId) {
                where += ' AND j.branch_id = ?';
                params.push(branchId);
            }
        } else if (qBranch) {
            where += ' AND j.branch_id = ?';
            params.push(qBranch);
        }

        const [rows] = await pool.query(`
            SELECT 
                j.id, j.job_number, j.job_name, j.quantity, j.status, j.created_at,
                j.description, j.subcategory,
                b.name as branch_name, COALESCE(c.name, 'Walk-in') as customer_name
            FROM sarga_jobs j
            LEFT JOIN sarga_branches b ON j.branch_id = b.id
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            WHERE 1=1 ${where}
            ORDER BY j.created_at ASC
        `, params);

        res.json(rows);
    } catch (err) {
        console.error('Fetch offset-pending jobs error:', err);
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

        // Payment history — link via payment_id on the job
        let payments = [];
        try {
            if (job.payment_id) {
                const [rows] = await pool.query(
                    `SELECT * FROM sarga_customer_payments WHERE id = ?`,
                    [job.payment_id]
                );
                payments = rows;
            }
        } catch (e) { /* ignore if column not yet migrated */ }

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

        // Fetch analytics
        const { calculateAndUpdateJobCost } = require('../helpers/jobCost');
        const analytics = await calculateAndUpdateJobCost(job);

        res.json({ job: { ...job, ...analytics }, assignments, payments, statusHistory });
    } catch (err) {
        console.error('Error fetching job details:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Job Status/Details
router.put('/jobs/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No updates provided' });
    }

    // Validated allowed status enums
    const VALID_JOB_STATUSES = ['Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production', 'Approval Pending', 'Completed', 'Delivered', 'Cancelled'];
    const VALID_PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'];

    // Status transition matrix — defines which statuses can move to which (C-06)
    const VALID_TRANSITIONS = {
        'Pending': ['Processing', 'Designing', 'Printing', 'Production', 'Cancelled'],
        'Processing': ['Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production', 'Approval Pending', 'Completed', 'Cancelled'],
        'Designing': ['Processing', 'Printing', 'Approval Pending', 'Cancelled'],
        'Printing': ['Cutting', 'Lamination', 'Binding', 'Completed', 'Cancelled'],
        'Cutting': ['Lamination', 'Binding', 'Completed', 'Cancelled'],
        'Lamination': ['Cutting', 'Binding', 'Completed', 'Cancelled'],
        'Binding': ['Completed', 'Cancelled'],
        'Production': ['Approval Pending', 'Completed', 'Cancelled'],
        'Approval Pending': ['Completed', 'Cancelled', 'Processing', 'Designing'],
        'Completed': ['Delivered'],
        'Delivered': [],
        'Cancelled': ['Pending']
    };

    if (updates.status !== undefined && !VALID_JOB_STATUSES.includes(updates.status)) {
        return res.status(400).json({ message: `Invalid status. Allowed: ${VALID_JOB_STATUSES.join(', ')}` });
    }
    if (updates.payment_status !== undefined && !VALID_PAYMENT_STATUSES.includes(updates.payment_status)) {
        return res.status(400).json({ message: `Invalid payment_status. Allowed: ${VALID_PAYMENT_STATUSES.join(', ')}` });
    }

    try {
        // Fetch current state BEFORE update for audit comparison
        const [currentRows] = await pool.query('SELECT * FROM sarga_jobs WHERE id = ?', [id]);
        if (currentRows.length === 0) {
            return res.status(404).json({ message: 'Job not found' });
        }
        const currentJob = currentRows[0];

        // Cannot mark as Delivered unless fully paid.
        if (updates.status === 'Delivered') {
            const total = updates.total_amount !== undefined ? Number(updates.total_amount) : Number(currentJob.total_amount);
            const paid = updates.advance_paid !== undefined ? Number(updates.advance_paid) : Number(currentJob.advance_paid);
            const remaining = Math.max(total - paid, 0);
            if (remaining > 0) {
                return res.status(409).json({
                    message: 'Cannot mark as Delivered until full payment is collected.',
                    remaining_amount: Number(remaining.toFixed(2)),
                    customer_id: currentJob.customer_id || null,
                    job_id: Number(id)
                });
            }
        }

        // Validate status transition (C-06)
        if (updates.status !== undefined && updates.status !== currentJob.status) {
            const allowed = VALID_TRANSITIONS[currentJob.status] || [];
            if (!allowed.includes(updates.status)) {
                return res.status(400).json({ message: `Cannot transition from '${currentJob.status}' to '${updates.status}'. Allowed: ${allowed.join(', ') || 'none'}` });
            }
        }

        const fields = [];
        const params = [];

        // Dynamic field builder
        const allowedFields = ['status', 'payment_status', 'advance_paid', 'total_amount', 'delivery_date', 'branch_id', 'job_name', 'description', 'quantity', 'unit_price', 'required_sheets', 'used_sheets', 'paper_size', 'plate_count', 'plate_details'];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                params.push(updates[field]);
            }
        }

        if (updates.total_amount !== undefined || updates.advance_paid !== undefined) {
            const total = updates.total_amount !== undefined ? Number(updates.total_amount) : Number(currentJob.total_amount);
            const paid = updates.advance_paid !== undefined ? Number(updates.advance_paid) : Number(currentJob.advance_paid);
            const newBalance = total - paid;
            fields.push('balance_amount = ?');
            params.push(newBalance);
            if (updates.payment_status === undefined) {
                const newPaymentStatus = (total > 0 && paid >= total) ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid');
                fields.push('payment_status = ?');
                params.push(newPaymentStatus);
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: 'No valid fields for update' });
        }

        params.push(id);
        const updateQuery = `UPDATE sarga_jobs SET ${fields.join(', ')} WHERE id = ?`;

        await pool.query(updateQuery, params);

        // ─── Field-level audit logging ───
        const auditOldData = {};
        const auditNewData = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                auditOldData[field] = currentJob[field];
                auditNewData[field] = updates[field];
            }
        }
        auditFieldChanges(req.user.id, 'JOB_UPDATE', 'job', Number(id), auditOldData, auditNewData, { ip_address: req.ip });

        // Log status change if status is updated
        if (updates.status !== undefined) {
            await pool.query(
                `INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)`,
                [id, updates.status, req.user.id]
            );
        }

        // Recalculate costs (async is fine here as we return success)
        const [jobs] = await pool.query('SELECT * FROM sarga_jobs WHERE id = ?', [id]);
        if (jobs.length > 0) {
            const { calculateAndUpdateJobCost } = require('../helpers/jobCost');
            calculateAndUpdateJobCost(jobs[0]).catch(err => console.error('Cost update error:', err));
        }

        res.json({ message: 'Job updated successfully' });
    } catch (err) {
        console.error('Update failure:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Job
router.delete('/jobs/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        // Check for linked payments before deletion (C-01)
        const [payments] = await pool.query(
            "SELECT COUNT(*) as cnt FROM sarga_customer_payments WHERE JSON_CONTAINS(job_ids, CAST(? AS JSON))",
            [req.params.id]
        ).catch(() => [[{ cnt: 0 }]]); // Fallback if job_ids column doesn't exist

        if (payments[0].cnt > 0) {
            return res.status(409).json({ message: `Cannot delete: ${payments[0].cnt} payment(s) linked to this job. Remove payments first.` });
        }

        await pool.query("DELETE FROM sarga_jobs WHERE id = ?", [req.params.id]);
        auditLog(req.user.id, 'JOB_DELETE', `Deleted job ${req.params.id}`);
        res.json({ message: 'Job deleted successfully' });
    } catch (err) {
        console.error('Delete job error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ─── Repeat Order (One-click clone) ───────────────────────────
router.post('/jobs/:id/repeat', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sarga_jobs WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: 'Original job not found' });

        const orig = rows[0];
        const job_number = `J-${Date.now().toString().slice(-8)}`;
        const quantity = Number(req.body.quantity) || Number(orig.quantity) || 1;
        const unit_price = Number(req.body.unit_price) || Number(orig.unit_price) || 0;
        const total_amount = quantity * unit_price;

        const [result] = await pool.query(
            `INSERT INTO sarga_jobs 
            (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras, category, subcategory, machine_id, paper_size, required_sheets)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'Unpaid', ?, ?, ?, ?, ?, ?, ?)`,
            [
                orig.customer_id, orig.product_id, orig.branch_id,
                job_number,
                orig.job_name,
                orig.description ? `[Repeat of ${orig.job_number}] ${orig.description}` : `Repeat of ${orig.job_number}`,
                quantity, unit_price, total_amount, total_amount,
                null, // delivery_date — user sets later
                orig.applied_extras || '[]',
                orig.category, orig.subcategory, orig.machine_id,
                orig.paper_size, orig.required_sheets
            ]
        );

        if (orig.product_id) {
            await bumpUsageForUser(req.user.id, orig.product_id);
        }

        // Auto-calculate cost/profit
        try {
            const { calculateAndUpdateJobCost } = require('../helpers/jobCost');
            await calculateAndUpdateJobCost({ id: result.insertId, product_id: orig.product_id, quantity, total_amount });
        } catch (e) { /* non-critical */ }

        auditLog(req.user.id, 'JOB_REPEAT', `Repeated job ${orig.job_number} as ${job_number} for customer ${orig.customer_id || 'walk-in'}`);

        res.status(201).json({
            id: result.insertId,
            job_number,
            message: `Order repeated successfully as ${job_number}`,
            original_job_number: orig.job_number
        });
    } catch (err) {
        console.error('Repeat order error:', err);
        res.status(500).json({ message: 'Failed to repeat order' });
    }
});

// ─── Paper Usage Logs ──────────────────────────────────────────

// Get paper usage logs for a job
router.get('/jobs/:id/paper-logs', authenticateToken, async (req, res) => {
    try {
        const [logs] = await pool.query(
            `SELECT pl.*, s.name as staff_name
             FROM sarga_paper_usage_logs pl
             LEFT JOIN sarga_staff s ON s.id = pl.logged_by
             WHERE pl.job_id = ?
             ORDER BY pl.created_at DESC`,
            [req.params.id]
        );
        // Also get job summary
        const [jobs] = await pool.query(
            'SELECT required_sheets, used_sheets, paper_size FROM sarga_jobs WHERE id = ?',
            [req.params.id]
        );
        const job = jobs[0] || {};
        const totalUsed = logs.reduce((sum, l) => sum + (Number(l.sheets_used) || 0), 0);
        const totalWasted = logs.reduce((sum, l) => sum + (Number(l.sheets_wasted) || 0), 0);
        res.json({
            logs,
            summary: {
                required_sheets: Number(job.required_sheets) || 0,
                used_sheets: Number(job.used_sheets) || totalUsed,
                paper_size: job.paper_size || null,
                total_logged_used: totalUsed,
                total_logged_waste: totalWasted,
                waste_sheets: totalUsed > 0 ? totalWasted : Math.max(0, (Number(job.used_sheets) || 0) - (Number(job.required_sheets) || 0)),
                waste_percent: totalUsed > 0 ? ((totalWasted / totalUsed) * 100).toFixed(1) : (Number(job.required_sheets) > 0 ? (((Number(job.used_sheets) || 0) - Number(job.required_sheets)) / Number(job.required_sheets) * 100).toFixed(1) : '0')
            }
        });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json({ logs: [], summary: { required_sheets: 0, used_sheets: 0, paper_size: null, total_logged_used: 0, total_logged_waste: 0, waste_sheets: 0, waste_percent: '0' } });
        console.error('Paper logs error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Add a paper usage log entry
router.post('/jobs/:id/paper-logs', authenticateToken, async (req, res) => {
    const { stage, paper_size, sheets_used, sheets_wasted, notes } = req.body;
    const jobId = req.params.id;

    if (!stage) return res.status(400).json({ message: 'Stage is required' });
    const used = Math.max(0, Math.round(Number(sheets_used) || 0));
    const wasted = Math.max(0, Math.round(Number(sheets_wasted) || 0));
    if (used === 0 && wasted === 0) return res.status(400).json({ message: 'Sheets used or wasted must be > 0' });

    try {
        const [result] = await pool.query(
            `INSERT INTO sarga_paper_usage_logs (job_id, stage, paper_size, sheets_used, sheets_wasted, notes, logged_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [jobId, stage, paper_size || null, used, wasted, notes || null, req.user.id]
        );

        // Auto-update job's used_sheets with the aggregate
        const [[agg]] = await pool.query(
            'SELECT SUM(sheets_used) as total_used FROM sarga_paper_usage_logs WHERE job_id = ?',
            [jobId]
        );
        await pool.query(
            'UPDATE sarga_jobs SET used_sheets = ? WHERE id = ?',
            [Number(agg.total_used) || 0, jobId]
        );

        auditLog(req.user.id, 'PAPER_LOG', `Paper log for job ${jobId}: ${stage} - ${used} used, ${wasted} wasted`);
        res.status(201).json({ id: result.insertId, message: 'Paper usage logged' });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ message: 'Paper logging table not initialized. Restart server to auto-create.' });
        }
        console.error('Paper log error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete a paper usage log entry
router.delete('/jobs/:jobId/paper-logs/:logId', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM sarga_paper_usage_logs WHERE id = ? AND job_id = ?', [req.params.logId, req.params.jobId]);
        // Re-aggregate
        const [[agg]] = await pool.query(
            'SELECT COALESCE(SUM(sheets_used), 0) as total_used FROM sarga_paper_usage_logs WHERE job_id = ?',
            [req.params.jobId]
        );
        await pool.query('UPDATE sarga_jobs SET used_sheets = ? WHERE id = ?', [Number(agg.total_used) || 0, req.params.jobId]);
        auditLog(req.user.id, 'PAPER_LOG_DELETE', `Deleted paper log #${req.params.logId} from job ${req.params.jobId}`, { entity_type: 'paper_log', entity_id: req.params.logId });
        res.json({ message: 'Paper log deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// ─── Proof Approval Workflow ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Proof uploads dir
const proofsDir = path.join(__dirname, '..', 'uploads', 'proofs');
if (!fs.existsSync(proofsDir)) {
    fs.mkdirSync(proofsDir, { recursive: true });
}

const proofStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, proofsDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `proof-${unique}${ext}`);
    }
});

const PROOF_EXTS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
    '.pdf', '.ai', '.eps', '.psd', '.cdr', '.tiff', '.tif', '.bmp'
]);

const proofFileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (PROOF_EXTS.has(ext)) return cb(null, true);
    cb(new Error('Invalid file type for proof. Allowed: Images, PDF, AI, EPS, PSD, CDR, TIFF.'));
};

const uploadProof = multer({
    storage: proofStorage,
    fileFilter: proofFileFilter,
    limits: { fileSize: 25 * 1024 * 1024 }
});

const getProofFileType = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp'].includes(ext)) return 'image';
    if (ext === '.pdf') return 'pdf';
    return 'design';
};

const removeProofFile = async (fileUrl) => {
    if (!fileUrl) return;
    const filePath = path.join(__dirname, '..', fileUrl.replace(/^\//, ''));
    try { await fs.promises.unlink(filePath); } catch { /* ignore */ }
};

// GET /jobs/:id/proofs — List all proofs for a job
router.get('/jobs/:id/proofs', authenticateToken, async (req, res) => {
    try {
        const [proofs] = await pool.query(
            `SELECT p.*, 
                    u.name as uploaded_by_name,
                    r.name as reviewed_by_name
             FROM sarga_job_proofs p
             LEFT JOIN sarga_staff u ON p.uploaded_by = u.id
             LEFT JOIN sarga_staff r ON p.reviewed_by = r.id
             WHERE p.job_id = ?
             ORDER BY p.version DESC`,
            [req.params.id]
        );

        // Attach design check results to each proof
        try {
            const [designChecks] = await pool.query(
                `SELECT proof_id, passed, total_issues, critical_issues, warnings FROM sarga_design_checks WHERE job_id = ?`,
                [req.params.id]
            );
            const dcMap = {};
            designChecks.forEach(dc => { if (dc.proof_id) dcMap[dc.proof_id] = dc; });
            proofs.forEach(p => { p.designCheck = dcMap[p.id] || null; });
        } catch { /* design_checks table may not have job_id yet */ }

        res.json(proofs);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        console.error('Proofs list error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// POST /jobs/:id/proofs — Upload a new proof version
router.post('/jobs/:id/proofs', authenticateToken, uploadProof.single('file'), async (req, res) => {
    const jobId = req.params.id;
    const { designer_notes } = req.body;

    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        // Get next version number
        const [[maxV]] = await pool.query(
            'SELECT COALESCE(MAX(version), 0) as maxVer FROM sarga_job_proofs WHERE job_id = ?',
            [jobId]
        );
        const nextVersion = (maxV.maxVer || 0) + 1;

        const fileUrl = `/uploads/proofs/${req.file.filename}`;
        const fileType = getProofFileType(req.file.originalname);

        const [result] = await pool.query(
            `INSERT INTO sarga_job_proofs 
             (job_id, version, file_url, original_name, file_size, file_type, designer_notes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [jobId, nextVersion, fileUrl, req.file.originalname, req.file.size, fileType, designer_notes || null, req.user.id]
        );

        // Update job status to Approval Pending if currently Designing or Processing
        const [[job]] = await pool.query('SELECT status FROM sarga_jobs WHERE id = ?', [jobId]);
        if (job && ['Designing', 'Processing', 'Pending'].includes(job.status)) {
            await pool.query('UPDATE sarga_jobs SET status = ? WHERE id = ?', ['Approval Pending', jobId]);
            await pool.query(
                'INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)',
                [jobId, 'Approval Pending', req.user.id]
            );
        }

        auditLog(req.user.id, 'PROOF_UPLOAD', `Uploaded proof v${nextVersion} for job ${jobId}`);

        // ─── Auto Design Check: analyze the uploaded proof automatically ───
        let designCheckResult = null;
        try {
            const absFilePath = req.file.path; // multer provides absolute path
            const analysis = await analyzeDesign(absFilePath);

            // Save design check result to sarga_design_checks linked to this job
            const [dcResult] = await pool.query(
                `INSERT INTO sarga_design_checks 
                    (file_name, file_path, file_type, file_size_kb, result_json, passed, 
                     total_issues, critical_issues, warnings, checked_by, job_id, proof_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.file.originalname,
                    fileUrl,
                    analysis.file_type,
                    Math.round(req.file.size / 1024),
                    JSON.stringify(analysis),
                    analysis.passed ? 1 : 0,
                    analysis.total_issues,
                    analysis.critical_issues,
                    analysis.warnings,
                    req.user.id,
                    jobId,
                    result.insertId
                ]
            );

            designCheckResult = {
                id: dcResult.insertId,
                passed: analysis.passed,
                total_issues: analysis.total_issues,
                critical_issues: analysis.critical_issues,
                warnings: analysis.warnings,
                checks: analysis.checks
            };

            auditLog(req.user.id, 'AUTO_DESIGN_CHECK',
                `Auto design check for proof v${nextVersion} of job ${jobId}: ${analysis.passed ? 'PASSED' : 'FAILED'} (${analysis.critical_issues} critical, ${analysis.warnings} warnings)`,
                { entity_type: 'job', entity_id: jobId }
            );
        } catch (dcErr) {
            // Design check failure should NOT block proof upload
            console.error('Auto design check error (non-blocking):', dcErr.message);
            designCheckResult = { error: 'Design check could not be completed', message: dcErr.message };
        }

        res.status(201).json({
            id: result.insertId,
            version: nextVersion,
            message: `Proof v${nextVersion} uploaded`,
            designCheck: designCheckResult
        });
    } catch (err) {
        await removeProofFile(`/uploads/proofs/${req.file.filename}`);
        console.error('Proof upload error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// PUT /jobs/:id/proofs/:proofId/review — Approve or reject a proof
router.put('/jobs/:id/proofs/:proofId/review', authenticateToken, async (req, res) => {
    const { status, customer_feedback } = req.body;
    const validStatuses = ['Approved', 'Rejected', 'Revision Requested'];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: `Invalid status. Allowed: ${validStatuses.join(', ')}` });
    }

    try {
        const [[proof]] = await pool.query(
            'SELECT * FROM sarga_job_proofs WHERE id = ? AND job_id = ?',
            [req.params.proofId, req.params.id]
        );
        if (!proof) return res.status(404).json({ message: 'Proof not found' });

        await pool.query(
            `UPDATE sarga_job_proofs 
             SET status = ?, customer_feedback = ?, reviewed_by = ?, reviewed_at = NOW()
             WHERE id = ?`,
            [status, customer_feedback || null, req.user.id, req.params.proofId]
        );

        // Update job status based on proof decision
        if (status === 'Approved') {
            await pool.query('UPDATE sarga_jobs SET status = ? WHERE id = ?', ['Processing', req.params.id]);
            await pool.query(
                'INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)',
                [req.params.id, 'Processing', req.user.id]
            );
        } else if (status === 'Rejected' || status === 'Revision Requested') {
            await pool.query('UPDATE sarga_jobs SET status = ? WHERE id = ?', ['Designing', req.params.id]);
            await pool.query(
                'INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)',
                [req.params.id, 'Designing', req.user.id]
            );
        }

        auditLog(req.user.id, 'PROOF_REVIEW', `${status} proof v${proof.version} for job ${req.params.id}${customer_feedback ? `: ${customer_feedback}` : ''}`);
        res.json({ message: `Proof ${status.toLowerCase()}` });
    } catch (err) {
        console.error('Proof review error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// DELETE /jobs/:id/proofs/:proofId — Remove a proof
router.delete('/jobs/:id/proofs/:proofId', authenticateToken, async (req, res) => {
    try {
        const [[proof]] = await pool.query(
            'SELECT file_url FROM sarga_job_proofs WHERE id = ? AND job_id = ?',
            [req.params.proofId, req.params.id]
        );
        if (!proof) return res.status(404).json({ message: 'Proof not found' });

        await removeProofFile(proof.file_url);
        await pool.query('DELETE FROM sarga_job_proofs WHERE id = ?', [req.params.proofId]);
        auditLog(req.user.id, 'PROOF_DELETE', `Deleted proof from job ${req.params.id}`);
        res.json({ message: 'Proof deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});



module.exports = { router, syncJobToMachineWorkEntry, invalidateHierarchyCache };


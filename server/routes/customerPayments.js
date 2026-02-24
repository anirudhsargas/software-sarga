const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, hasPendingCustomerBalance, bumpUsageForUser, auditLog, normalizeMobile, asyncHandler } = require('../helpers');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { validate } = require('../middleware/validation');
const { customerPaymentSchema } = require('../schemas/paymentSchemas');

// --- CUSTOMER PAYMENT ROUTES ---

// List Customer Payments
router.get('/customer-payments', authenticateToken, async (req, res) => {
    const { customer_id } = req.query;
    const { page, limit, offset } = parsePagination(req);
    const usePagination = !!req.query.page;
    try {
        let where = '';
        const params = [];

        // Branch filter for non-admin
        if (req.user.role !== 'Admin') {
            try {
                const branchId = await getUserBranchId(req.user.id);
                where += ' AND branch_id = ?';
                params.push(branchId);
            } catch (err) {
                if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
                // branch_id column may not exist yet — ignore filter
            }
        }
        if (customer_id) {
            where += ' AND customer_id = ?';
            params.push(customer_id);
        }

        const baseFrom = `FROM sarga_customer_payments WHERE 1=1 ${where}`;

        if (usePagination) {
            const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseFrom}`, params);
            const [rows] = await pool.query(`SELECT * ${baseFrom} ORDER BY payment_date DESC, created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
            return res.json(paginatedResponse(rows, cnt, page, limit));
        }

        const [rows] = await pool.query(`SELECT * ${baseFrom} ORDER BY payment_date DESC, created_at DESC`, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Customer Payment
router.post('/customer-payments', authenticateToken, validate(customerPaymentSchema), asyncHandler(async (req, res) => {
    const {
        customer_id,
        customer_name,
        customer_mobile,
        total_amount,
        net_amount,
        sgst_amount,
        cgst_amount,
        advance_paid,
        payment_method,
        cash_amount,
        upi_amount,
        reference_number,
        description,
        payment_date,
        order_lines,
        job_ids
    } = req.body;

    const total = Number(total_amount) || 0;
    const advance = Number(advance_paid) || 0;
    const cash = Number(cash_amount) || 0;
    const upi = Number(upi_amount) || 0;
    const balance = total - advance;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const branchId = req.user.role === 'Admin' ? null : await getUserBranchId(req.user.id);
        let resolvedCustomerId = customer_id || null;

        if (!resolvedCustomerId && customer_mobile) {
            const normalizedMobile = normalizeMobile(customer_mobile);
            if (normalizedMobile.length === 10) {
                if (req.user.role !== 'Admin' && branchId) {
                    const [rows] = await connection.query(
                        "SELECT id FROM sarga_customers WHERE mobile = ? AND branch_id = ?",
                        [normalizedMobile, branchId]
                    );
                    resolvedCustomerId = rows[0]?.id || null;
                } else {
                    const [rows] = await connection.query(
                        "SELECT id FROM sarga_customers WHERE mobile = ?",
                        [normalizedMobile]
                    );
                    resolvedCustomerId = rows[0]?.id || null;
                }
            }
        }
        let result;
        try {
            [result] = await connection.query(
                `INSERT INTO sarga_customer_payments
                (customer_id, customer_name, customer_mobile, total_amount, net_amount, sgst_amount, cgst_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, order_lines, branch_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    resolvedCustomerId,
                    String(customer_name).trim(),
                    customer_mobile || null,
                    total,
                    Number(net_amount) || 0,
                    Number(sgst_amount) || 0,
                    Number(cgst_amount) || 0,
                    advance,
                    balance,
                    payment_method || 'Cash',
                    cash,
                    upi,
                    reference_number || null,
                    description || null,
                    payment_date,
                    JSON.stringify(order_lines || []),
                    branchId
                ]
            );
        } catch (err) {
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                [result] = await connection.query(
                    `INSERT INTO sarga_customer_payments
                    (customer_id, customer_name, customer_mobile, total_amount, net_amount, sgst_amount, cgst_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, order_lines)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        resolvedCustomerId,
                        String(customer_name).trim(),
                        customer_mobile || null,
                        total,
                        Number(net_amount) || 0,
                        Number(sgst_amount) || 0,
                        Number(cgst_amount) || 0,
                        advance,
                        balance,
                        payment_method || 'Cash',
                        cash,
                        upi,
                        reference_number || null,
                        description || null,
                        payment_date,
                        JSON.stringify(order_lines || [])
                    ]
                );
            } else {
                throw err;
            }
        }
        if (resolvedCustomerId && Array.isArray(order_lines) && order_lines.length > 0 && (!Array.isArray(job_ids) || job_ids.length === 0)) {
            const totalLineAmount = order_lines.reduce((sum, line) => sum + (Number(line.total_amount) || 0), 0);
            let allocatedAdvance = 0;

            for (let i = 0; i < order_lines.length; i += 1) {
                const line = order_lines[i] || {};
                const lineTotal = Number(line.total_amount) || 0;
                let lineAdvance = 0;

                if (totalLineAmount > 0) {
                    if (i === order_lines.length - 1) {
                        lineAdvance = Math.max(advance - allocatedAdvance, 0);
                    } else {
                        lineAdvance = (advance * (lineTotal / totalLineAmount));
                        lineAdvance = Math.round(lineAdvance * 100) / 100;
                        allocatedAdvance += lineAdvance;
                    }
                }

                const lineBalance = lineTotal - lineAdvance;
                const paymentStatus = lineAdvance >= lineTotal ? 'Paid' : (lineAdvance > 0 ? 'Partial' : 'Unpaid');
                const jobNumber = `J-${Date.now().toString().slice(-8)}-${i + 1}`;

                await connection.query(
                    `INSERT INTO sarga_jobs
                    (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    , [
                        resolvedCustomerId,
                        line.product_id || null,
                        branchId,
                        jobNumber,
                        line.product_name || line.job_name || 'Job',
                        line.description || null,
                        Number(line.quantity) || 1,
                        Number(line.unit_price) || 0,
                        lineTotal,
                        lineAdvance,
                        lineBalance,
                        paymentStatus,
                        null,
                        JSON.stringify(line.applied_extras || [])
                    ]
                );
            }
        }

        const jobIdsFromLines = Array.isArray(order_lines)
            ? order_lines.map((line) => line?.job_id).filter(Boolean)
            : [];
        const jobIds = Array.from(new Set([...(Array.isArray(job_ids) ? job_ids : []), ...jobIdsFromLines]));

        if (jobIds.length > 0) {
            const [jobs] = await connection.query(
                `SELECT id, total_amount, advance_paid
                 FROM sarga_jobs
                 WHERE id IN (${jobIds.map(() => '?').join(',')})`,
                jobIds
            );

            // Filter to only unpaid jobs and distribute by remaining balance
            const unpaidJobs = jobs.filter(job => {
                const bal = Number(job.total_amount) - (Number(job.advance_paid) || 0);
                return bal > 0;
            });
            const totalBalance = unpaidJobs.reduce((sum, job) => {
                return sum + (Number(job.total_amount) - (Number(job.advance_paid) || 0));
            }, 0);
            let allocated = 0;

            for (let i = 0; i < unpaidJobs.length; i += 1) {
                const job = unpaidJobs[i];
                const jobTotal = Number(job.total_amount) || 0;
                const jobBalance = jobTotal - (Number(job.advance_paid) || 0);
                let jobAdvance = 0;

                if (totalBalance > 0) {
                    if (i === unpaidJobs.length - 1) {
                        jobAdvance = Math.max(advance - allocated, 0);
                    } else {
                        jobAdvance = (advance * (jobBalance / totalBalance));
                        jobAdvance = Math.round(jobAdvance * 100) / 100;
                        allocated += jobAdvance;
                    }
                }

                // Cap at the remaining balance so we never overpay a single job
                jobAdvance = Math.min(jobAdvance, jobBalance);

                const currentAdvance = Number(job.advance_paid) || 0;
                const nextAdvance = Math.min(jobTotal, currentAdvance + jobAdvance);
                const nextBalance = jobTotal - nextAdvance;
                // Treat balance < 1 as fully paid (rounding dust)
                const effectiveBalance = nextBalance < 1 ? 0 : nextBalance;
                const effectiveAdvance = effectiveBalance === 0 ? jobTotal : nextAdvance;
                const nextStatus = effectiveBalance === 0 ? 'Paid' : (effectiveAdvance > 0 ? 'Partial' : 'Unpaid');

                await connection.query(
                    "UPDATE sarga_jobs SET advance_paid = ?, balance_amount = ?, payment_status = ? WHERE id = ?",
                    [effectiveAdvance, effectiveBalance, nextStatus, job.id]
                );
            }
        }

        await connection.commit();
        auditLog(req.user.id, 'CUSTOMER_PAYMENT_ADD', `Added customer payment ${result.insertId} for ${customer_name}`);
        res.status(201).json({ id: result.insertId, balance_amount: balance, message: 'Customer payment recorded' });
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}));


// --- DASHBOARD STATS ---
router.get('/stats/dashboard', authenticateToken, async (req, res) => {
    const { branch_id, startDate, endDate } = req.query;

    try {
        let branchId;
        if (req.user.role !== 'Admin') {
            branchId = await getUserBranchId(req.user.id);
        } else {
            branchId = (branch_id && branch_id !== 'undefined' && branch_id !== '') ? Number(branch_id) : null;
        }

        let baseWhere = " WHERE 1=1";
        const params = [];

        if (branchId) {
            baseWhere += " AND branch_id = ?";
            params.push(branchId);
        }

        const jobWhere = baseWhere + " AND status != 'Cancelled'";

        // Apply date filters to the main query if provided
        let dateWhere = "";
        const dateParams = [];
        if (startDate) {
            dateWhere += " AND DATE(created_at) >= ?";
            dateParams.push(startDate);
        }
        if (endDate) {
            dateWhere += " AND DATE(created_at) <= ?";
            dateParams.push(endDate);
        }

        const today = new Date().toISOString().split('T')[0];
        const monthStart = new Date();
        monthStart.setDate(1);
        const monthStartStr = monthStart.toISOString().split('T')[0];

        // 1. Job Stats (Respecting Filters)
        const [[jobStats]] = await pool.query(`
            SELECT 
                COUNT(*) as total_count,
                SUM(total_amount) as total_sales,
                SUM(advance_paid) as total_collected,
                SUM(balance_amount) as total_balance,
                COUNT(CASE WHEN DATE(created_at) = ? THEN 1 END) as new_today,
                COUNT(CASE WHEN status = 'Completed' AND DATE(updated_at) = ? THEN 1 END) as completed_today,
                COUNT(CASE WHEN priority = 'Urgent' AND DATE(delivery_date) = ? THEN 1 END) as urgent_today,
                COUNT(CASE WHEN delivery_date < ? AND status NOT IN ('Delivered', 'Cancelled') THEN 1 END) as overdue,
                COUNT(CASE WHEN status IN ('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production') THEN 1 END) as in_progress
            FROM sarga_jobs 
            ${jobWhere} ${dateWhere}
        `, [today, today, today, today, ...params, ...dateParams]);

        // 2. Customer Stats
        const [[custStats]] = await pool.query(`
            SELECT 
                COUNT(CASE WHEN DATE(created_at) = ? AND type = 'Walk-in' THEN 1 END) as walk_in_today
            FROM sarga_customers
            ${baseWhere}
        `, [today, ...params]);

        // 3. Payment/Collection Stats (Respecting Date Filters)
        let payDateWhere = "";
        const payDateParams = [];
        if (startDate) {
            payDateWhere += " AND payment_date >= ?";
            payDateParams.push(startDate);
        }
        if (endDate) {
            payDateWhere += " AND payment_date <= ?";
            payDateParams.push(endDate);
        }

        const [[payStats]] = await pool.query(`
            SELECT 
                SUM(CASE WHEN DATE(payment_date) = ? AND payment_method = 'Cash' THEN advance_paid ELSE 0 END) as cash_today,
                SUM(CASE WHEN DATE(payment_date) = ? AND payment_method = 'UPI' THEN advance_paid ELSE 0 END) as upi_today,
                SUM(CASE WHEN DATE(payment_date) = ? AND payment_method = 'Card' THEN advance_paid ELSE 0 END) as card_today,
                SUM(CASE WHEN DATE(payment_date) = ? THEN advance_paid ELSE 0 END) as total_collected_today,
                SUM(advance_paid) as total_collected
            FROM sarga_customer_payments
            ${baseWhere} ${payDateWhere}
        `, [today, today, today, today, ...params, ...payDateParams]);

        // 4. Monthly Sales & Categories
        const [[salesStats]] = await pool.query(`
            SELECT 
                SUM(CASE WHEN DATE(created_at) >= ? THEN total_amount ELSE 0 END) as month_total,
                COUNT(CASE WHEN DATE(created_at) >= ? THEN 1 END) as bill_count,
                AVG(CASE WHEN DATE(created_at) >= ? THEN total_amount END) as avg_bill,
                SUM(CASE WHEN job_name LIKE '%Offset%' AND DATE(created_at) = ? THEN total_amount ELSE 0 END) as offset_sales,
                SUM(CASE WHEN (job_name LIKE '%Digital%' OR job_name LIKE '%Color%') AND DATE(created_at) = ? THEN total_amount ELSE 0 END) as digital_sales,
                SUM(CASE WHEN job_name LIKE '%Photo%' AND DATE(created_at) = ? THEN total_amount ELSE 0 END) as photocopy_sales,
                SUM(CASE WHEN job_name LIKE '%Memento%' AND DATE(created_at) = ? THEN total_amount ELSE 0 END) as mementos_sales,
                SUM(CASE WHEN job_name LIKE '%Frame%' AND DATE(created_at) = ? THEN total_amount ELSE 0 END) as frames_sales,
                SUM(CASE WHEN job_name LIKE '%ID%' AND DATE(created_at) = ? THEN total_amount ELSE 0 END) as id_cards_sales,
                SUM(CASE WHEN (job_name LIKE '%Binding%' OR job_name LIKE '%Lamination%') AND DATE(created_at) = ? THEN total_amount ELSE 0 END) as binding_sales
            FROM sarga_jobs
            ${jobWhere}
        `, [monthStartStr, monthStartStr, monthStartStr, today, today, today, today, today, today, today, ...params]);

        // 5. Machine Stats
        const [machineReadings] = await pool.query(`
            SELECT m.machine_name, mr.total_copies, mr.reading_date
            FROM sarga_machine_readings mr
            JOIN sarga_machines m ON mr.machine_id = m.id
            WHERE DATE(mr.reading_date) = ? ${branchId ? " AND m.branch_id = ?" : ""}
        `, [today, ...(branchId ? [branchId] : [])]);

        const machineMap = {};
        machineReadings.forEach(r => {
            const name = r.machine_name.toLowerCase();
            if (name.includes('4065')) machineMap.konica_4065_pages = r.total_copies;
            if (name.includes('3070')) machineMap.konica_3070_pages = r.total_copies;
        });

        // 6. Recent Jobs
        const [recentJobs] = await pool.query(`
            SELECT j.id, j.job_number, j.job_name, j.total_amount, j.status, j.payment_status, j.created_at,
                   COALESCE(c.name, 'Walk-in') as customer_name
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            WHERE 1=1 ${branchId ? " AND j.branch_id = ?" : ""} AND j.status != 'Cancelled'
            ORDER BY j.created_at DESC
            LIMIT 5
        `, branchId ? [branchId] : []);

        // 7. Status Counts
        const [statusCounts] = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM sarga_jobs 
            ${jobWhere} 
            GROUP BY status
        `, params);

        const statusMap = {};
        statusCounts.forEach(r => statusMap[r.status] = r.count);

        res.json({
            jobs: {
                total_count: jobStats.total_count || 0,
                total_sales: Number(jobStats.total_sales) || 0,
                total_collected: Number(jobStats.total_collected) || 0,
                total_balance: Number(jobStats.total_balance) || 0,
                new_today: jobStats.new_today || 0,
                completed_today: jobStats.completed_today || 0,
                urgent_today: jobStats.urgent_today || 0,
                overdue: jobStats.overdue || 0,
                in_progress: jobStats.in_progress || 0
            },
            customers: {
                walk_in_today: custStats.walk_in_today || 0
            },
            payments: {
                cash_today: Number(payStats.cash_today) || 0,
                upi_today: Number(payStats.upi_today) || 0,
                card_today: Number(payStats.card_today) || 0,
                total_collected_today: Number(payStats.total_collected_today) || 0,
                total_amount: Number(payStats.total_collected) || 0
            },
            sales: {
                month_total: Number(salesStats.month_total) || 0,
                bill_count: salesStats.bill_count || 0,
                avg_bill: Number(salesStats.avg_bill) || 0,
                offset: Number(salesStats.offset_sales) || 0,
                digital: Number(salesStats.digital_sales) || 0,
                photocopy: Number(salesStats.photocopy_sales) || 0,
                mementos: Number(salesStats.mementos_sales) || 0,
                frames: Number(salesStats.frames_sales) || 0,
                id_cards: Number(salesStats.id_cards_sales) || 0,
                binding: Number(salesStats.binding_sales) || 0
            },
            machines: machineMap,
            recent_jobs: recentJobs,
            status_counts: statusMap
        });
    } catch (err) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;

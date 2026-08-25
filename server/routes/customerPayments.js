const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, _hasPendingCustomerBalance, _bumpUsageForUser, auditLog, _auditFieldChanges, getNextInvoiceNumber, normalizeMobileWithCountry, asyncHandler, getTodayDate } = require('../helpers');
const { attachNormalizedMobile } = require('../middleware/phone');
const { branchFilter } = require('../middleware/branchFilter');
const { paginate } = require('../helpers/pagination');
const { validate } = require('../middleware/validate');
const { customerPaymentSchema } = require('../schemas/paymentSchemas');
const { invalidateDashboardCache, invalidateAnalyticsCache, invalidateCustomerCache } = require('../services/cacheService');
const { redisCache } = require('../middleware/cache');
const { customerCache } = require('../middleware/cache');

const normalizeBookType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'laser') return 'Laser';
    if (normalized === 'other') return 'Other';
    return 'Offset';
};

const CUSTOMER_PAYMENT_LIST_COLUMNS = [
    'id',
    'customer_id',
    'customer_name',
    'customer_mobile',
    'bill_amount',
    'total_amount',
    'net_amount',
    'sgst_amount',
    'cgst_amount',
    'advance_paid',
    'balance_amount',
    'payment_method',
    'cash_amount',
    'upi_amount',
    'branch_id',
    'reference_number',
    'description',
    'discount_percent',
    'discount_amount',
    'payment_date',
    'created_at',
    'verification_status',
    'verified_by',
    'verified_at',
    'verification_note',
    'is_internal',
    'internal_department'
].join(', ');

// --- CUSTOMER PAYMENT ROUTES ---

// List Customer Payments
router.get('/customer-payments', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), customerCache(), async (req, res) => {
    try {
        const { customer_id, startDate, endDate, search, exclude_internal } = req.query;
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

        let whereClauses = [];
        const params = [];
        let needsInvoiceJoin = false;

        // Branch filter for non-admin
        const branchScope = await branchFilter(req, { column: 'cp.branch_id', allowPrivilegedQuery: false });
        if (branchScope.clause && branchScope.clause.trim().length > 0) {
            whereClauses.push(branchScope.clause.replace(/^\s*AND\s*/, '').trim());
            params.push(...branchScope.params);
        }

        if (customer_id) {
            whereClauses.push('cp.customer_id = ?');
            params.push(customer_id);
        }
        if (startDate) {
            whereClauses.push('cp.payment_date >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereClauses.push('cp.payment_date <= ?');
            params.push(endDate);
        }
        if (search) {
            needsInvoiceJoin = true;
            const searchPattern = `%${search}%`;
            whereClauses.push('(cp.description LIKE ? OR cp.customer_name LIKE ? OR cp.reference_number LIKE ? OR i.invoice_number LIKE ?)');
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        if (exclude_internal === '1') {
            whereClauses.push('(cp.is_internal IS NULL OR cp.is_internal = 0)');
        }

        const whereSection = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';

        // Optimized COUNT — only LEFT JOIN when search references invoice_number
        const countJoin = needsInvoiceJoin ? ' LEFT JOIN sarga_invoices i ON i.payment_id = cp.id' : '';
        const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM sarga_customer_payments cp${countJoin} ${whereSection}`, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;
        
        const [rows] = await pool.query(
            `SELECT cp.id, cp.customer_id, cp.customer_name, cp.customer_mobile, cp.bill_amount, cp.total_amount, cp.advance_paid, cp.balance_amount, cp.payment_method, cp.verification_status, cp.reference_number, cp.description, cp.payment_date, cp.created_at, cp.is_internal, cp.internal_department,
                    cp.net_amount, cp.sgst_amount, cp.cgst_amount, cp.discount_percent, cp.discount_amount, cp.order_lines,
                    i.invoice_number, it.status as invoice_status, it.due_date as invoice_due_date
             FROM sarga_customer_payments cp
             LEFT JOIN sarga_invoices i ON i.payment_id = cp.id
             LEFT JOIN sarga_invoice_tracking it ON it.payment_id = cp.id
             ${whereSection}
             ORDER BY cp.payment_date DESC, cp.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json(response(rows || [], total));
    } catch (err) {
        console.error('[ERROR] List customer payments:', err.message || err);
        console.error('[ERROR] Stacktrace:', err.stack);
        res.status(500).json({
            message: 'Database error'
        });
    }
});

// Debug Logs Endpoint
router.get('/customer-payments/debug-logs', authenticateToken, authorizeRoles('Admin'), (req, res) => {
    res.json(global.recentValidationErrors || []);
});

// Add Customer Payment
router.post('/customer-payments', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(customerPaymentSchema), attachNormalizedMobile('customer_mobile', 'customer_country_code'), asyncHandler(async (req, res) => {
    const {
        customer_id,
        customer_name,
        customer_mobile,
        customer_email: req_customer_email,
        total_amount,
        bill_amount: req_bill_amount,
        net_amount,
        sgst_amount,
        cgst_amount,
        discount_percent,
        discount_amount,
        advance_paid,
        payment_method,
        cash_amount,
        upi_amount,
        cheque_amount,
        account_transfer_amount,
        reference_number,
        description,
        payment_date,
        order_lines,
        job_ids,
        auto_deliver,
        coupon_code,
        book_type,
        payment_target_book: req_payment_target_book,
        is_internal: req_is_internal,
        internal_department: req_internal_dept
    } = req.body;
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();

    // Helper to record route-level validation errors
    const recordRouteError = (message) => {
        if (!global.recentValidationErrors) global.recentValidationErrors = [];
        global.recentValidationErrors.push({
            timestamp: new Date().toISOString(),
            method: 'POST',
            path: '/customer-payments (route-level)',
            body: req.body,
            errors: [{ field: 'route', message }]
        });
        if (global.recentValidationErrors.length > 50) global.recentValidationErrors.shift();
    };

    // --- DIAGNOSTIC LOG: remove after debugging ---
    console.log('[customer-payments POST] key=%s | customer=%s | total=%s | advance=%s | method=%s | cash=%s | upi=%s | cheque=%s | transfer=%s | date=%s | target_book=%s',
        idempotencyKey ? 'present' : 'MISSING',
        customer_name,
        total_amount,
        advance_paid,
        payment_method,
        cash_amount,
        upi_amount,
        cheque_amount,
        account_transfer_amount,
        payment_date,
        req_payment_target_book || book_type
    );

    if (!idempotencyKey) {
        recordRouteError('Idempotency-Key header is required');
        return res.status(400).json({ message: 'Idempotency-Key header is required for customer payment submission.' });
    }
    if (idempotencyKey.length > 100) {
        recordRouteError('Idempotency-Key must be 100 characters or fewer');
        return res.status(400).json({ message: 'Idempotency-Key must be 100 characters or fewer.' });
    }

    const total = Number(total_amount) || 0;
    const billTotal = Number(req_bill_amount) || total; // original pre-discount amount; falls back to total
    const advance = Number(advance_paid) || 0;
    const cash = Number(cash_amount) || 0;
    const upi = Number(upi_amount) || 0;
    const cheque = Number(cheque_amount) || 0;
    const transfer = Number(account_transfer_amount) || 0;
    const _method = String(payment_method || 'Cash');
    const balance = total - advance;

    // C-03: advance cannot exceed total (and values cannot be negative)
    if (total < 0 || advance < 0 || cash < 0 || upi < 0 || cheque < 0 || transfer < 0) {
        recordRouteError('Amounts cannot be negative');
        return res.status(400).json({ message: 'Amounts cannot be negative.' });
    }
    // C-03: advance cannot exceed total with tolerance for rounding/discount edge cases
    // Zod refine allows up to 1%; route check matches that plus a flat ₹1 floor for small amounts
    if (advance > Math.max(total * 1.01, total + 1)) {
        recordRouteError(`Advance (${advance}) exceeds total (${total})`);
        return res.status(400).json({ message: `Advance (₹${advance}) cannot exceed total amount (₹${total})` });
    }

    // C-07: Multi-method payment validation
    const methodTotal = cash + upi + cheque + transfer;
    if (Math.abs(methodTotal - advance) > 1) {
        recordRouteError(`Payment methods total (${methodTotal}) does not equal advance paid (${advance})`);
        return res.status(400).json({ message: `Payment methods total (₹${methodTotal.toFixed(2)}) must equal advance paid (₹${advance.toFixed(2)})` });
    }
    
    // At least one method must have a positive amount when advance is paid
    const totalPaidViaMethods = [cash, upi, cheque, transfer].reduce((sum, amount) => sum + (Number(amount) || 0), 0);
    const isInternal = req_is_internal ? 1 : 0;
    const internalDept = isInternal ? (req_internal_dept || null) : null;

    if (!isInternal && advance > 0 && totalPaidViaMethods <= 0) {
        recordRouteError('At least one payment method must have an amount greater than 0');
        return res.status(400).json({ message: 'At least one payment method must have an amount greater than 0.' });
    }

    const startTotalTime = Date.now();
    console.time('[PMT-PERF] Total Handler Time');
    console.time('[PMT-PERF] 1. Get Connection & Begin Transaction');
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    console.timeEnd('[PMT-PERF] 1. Get Connection & Begin Transaction');

    try {
        const [existingByKey] = await connection.query('SELECT id FROM sarga_customer_payments WHERE idempotency_key = ? LIMIT 1', [idempotencyKey]);
        if (existingByKey.length > 0) {
            await connection.rollback();
            return res.status(200).json({
                message: 'Duplicate customer payment request ignored (idempotent replay).',
                duplicate: true,
                id: existingByKey[0].id
            });
        }

        const { branchId } = await branchFilter(req, { allowPrivilegedQuery: false });
        let resolvedCustomerId = customer_id || null;

        console.time('[PMT-PERF] 2. Customer Lookup & Email Update');
        if (!resolvedCustomerId && customer_mobile) {
            const normalizedMobile = normalizeMobileWithCountry(customer_mobile, req.body?.customer_country_code);
            if (normalizedMobile.length === 10) {
                // Search across all branches — a customer can pay at any branch
                const [rows] = await connection.query(
                    "SELECT id FROM sarga_customers WHERE mobile = ?",
                    [normalizedMobile]
                );
                resolvedCustomerId = rows[0]?.id || null;
            }
        }

        if (resolvedCustomerId && req_customer_email && String(req_customer_email).trim()) {
            try {
                await connection.query(
                    "UPDATE sarga_customers SET email = ? WHERE id = ? AND (email IS NULL OR email = '' OR email != ?)",
                    [String(req_customer_email).trim(), resolvedCustomerId, String(req_customer_email).trim()]
                );
            } catch (emailErr) {
                console.warn('[Payment] Update customer email warning:', emailErr.message);
            }
        }
        console.timeEnd('[PMT-PERF] 2. Customer Lookup & Email Update');

        // Validate and track coupon usage if provided
        console.time('[PMT-PERF] 3. Coupon Lookup & Update');
        let resolvedCouponCode = null;
        if (coupon_code && coupon_code.trim()) {
            const cleanCoupon = coupon_code.trim().toUpperCase().replace(/\s+/g, '');
            const [couponRows] = await connection.query('SELECT * FROM sarga_coupons WHERE code = ? FOR UPDATE', [cleanCoupon]);
            if (couponRows.length > 0) {
                const coupon = couponRows[0];
                const isValid = coupon.is_active
                    && (coupon.max_uses === null || coupon.used_count < coupon.max_uses)
                    && (!coupon.expiry_date || new Date(coupon.expiry_date) >= new Date(getTodayDate()));
                if (isValid) {
                    resolvedCouponCode = cleanCoupon;
                    await connection.query('UPDATE sarga_coupons SET used_count = used_count + 1 WHERE id = ?', [coupon.id]);
                }
            }
        }
        console.timeEnd('[PMT-PERF] 3. Coupon Lookup & Update');

        const targetBook = normalizeBookType(req_payment_target_book || book_type);
        const legacyBookType = targetBook;

        console.time('[PMT-PERF] 4. Payment Record Insert');
        let paymentId;
        try {
            const [result] = await connection.query(
                `INSERT INTO sarga_customer_payments
                (customer_id, customer_name, customer_mobile, bill_amount, total_amount, net_amount, sgst_amount, cgst_amount, discount_percent, discount_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, cheque_amount, account_transfer_amount, branch_id, reference_number, description, payment_date, order_lines, idempotency_key, coupon_code, book_type, payment_target_book, is_internal, internal_department)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    resolvedCustomerId,
                    String(customer_name).trim(),
                    customer_mobile || null,
                    billTotal,
                    total,
                    Number(net_amount) || 0,
                    Number(sgst_amount) || 0,
                    Number(cgst_amount) || 0,
                    Number(discount_percent) || 0,
                    Number(discount_amount) || 0,
                    advance,
                    balance,
                    isInternal ? 'Internal' : (payment_method || 'Cash'),
                    cash,
                    upi,
                    cheque,
                    transfer,
                    branchId,
                    reference_number || null,
                    description || null,
                    payment_date,
                    JSON.stringify(order_lines || []),
                    idempotencyKey,
                    resolvedCouponCode,
                    legacyBookType,
                    targetBook,
                    isInternal,
                    internalDept
                ]
            );
            paymentId = result.insertId;
        } catch (err) {
            if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
                const [result] = await connection.query(
                    `INSERT INTO sarga_customer_payments
                    (customer_id, customer_name, customer_mobile, bill_amount, total_amount, net_amount, sgst_amount, cgst_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, cheque_amount, account_transfer_amount, branch_id, reference_number, description, payment_date, order_lines, idempotency_key)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        resolvedCustomerId,
                        String(customer_name).trim(),
                        customer_mobile || null,
                        billTotal,
                        total,
                        Number(net_amount) || 0,
                        Number(sgst_amount) || 0,
                        Number(cgst_amount) || 0,
                        advance,
                        balance,
                        payment_method || 'Cash',
                        cash,
                        upi,
                        cheque,
                        transfer,
                        branchId,
                        reference_number || null,
                        description || null,
                        payment_date,
                        JSON.stringify(order_lines || []),
                        idempotencyKey
                    ]
                );
                paymentId = result.insertId;
            } else {
                throw err;
            }
        }
        console.timeEnd('[PMT-PERF] 4. Payment Record Insert');

        console.time('[PMT-PERF] 5. Order Lines Loop (Job Inserts & Inventory Reserve)');
        if (resolvedCustomerId && Array.isArray(order_lines) && order_lines.length > 0 && (!Array.isArray(job_ids) || job_ids.length === 0)) {
            const totalLineAmount = order_lines.reduce((sum, line) => sum + (Number(line.total_amount) || 0), 0);
            let allocatedAdvance = 0;

            for (let i = 0; i < order_lines.length; i += 1) {
                const line = order_lines[i] || {};
                const isNewJobCreated = !line.job_id;
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
                const lineBookType = normalizeBookType(line.book_type || line.bookType || targetBook);

                try {
                    const [jobInsert] = await connection.query(
                        `INSERT INTO sarga_jobs
                        (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras, category, subcategory, book_type, machine_id, waste_prints, proof_prints, payment_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                            JSON.stringify(line.applied_extras || []),
                            line.category || null,
                            line.subcategory || null,
                            lineBookType,
                            line.machine_id || null,
                            Number(line.waste_prints) || 0,
                            Number(line.proof_prints) || 0,
                            paymentId
                        ]
                    );
                    if (jobInsert && jobInsert.insertId) line.job_id = jobInsert.insertId;
                } catch (err) {
                    if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
                        const [jobInsert] = await connection.query(
                            `INSERT INTO sarga_jobs
                            (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras, payment_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                                JSON.stringify(line.applied_extras || []),
                                paymentId
                            ]
                        );
                        if (jobInsert && jobInsert.insertId) line.job_id = jobInsert.insertId;
                    } else {
                        throw err;
                    }
                }
                // Reserve inventory for linked product if a new job was created in this request
                if (isNewJobCreated && line.job_id && line.product_id) {
                    try {
                        const [[prodRow]] = await connection.query('SELECT inventory_item_id FROM sarga_products WHERE id = ? FOR UPDATE', [line.product_id]);
                        const invId = prodRow ? prodRow.inventory_item_id : null;
                        const qty = Number(line.quantity) || 1;
                        if (invId) {
                            const [[invRow]] = await connection.query('SELECT quantity, COALESCE(reserved_quantity,0) AS reserved FROM sarga_inventory WHERE id = ? FOR UPDATE', [invId]);
                            const available = (invRow ? Number(invRow.quantity || 0) : 0) - Number(invRow?.reserved || 0);
                            if (available < qty) {
                                await connection.rollback();
                                return res.status(409).json({ message: `Insufficient stock to reserve for item ${line.product_name || line.product_id}` });
                            }
                            await connection.query('UPDATE sarga_inventory SET reserved_quantity = COALESCE(reserved_quantity,0) + ? WHERE id = ?', [qty, invId]);
                        }
                    } catch (reserveErr) {
                        console.error('Reserve failed (payment job create):', reserveErr.message || reserveErr);
                        await connection.rollback();
                        return res.status(409).json({ message: reserveErr.message || 'Insufficient stock' });
                    }
                }
            }
        }
        console.timeEnd('[PMT-PERF] 5. Order Lines Loop (Job Inserts & Inventory Reserve)');

        console.time('[PMT-PERF] 6. Job Updates & Machine Sync Loop');

        const jobIdsFromLines = Array.isArray(order_lines)
            ? order_lines.map((line) => line?.job_id).filter(Boolean)
            : [];
        const jobIds = Array.from(new Set([...(Array.isArray(job_ids) ? job_ids : []), ...jobIdsFromLines]));

        if (jobIds.length > 0) {
            const [jobs] = await connection.query(
                `SELECT j.id, j.job_number, j.job_name, j.quantity, j.total_amount, j.advance_paid, j.balance_amount, j.payment_status, j.machine_id,
                       COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
                 FROM sarga_jobs j
                 LEFT JOIN sarga_customers c ON j.customer_id = c.id
                 WHERE j.id IN (${jobIds.map(() => '?').join(',')})`,
                jobIds
            );

            // If discount applied, compute ratio to scale each job's effective total
            const discountRatio = billTotal > 0 && billTotal > total ? total / billTotal : 1;

            // Filter to only unpaid jobs and distribute by remaining balance
            const unpaidJobs = jobs.filter(job => {
                const jt = Number(job.total_amount) || 0;
                const effJT = Math.round(jt * discountRatio * 100) / 100;
                const bal = effJT - (Number(job.advance_paid) || 0);
                return bal > 0;
            });
            const totalBalance = unpaidJobs.reduce((sum, job) => {
                const jt = Number(job.total_amount) || 0;
                const effJT = Math.round(jt * discountRatio * 100) / 100;
                return sum + (effJT - (Number(job.advance_paid) || 0));
            }, 0);
            let allocated = 0;

            for (let i = 0; i < unpaidJobs.length; i += 1) {
                const job = unpaidJobs[i];
                const jobTotal = Number(job.total_amount) || 0;
                // Effective job total after discount applied proportionally
                const effectiveJobTotal = Math.round(jobTotal * discountRatio * 100) / 100;
                const jobBalance = effectiveJobTotal - (Number(job.advance_paid) || 0);
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
                const nextAdvance = Math.min(effectiveJobTotal, currentAdvance + jobAdvance);
                const rawBalance = effectiveJobTotal - nextAdvance;
                const nextBalance = Math.max(0, Math.round(rawBalance * 100) / 100);
                // Treat balance <= 0.01 as fully paid (rounding dust)
                const effectiveBalance = nextBalance <= 0.01 ? 0 : nextBalance;
                const effectiveAdvance = effectiveBalance === 0 ? effectiveJobTotal : Math.round(nextAdvance * 100) / 100;
                const nextStatus = effectiveBalance === 0 ? 'Paid' : (effectiveAdvance > 0 ? 'Partial' : 'Unpaid');

                // If auto_deliver (walk-in), mark job as Delivered on payment
                if (auto_deliver) {
                    await connection.query(
                        "UPDATE sarga_jobs SET advance_paid = ?, balance_amount = ?, payment_status = ?, status = 'Delivered' WHERE id = ?",
                        [effectiveAdvance, effectiveBalance, nextStatus, job.id]
                    );
                } else {
                    await connection.query(
                        "UPDATE sarga_jobs SET advance_paid = ?, balance_amount = ?, payment_status = ? WHERE id = ?",
                        [effectiveAdvance, effectiveBalance, nextStatus, job.id]
                    );
                }

                // SYNC TO MACHINE
                if (job.machine_id) {
                    try {
                        // Import helper on the fly to avoid circular dependencies if any
                        const { syncJobToMachineWorkEntry } = require('./jobs');

                        // Recalculate UPI/Cash split for this specific job's share
                        // For simplicity, we'll pass the whole payment's ratio
                        const cashRatio = total > 0 ? cash / total : 1;
                        const upiRatio = total > 0 ? upi / total : 0;

                        await syncJobToMachineWorkEntry({
                            id: job.id,
                            job_number: job.job_number,
                            job_name: job.job_name,
                            quantity: job.quantity,
                            total_amount: effectiveAdvance,
                            advance_paid: effectiveAdvance,
                            cash_amount: effectiveAdvance * cashRatio,
                            upi_amount: effectiveAdvance * upiRatio,
                            balance_amount: effectiveBalance,
                            payment_status: nextStatus,
                            customer_name: job.customer_name
                        }, job.machine_id, req.user.id);
                    } catch (syncErr) {
                        console.error(`[MachineSync] Trigger failed for job ${job.id}:`, syncErr);
                    }
                }
            }

            // If auto_deliver, also mark any remaining jobs (e.g. zero-total) as Delivered
            if (auto_deliver) {
                const processedIds = unpaidJobs.map(j => j.id);
                const remainingJobs = jobs.filter(j => !processedIds.includes(j.id));
                for (const job of remainingJobs) {
                    await connection.query(
                        "UPDATE sarga_jobs SET status = 'Delivered' WHERE id = ? AND status != 'Delivered'",
                        [job.id]
                    );
                }
            }
        }
        console.timeEnd('[PMT-PERF] 6. Job Updates & Machine Sync Loop');

        // ─── Link jobs to this payment ───
        console.time('[PMT-PERF] 7. Link Jobs');
        if (jobIds.length > 0) {
            try {
                await connection.query(
                    `UPDATE sarga_jobs SET payment_id = ? WHERE id IN (${jobIds.map(() => '?').join(',')})`,
                    [paymentId, ...jobIds]
                );
            } catch (linkErr) {
                if (linkErr.code !== 'ER_BAD_FIELD_ERROR') console.error('[Payment] Link jobs error:', linkErr.message);
            }
        }
        console.timeEnd('[PMT-PERF] 7. Link Jobs');

        // ─── Generate gap-free invoice number (inside transaction for atomicity) ───
        console.time('[PMT-PERF] 8. Invoice Generation & Sequence');
        let invoiceNumber = null;
        try {
            invoiceNumber = await getNextInvoiceNumber(connection, 'INV');
            await connection.query(
                `INSERT INTO sarga_invoices
                 (invoice_number, financial_year, payment_id, customer_id, total_amount, tax_amount, net_amount, generated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invoiceNumber,
                    invoiceNumber.split('/')[1] || '', // extract FY from 'INV/2025-26/00042'
                    paymentId,
                    resolvedCustomerId,
                    total,
                    (Number(sgst_amount) || 0) + (Number(cgst_amount) || 0),
                    Number(net_amount) || total,
                    req.user.id,
                ]
            );
        } catch (invErr) {
            // Invoice generation is non-critical — log and continue
            console.error('[Invoice] Sequence error:', invErr.message);
        }
        console.timeEnd('[PMT-PERF] 8. Invoice Generation & Sequence');

        // ─── Deduct inventory stock for inventory items in order and consume any reservation ───
        console.time('[PMT-PERF] 9. Inventory Stock Deductions Loop');
        if (Array.isArray(order_lines)) {
            for (const line of order_lines) {
                if (line.is_inventory_item && line.inventory_item_id) {
                    const qty = Number(line.quantity) || 1;
                    const invId = line.inventory_item_id;

                    // Decrement global reserved quantity
                    await connection.query(
                        "UPDATE sarga_inventory SET reserved_quantity = GREATEST(COALESCE(reserved_quantity,0) - ?, 0) WHERE id = ?",
                        [qty, invId]
                    );

                    if (branchId) {
                        // Deduct from branch-level stock
                        const [bsBefore] = await connection.query(
                            'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
                            [invId, branchId]
                        );
                        const qtyBefore = Number(bsBefore[0]?.quantity || 0);
                        await connection.query(
                            'UPDATE sarga_branch_stock SET quantity = GREATEST(quantity - ?, 0) WHERE inventory_item_id = ? AND branch_id = ?',
                            [qty, invId, branchId]
                        );
                        // Recalculate global inventory quantity from branch stock sum
                        await connection.query(
                            `UPDATE sarga_inventory i SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id) WHERE id = ?`,
                            [invId]
                        );
                        // Log movement
                        await connection.query(
                            `INSERT INTO sarga_inventory_movement_log (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, created_by)
                             VALUES (?, ?, 'Consumption', ?, ?, GREATEST(?, 0), 'customer_payment', ?, ?)`,
                            [invId, branchId, -qty, qtyBefore, qtyBefore - qty, paymentId, req.user.id]
                        );
                    } else {
                        // Fallback: no branch context — deduct from global directly
                        await connection.query(
                            "UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?",
                            [qty, invId]
                        );
                    }
                }
            }
        }
        console.timeEnd('[PMT-PERF] 9. Inventory Stock Deductions Loop');

        // ─── Audit log inside transaction ───
        console.time('[PMT-PERF] 10. Audit Log');
        await connection.query(
            `INSERT INTO sarga_audit_logs (user_id_internal, action, details, entity_type, entity_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, 'CUSTOMER_PAYMENT_ADD', `Payment ${paymentId}${invoiceNumber ? ` (${invoiceNumber})` : ''} for ${customer_name}: ₹${total}`, 'payment', paymentId, req.ip]
        );
        console.timeEnd('[PMT-PERF] 10. Audit Log');

        console.time('[PMT-PERF] 11. Transaction Commit');
        await connection.commit();
        console.timeEnd('[PMT-PERF] 11. Transaction Commit');
        console.timeEnd('[PMT-PERF] Total Handler Time');
        console.log(`[PMT-PERF] Finished POST /customer-payments in ${Date.now() - startTotalTime}ms`);

        // Auto-send the invoice to the customer's email (fire-and-forget) if available
        if (invoiceNumber && !isInternal) {
            const { sendInvoiceEmail } = require('../services/invoiceEmailService');
            sendInvoiceEmail(paymentId, req_customer_email).catch((e) => console.error('[InvoiceEmail] Auto-send error:', e?.message || e));
        }

        res.status(201).json({ id: paymentId, invoice_number: invoiceNumber, balance_amount: balance, message: 'Customer payment recorded' });
        invalidateDashboardCache().catch(() => {});
        invalidateAnalyticsCache().catch(() => {});
        invalidateCustomerCache().catch(() => {});
    } catch (err) {
        await connection.rollback();
        if (err?.code === 'ER_DUP_ENTRY') {
            const [existingByKey] = await pool.query('SELECT id FROM sarga_customer_payments WHERE idempotency_key = ? LIMIT 1', [idempotencyKey]);
            return res.status(200).json({
                message: 'Duplicate customer payment request ignored (idempotent replay).',
                duplicate: true,
                id: existingByKey[0]?.id
            });
        }
        throw err;
    } finally {
        connection.release();
    }
}));


// --- REFUND ---
router.post('/customer-payments/refund', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), asyncHandler(async (req, res) => {
    const { job_id, customer_id, refund_amount, refund_method, reason } = req.body;
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();

    if (!idempotencyKey) {
        return res.status(400).json({ message: 'Idempotency-Key header is required for refund submission.' });
    }
    if (idempotencyKey.length > 100) {
        return res.status(400).json({ message: 'Idempotency-Key must be 100 characters or fewer.' });
    }

    if (!job_id) return res.status(400).json({ message: 'job_id is required' });
    const amount = Number(refund_amount);
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid refund amount' });

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const [existingRefund] = await connection.query('SELECT id FROM sarga_refunds WHERE idempotency_key = ? LIMIT 1', [idempotencyKey]);
        if (existingRefund.length > 0) {
            await connection.rollback();
            return res.status(200).json({
                message: 'Duplicate refund request ignored (idempotent replay).',
                duplicate: true,
                refund_id: existingRefund[0].id
            });
        }

        // Fetch the job
        const [jobs] = await connection.query(
            'SELECT id, job_number, customer_id, customer_name, branch_id, total_amount, advance_paid FROM sarga_jobs WHERE id = ?',
            [job_id]
        );
        if (jobs.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Job not found' });
        }

        const job = jobs[0];
        const currentAdvance = Number(job.advance_paid) || 0;

        if (amount > currentAdvance) {
            await connection.rollback();
            return res.status(400).json({ message: `Refund amount exceeds advance paid (₹${currentAdvance})` });
        }

        // Get branch ID
        const branchScope = await branchFilter(req, { allowPrivilegedQuery: false });
        const branchId = branchScope.isPrivileged ? job.branch_id : branchScope.branchId;

        // Insert refund record
        const [refundResult] = await connection.query(
            `INSERT INTO sarga_refunds (job_id, customer_id, idempotency_key, refund_amount, refund_method, reason, processed_by, branch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [job_id, customer_id || job.customer_id, idempotencyKey, amount, refund_method || 'Cash', reason || 'Refund', req.user.id, branchId]
        );

        // Update job: reduce advance_paid, increase balance_amount, update payment_status
        const newAdvance = currentAdvance - amount;
        const jobTotal = Number(job.total_amount) || 0;
        const newBalance = jobTotal - newAdvance;
        const newPaymentStatus = newAdvance >= jobTotal ? 'Paid' : (newAdvance > 0 ? 'Partial' : 'Unpaid');

        await connection.query(
            'UPDATE sarga_jobs SET advance_paid = ?, balance_amount = ?, payment_status = ? WHERE id = ?',
            [newAdvance, newBalance, newPaymentStatus, job_id]
        );

        // C-04: Create reverse payment ledger entry for audit trail
        await connection.query(
            `INSERT INTO sarga_customer_payments 
            (customer_id, customer_name, bill_amount, total_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, branch_id, description, payment_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
            [
                customer_id || job.customer_id,
                job.customer_name || 'Refund',
                -amount, -amount, -amount, 0,
                refund_method || 'Cash',
                refund_method === 'Cash' ? -amount : 0,
                refund_method === 'UPI' ? -amount : 0,
                branchId,
                `Refund for job ${job.job_number}: ${reason || 'Refund'}`
            ]
        ).catch(err => console.error('Reverse ledger entry failed:', err.message));

        // Log status history for the refund
        await connection.query(
            `INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)`,
            [job_id, `Refund: ₹${amount}`, req.user.id]
        ).catch(() => { });

        // Sync to machine if applicable
        if (job.machine_id) {
            try {
                const { syncJobToMachineWorkEntry } = require('./jobs');
                await syncJobToMachineWorkEntry({
                    id: job.id,
                    job_number: job.job_number,
                    job_name: job.job_name,
                    quantity: job.quantity,
                    total_amount: jobTotal,
                    advance_paid: newAdvance,
                    cash_amount: refund_method === 'Cash' ? newAdvance : 0,
                    upi_amount: refund_method === 'UPI' ? newAdvance : 0,
                    balance_amount: newBalance,
                    payment_status: newPaymentStatus,
                    customer_name: job.customer_name
                }, job.machine_id, req.user.id);
            } catch (syncErr) {
                console.error(`[MachineSync] Refund sync failed for job ${job_id}:`, syncErr);
            }
        }

        await connection.commit();
        auditLog(req.user.id, 'CUSTOMER_REFUND', `Refund ₹${amount} for job ${job.job_number} (ID: ${job_id})`);
        res.json({ id: refundResult.insertId, message: `Refund of ₹${amount} processed successfully`, new_advance: newAdvance, new_balance: newBalance });
    } catch (err) {
        await connection.rollback();
        if (err?.code === 'ER_DUP_ENTRY') {
            const [existingRefund] = await pool.query('SELECT id FROM sarga_refunds WHERE idempotency_key = ? LIMIT 1', [idempotencyKey]);
            return res.status(200).json({
                message: 'Duplicate refund request ignored (idempotent replay).',
                duplicate: true,
                refund_id: existingRefund[0]?.id
            });
        }
        throw err;
    } finally {
        connection.release();
    }
}));


// --- DASHBOARD STATS ---
router.get('/stats/dashboard', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), redisCache(60, 'dashboard'), async (req, res) => {
    const { branch_id, startDate, endDate } = req.query;

    // Per-query timing profiler — logs any query exceeding 200ms
    const profileLog = [];
    const profile = (label) => {
        const start = process.hrtime.bigint();
        return {
            done: () => {
                const ms = Number(process.hrtime.bigint() - start) / 1e6;
                profileLog.push({ label, ms });
                if (ms > 200) console.warn(`[Dashboard Profiler] ${label}: ${ms.toFixed(1)}ms`);
            }
        };
    };

    try {
        let branchIds = null;
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            const userBranch = await getUserBranchId(req.user.id);
            branchIds = userBranch ? [userBranch] : null;
        } else if (branch_id && branch_id !== 'undefined' && branch_id !== '') {
            branchIds = branch_id.split(',').map(Number).filter(Boolean);
            if (branchIds.length === 0) branchIds = null;
        }

        let baseWhere = " WHERE 1=1";
        const params = [];

        if (branchIds) {
            baseWhere += " AND branch_id IN (?)";
            params.push(branchIds);
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

        const today = getTodayDate();
        const monthStartStr = today.slice(0, 8) + '01';

        const endpointStart = process.hrtime.bigint();

        // --- Define all independent query promises (timers start roughly in parallel) ---

        // 1. Job Stats + Monthly Sales & Categories (merged into one sarga_jobs scan)
        const jobSalesPromise = (async () => {
            const p = profile('jobStats+salesStats merged');
            const [[result]] = await pool.query(`
                SELECT 
                    COUNT(*) as total_count,
                    SUM(total_amount) as total_sales,
                    SUM(CASE WHEN DATE(created_at) = ? THEN total_amount ELSE 0 END) as total_sales_today,
                    SUM(advance_paid) as total_collected,
                    SUM(GREATEST(COALESCE(total_amount, 0) - COALESCE(advance_paid, 0), 0)) as total_balance,
                    COUNT(CASE WHEN DATE(created_at) = ? THEN 1 END) as new_today,
                    COUNT(CASE WHEN status = 'Completed' AND DATE(updated_at) = ? THEN 1 END) as completed_today,
                    COUNT(CASE WHEN priority = 'Urgent' AND DATE(delivery_date) = ? THEN 1 END) as urgent_today,
                    COUNT(CASE WHEN delivery_date < ? AND status NOT IN ('Delivered', 'Cancelled') THEN 1 END) as overdue,
                    COUNT(CASE WHEN status IN ('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production') THEN 1 END) as in_progress,
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
                ${jobWhere} ${dateWhere}
            `, [today, today, today, today, today, monthStartStr, monthStartStr, monthStartStr, today, today, today, today, today, today, today, ...params, ...dateParams]);
            p.done();
            return result;
        })();

        // 2. Customer Stats
        const customerPromise = (async () => {
            const p = profile('customerStats');
            const [[result]] = await pool.query(`
                SELECT 
                    COUNT(CASE WHEN DATE(created_at) = ? AND type = 'Walk-in' THEN 1 END) as walk_in_today
                FROM sarga_customers
                ${baseWhere}
            `, [today, ...params]);
            p.done();
            return result;
        })();

        // 3. Payment/Collection Stats
        const paymentPromise = (async () => {
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
            const p = profile('paymentStats');
            const [[result]] = await pool.query(`
                SELECT 
                    SUM(CASE WHEN DATE(payment_date) = ? AND payment_method = 'Cash' THEN advance_paid ELSE 0 END) as cash_today,
                    SUM(CASE WHEN DATE(payment_date) = ? AND payment_method = 'UPI' THEN advance_paid ELSE 0 END) as upi_today,
                    SUM(CASE WHEN DATE(payment_date) = ? AND payment_method IN ('Cheque', 'Account Transfer') THEN advance_paid ELSE 0 END) as cheque_today,
                    SUM(CASE WHEN DATE(payment_date) = ? THEN advance_paid ELSE 0 END) as total_collected_today,
                    SUM(advance_paid) as total_collected
                FROM sarga_customer_payments
                ${baseWhere} ${payDateWhere}
            `, [today, today, today, today, ...params, ...payDateParams]);
            p.done();
            return result;
        })();

        // 5. Machine Stats
        const machinePromise = (async () => {
            const p = profile('machineReadings');
            const [result] = await pool.query(`
                SELECT m.id, m.machine_name, GREATEST(0, COALESCE(mr.closing_count, 0) - mr.opening_count) as total_copies, mr.reading_date
                FROM sarga_machine_readings mr
                JOIN sarga_machines m ON mr.machine_id = m.id
                WHERE DATE(mr.reading_date) = ? ${branchIds ? " AND m.branch_id IN (?)" : ""}
            `, [today, ...(branchIds ? [branchIds] : [])]);
            p.done();
            return result.map(r => ({
                id: r.id,
                name: r.machine_name,
                pages: r.total_copies
            }));
        })();

        // 6. Recent Jobs
        const recentJobsPromise = (async () => {
            const p = profile('recentJobs');
            const [result] = await pool.query(`
                SELECT j.id, j.job_number, j.job_name, j.total_amount, j.status, j.payment_status, j.created_at,
                       COALESCE(c.name, 'Walk-in') as customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE 1=1 ${branchIds ? " AND j.branch_id IN (?)" : ""} AND j.status != 'Cancelled'
                ORDER BY j.created_at DESC
                LIMIT 5
            `, branchIds ? [branchIds] : []);
            p.done();
            return result;
        })();

        // 7a. Outstanding Jobs Breakdown
        const outstandingPromise = (async () => {
            const p = profile('outstandingJobs');
            const [result] = await pool.query(`
                SELECT j.id, j.job_number, j.job_name, j.total_amount, j.advance_paid,
                       ROUND(GREATEST(COALESCE(j.total_amount,0) - COALESCE(j.advance_paid,0), 0), 2) as balance,
                       j.status, j.payment_status, j.created_at,
                       COALESCE(c.name, 'Walk-in') as customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE 1=1 ${branchIds ? " AND j.branch_id IN (?)" : ""}
                  AND j.status != 'Cancelled'
                  AND GREATEST(COALESCE(j.total_amount,0) - COALESCE(j.advance_paid,0), 0) > 0
                ORDER BY balance DESC
                LIMIT 20
            `, branchIds ? [branchIds] : []);
            p.done();
            return result;
        })();

        // 7. Status Counts
        const statusCountsPromise = (async () => {
            const p = profile('statusCounts');
            const [result] = await pool.query(`
                SELECT status, COUNT(*) as count 
                FROM sarga_jobs 
                ${jobWhere} 
                GROUP BY status
            `, params);
            p.done();
            const map = {};
            result.forEach(r => map[r.status] = r.count);
            return map;
        })();

        // 8. Low Stock Alerts
        const lowStockPromise = (async () => {
            const p = profile('lowStock');
            try {
                let lowStockQuery, lowStockParams;
                if (branchIds) {
                    lowStockQuery = `
                        SELECT i.id, i.name, i.sku, i.category, bs.quantity, i.reorder_level
                        FROM sarga_inventory i
                        JOIN sarga_branch_stock bs ON i.id = bs.inventory_item_id
                        WHERE bs.branch_id IN (?) AND bs.quantity <= GREATEST(i.reorder_level, 1)
                        ORDER BY bs.quantity ASC LIMIT 15
                    `;
                    lowStockParams = [branchIds];
                } else {
                    lowStockQuery = `
                        SELECT id, name, sku, category, quantity, reorder_level
                        FROM sarga_inventory
                        WHERE quantity <= GREATEST(reorder_level, 1)
                        ORDER BY quantity ASC LIMIT 15
                    `;
                    lowStockParams = [];
                }
                const [result] = await pool.query(lowStockQuery, lowStockParams);
                p.done();
                return result;
            } catch {
                p.done();
                return [];
            }
        })();

        // 9. Inventory Summary
        const inventoryPromise = (async () => {
            const p = profile('inventorySummary');
            try {
                let invQuery, invParams;
                if (branchIds) {
                    invQuery = `
                        SELECT 
                            COUNT(*) as total_items,
                            SUM(bs.quantity) as total_quantity,
                            SUM(bs.quantity * i.cost_price) as total_value,
                            SUM(CASE WHEN bs.quantity <= GREATEST(i.reorder_level, 1) THEN 1 ELSE 0 END) as low_stock_count
                        FROM sarga_inventory i
                        JOIN sarga_branch_stock bs ON i.id = bs.inventory_item_id
                        WHERE bs.branch_id IN (?)
                    `;
                    invParams = [branchIds];
                } else {
                    invQuery = `
                        SELECT 
                            COUNT(*) as total_items,
                            SUM(quantity) as total_quantity,
                            SUM(quantity * cost_price) as total_value,
                            SUM(CASE WHEN quantity <= GREATEST(i.reorder_level, 1) THEN 1 ELSE 0 END) as low_stock_count
                        FROM sarga_inventory
                    `;
                    invParams = [];
                }
                const [[result]] = await pool.query(invQuery, invParams);
                p.done();
                return result;
            } catch {
                p.done();
                return {};
            }
        })();

        // 10. Top Customers This Month
        const topCustomersPromise = (async () => {
            const p = profile('topCustomers');
            try {
                const [result] = await pool.query(`
                    SELECT c.name, c.mobile, COUNT(j.id) as job_count, SUM(j.total_amount) as total_spent
                    FROM sarga_jobs j
                    JOIN sarga_customers c ON j.customer_id = c.id
                    WHERE DATE(j.created_at) >= ? AND j.status != 'Cancelled'
                    ${branchIds ? " AND j.branch_id IN (?)" : ""}
                    GROUP BY c.id ORDER BY total_spent DESC LIMIT 5
                `, [monthStartStr, ...(branchIds ? [branchIds] : [])]);
                p.done();
                return result;
            } catch {
                p.done();
                return [];
            }
        })();

        // 11. Staff Productivity (jobs assigned per staff)
        const staffPromise = (async () => {
            const p = profile('staffProductivity');
            try {
                const [result] = await pool.query(`
                    SELECT s.name, s.role, COUNT(ja.id) as jobs_handled
                    FROM sarga_job_assignments ja
                    JOIN sarga_staff s ON ja.staff_id = s.id
                    WHERE DATE(ja.created_at) >= ?
                    ${branchIds ? 'AND s.branch_id IN (?)' : ''}
                    GROUP BY ja.staff_id ORDER BY jobs_handled DESC LIMIT 5
                `, branchIds ? [monthStartStr, branchIds] : [monthStartStr]);
                p.done();
                return result;
            } catch {
                p.done();
                return [];
            }
        })();

        // 12. Expense Summary
        const expensePromise = (async () => {
            const p = profile('expenseSummary');
            try {
                const [[result]] = await pool.query(`
                    SELECT 
                        SUM(CASE WHEN DATE(payment_date) = ? THEN amount ELSE 0 END) as expenses_today,
                        SUM(CASE WHEN DATE(payment_date) >= ? THEN amount ELSE 0 END) as expenses_month
                    FROM sarga_payments
                    WHERE 1=1 ${branchIds ? " AND branch_id IN (?)" : ""}
                `, [today, monthStartStr, ...(branchIds ? [branchIds] : [])]);
                p.done();
                return result || {};
            } catch {
                p.done();
                return {};
            }
        })();

        // 13. AI Growth & Peak Day Analysis
        const aiPromise = (async () => {
            const result = {
                revenue_growth: 0,
                peak_day: 'N/A',
                predicted_revenue_next_month: 0
            };
            try {
                const monthStart = today.slice(0, 8) + '01';
                const prevMonthStart = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() - 1));
                const prevMonthStartStr = prevMonthStart.toISOString().slice(0, 10);
                const nextMonthStart = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1));
                const nextMonthStartStr = nextMonthStart.toISOString().slice(0, 10);
                const curMonthEnd = nextMonthStartStr;
                const prevMonthEnd = monthStart;

                const p13a = profile('AI_growth');
                const [[growthStats]] = await pool.query(`
                    SELECT 
                        SUM(CASE WHEN created_at >= ? AND created_at < ? THEN total_amount ELSE 0 END) as cur_month_rev,
                        SUM(CASE WHEN created_at >= ? AND created_at < ? THEN total_amount ELSE 0 END) as prev_month_rev
                    FROM sarga_jobs WHERE status != 'Cancelled'
                    ${branchIds ? " AND branch_id IN (?)" : ""}
                `, [monthStart, curMonthEnd, prevMonthStartStr, prevMonthEnd, ...(branchIds ? [branchIds] : [])]);
                p13a.done();

                const curMonthRev = Number(growthStats.cur_month_rev) || 0;
                const prevMonthRev = Number(growthStats.prev_month_rev) || 0;
                if (prevMonthRev > 0) {
                    result.revenue_growth = Math.round(((curMonthRev - prevMonthRev) / prevMonthRev) * 100);
                } else if (curMonthRev > 0) {
                    result.revenue_growth = 100;
                }

                const p13b = profile('AI_peakDay');
                const twoMonthsAgo = new Date();
                twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
                const twoMonthsAgoStr = twoMonthsAgo.toISOString().slice(0, 10);

                const [dowPattern] = await pool.query(`
                    SELECT DAYOFWEEK(created_at) AS dow, COUNT(*) AS orders
                    FROM sarga_jobs
                    WHERE created_at >= ? AND status != 'Cancelled'
                    ${branchIds ? " AND branch_id IN (?)" : ""}
                    GROUP BY dow ORDER BY orders DESC LIMIT 1
                `, [twoMonthsAgoStr, ...(branchIds ? [branchIds] : [])]);
                p13b.done();

                if (dowPattern.length > 0) {
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    result.peak_day = dayNames[dowPattern[0].dow - 1];
                }

                const p13c = profile('AI_forecast');
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

                const [monthlyTrend] = await pool.query(`
                    SELECT DATE_FORMAT(created_at, '%Y-%m') as ym, SUM(total_amount) as revenue
                    FROM sarga_jobs
                    WHERE created_at >= ? AND status != 'Cancelled'
                    ${branchIds ? " AND branch_id IN (?)" : ""}
                    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                    ORDER BY ym ASC
                `, [sixMonthsAgoStr, ...(branchIds ? [branchIds] : [])]);
                p13c.done();

                if (monthlyTrend.length >= 2) {
                    const points = monthlyTrend.map((r, i) => ({ x: i, y: Number(r.revenue) }));
                    const n = points.length;
                    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                    for (const { x, y } of points) {
                        sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
                    }
                    const denom = n * sumX2 - sumX * sumX;
                    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
                    const intercept = (sumY - slope * sumX) / n;
                    result.predicted_revenue_next_month = Math.round(slope * n + intercept);
                } else {
                    result.predicted_revenue_next_month = curMonthRev;
                }
            } catch (err) { console.error('AI Insight calculation failed:', err.message); }
            return result;
        })();

        // 14. Financial Roadmap (EMI/Kuri Commitments)
        const financialPromise = (async () => {
            const p = profile('financialRoadmap');
            const result = {
                total_monthly_commitment: 0,
                emi_total: 0,
                kuri_total: 0
            };
            try {
                const [[emiStats]] = await pool.query(
                    `SELECT SUM(monthly_emi) as total FROM sarga_emi_master WHERE is_active = 1 ${branchIds ? 'AND branch_id IN (?)' : ''}`,
                    branchIds ? [branchIds] : []
                );
                const [[kuriStats]] = await pool.query(
                    `SELECT SUM(monthly_installment) as total FROM sarga_kuri_master WHERE is_active = 1 ${branchIds ? 'AND branch_id IN (?)' : ''}`,
                    branchIds ? [branchIds] : []
                );
                result.emi_total = Number(emiStats.total) || 0;
                result.kuri_total = Number(kuriStats.total) || 0;
                result.total_monthly_commitment = result.emi_total + result.kuri_total;
            } catch (_err) { /* ignore if tables missing */ }
            p.done();
            return result;
        })();

        // 15. Monitoring Stats (Fraud Alerts)
        const monitoringPromise = (async () => {
            const p = profile('monitoringStats');
            const result = { active_alerts: 0 };
            try {
                const [[alertStats]] = await pool.query(`
                    SELECT COUNT(*) as count 
                    FROM sarga_fraud_alerts fa
                    ${branchIds ? 'JOIN sarga_staff s ON fa.staff_id = s.id' : ''}
                    WHERE fa.status = 'ACTIVE'
                    ${branchIds ? 'AND s.branch_id IN (?)' : ''}
                `, branchIds ? [branchIds] : []);
                result.active_alerts = alertStats.count || 0;
            } catch (_err) { /* ignore */ }
            p.done();
            return result;
        })();

        // --- Run all independent queries concurrently ---
        const [
            mergedJobStats, custStats, payStats, machines,
            recentJobs, outstandingJobs, statusMap,
            lowStockItems, inventorySummary, topCustomers,
            staffProductivity, expenseSummary,
            ai_insights, financial_roadmap, monitoring_stats
        ] = await Promise.all([
            jobSalesPromise, customerPromise, paymentPromise, machinePromise,
            recentJobsPromise, outstandingPromise, statusCountsPromise,
            lowStockPromise, inventoryPromise, topCustomersPromise,
            staffPromise, expensePromise,
            aiPromise, financialPromise, monitoringPromise
        ]);

        // Log query timing profile for performance monitoring
        const totalMs = profileLog.reduce((s, e) => s + e.ms, 0);
        const endpointMs = Number(process.hrtime.bigint() - endpointStart) / 1e6;
        console.log(`[Dashboard] Queries: ${totalMs.toFixed(0)}ms | Wall-clock: ${endpointMs.toFixed(0)}ms — ${profileLog.map(e => `${e.label}:${e.ms.toFixed(0)}`).join(', ')}`);

        res.json({
            jobs: {
                total_count: mergedJobStats.total_count || 0,
                total_sales: Number(mergedJobStats.total_sales) || 0,
                total_sales_today: Number(mergedJobStats.total_sales_today) || 0,
                total_collected: Number(mergedJobStats.total_collected) || 0,
                total_balance: Number(mergedJobStats.total_balance) || 0,
                new_today: mergedJobStats.new_today || 0,
                completed_today: mergedJobStats.completed_today || 0,
                urgent_today: mergedJobStats.urgent_today || 0,
                overdue: mergedJobStats.overdue || 0,
                in_progress: mergedJobStats.in_progress || 0
            },
            customers: {
                walk_in_today: custStats.walk_in_today || 0
            },
            payments: {
                cash_today: Number(payStats.cash_today) || 0,
                upi_today: Number(payStats.upi_today) || 0,
                cheque_today: Number(payStats.cheque_today) || 0,
                total_collected_today: Number(payStats.total_collected_today) || 0,
                total_amount: Number(payStats.total_collected) || 0
            },
            sales: {
                month_total: Number(mergedJobStats.month_total) || 0,
                bill_count: mergedJobStats.bill_count || 0,
                avg_bill: Number(mergedJobStats.avg_bill) || 0,
                offset: Number(mergedJobStats.offset_sales) || 0,
                digital: Number(mergedJobStats.digital_sales) || 0,
                photocopy: Number(mergedJobStats.photocopy_sales) || 0,
                mementos: Number(mergedJobStats.mementos_sales) || 0,
                frames: Number(mergedJobStats.frames_sales) || 0,
                id_cards: Number(mergedJobStats.id_cards_sales) || 0,
                binding: Number(mergedJobStats.binding_sales) || 0
            },
            machines: machines,
            recent_jobs: recentJobs,
            outstanding_jobs: outstandingJobs,
            status_counts: statusMap,
            low_stock: lowStockItems,
            inventory: {
                total_items: Number(inventorySummary.total_items) || 0,
                total_quantity: Number(inventorySummary.total_quantity) || 0,
                total_value: Number(inventorySummary.total_value) || 0,
                low_stock_count: Number(inventorySummary.low_stock_count) || 0
            },
            top_customers: topCustomers,
            staff_productivity: staffProductivity,
            expenses: {
                today: Number(expenseSummary.expenses_today) || 0,
                month: Number(expenseSummary.expenses_month) || 0
            },
            ai_insights,
            financial_roadmap,
            monitoring_stats
        });
    } catch (err) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ message: 'Database error' });
    }
});

// --- DASHBOARD DRILLDOWN ROUTE ---
router.get('/stats/dashboard/drilldown', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), asyncHandler(async (req, res) => {
    const { metric, date, branch_id } = req.query;

    if (!metric) {
        return res.status(400).json({ message: 'Missing required query param: metric' });
    }

    const targetDate = date || getTodayDate();

    // Branch filtering
    let branchIds = null;
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
        const userBranch = await getUserBranchId(req.user.id);
        branchIds = userBranch ? [userBranch] : null;
    } else if (branch_id && branch_id !== 'undefined' && branch_id !== '') {
        branchIds = branch_id.split(',').map(Number).filter(Boolean);
        if (branchIds.length === 0) branchIds = null;
    }

    const branchClause = (alias) => branchIds ? ` AND ${alias}.branch_id IN (?)` : '';
    const branchParams = branchIds ? [branchIds] : [];

    switch (metric) {
        case 'todays_collection': {
            const [rows] = await pool.query(`
                SELECT
                    cp.id AS payment_id,
                    cp.customer_id,
                    cp.customer_name,
                    NULL AS job_id,
                    NULL AS job_number,
                    cp.advance_paid AS amount,
                    cp.payment_method AS payment_mode,
                    COALESCE(cp.cash_amount, 0) AS cash_amount,
                    COALESCE(cp.upi_amount, 0) AS upi_amount,
                    0 AS card_amount,
                    COALESCE(cp.discount_amount, 0) AS discount,
                    cp.created_at
                FROM sarga_customer_payments cp
                WHERE DATE(cp.payment_date) = ?
                ${branchClause('cp')}
                ORDER BY cp.created_at DESC
            `, [targetDate, ...branchParams]);
            return res.json(rows);
        }

        case 'pending_amount': {
            const [rows] = await pool.query(`
                SELECT
                    j.id AS job_id,
                    j.job_number,
                    j.job_name,
                    j.total_amount,
                    j.advance_paid,
                    j.balance_amount,
                    j.status,
                    j.created_at,
                    COALESCE(c.id, 0) AS customer_id,
                    COALESCE(c.name, 'Walk-in') AS customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE j.status != 'Cancelled'
                  AND j.balance_amount > 0
                  AND (j.payment_status != 'Paid' OR j.payment_status IS NULL)
                ${branchClause('j')}
                ORDER BY j.balance_amount DESC
                LIMIT 50
            `, [...branchParams]);
            return res.json(rows);
        }

        case 'todays_jobs': {
            const [rows] = await pool.query(`
                SELECT
                    j.id AS job_id,
                    j.job_number,
                    j.job_name,
                    j.total_amount,
                    j.advance_paid,
                    j.balance_amount,
                    j.status,
                    j.payment_status,
                    j.created_at,
                    COALESCE(c.id, 0) AS customer_id,
                    COALESCE(c.name, 'Walk-in') AS customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE (DATE(j.created_at) = ? OR DATE(j.updated_at) = ?)
                  AND j.status != 'Cancelled'
                  ${branchClause('j')}
                ORDER BY j.created_at DESC
                LIMIT 50
            `, [targetDate, targetDate, ...branchParams]);
            return res.json(rows);
        }

        case 'todays_expenses': {
            const [rows] = await pool.query(`
                SELECT
                    sp.id AS payment_id,
                    sp.payee_name,
                    sp.amount,
                    sp.payment_method,
                    sp.type,
                    sp.description,
                    sp.reference_number,
                    sp.created_at
                FROM sarga_payments sp
                WHERE DATE(sp.payment_date) = ?
                  AND sp.type IN ('Vendor','Utility','Salary','Rent','Other')
                  ${branchClause('sp')}
                ORDER BY sp.created_at DESC
                LIMIT 50
            `, [targetDate, ...branchParams]);
            return res.json(rows);
        }

        case 'in_progress_jobs': {
            const [rows] = await pool.query(`
                SELECT
                    j.id AS job_id,
                    j.job_number,
                    j.job_name,
                    j.total_amount,
                    j.advance_paid,
                    j.balance_amount,
                    j.status,
                    j.payment_status,
                    j.created_at,
                    COALESCE(c.id, 0) AS customer_id,
                    COALESCE(c.name, 'Walk-in') AS customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE j.status IN ('Pending','Processing','Designing','Printing','Cutting','Lamination','Binding','Production','Approval Pending')
                  ${branchClause('j')}
                ORDER BY j.updated_at DESC
                LIMIT 50
            `, [...branchParams]);
            return res.json(rows);
        }

        case 'low_stock_items': {
            let query, params;
            if (branchIds) {
                query = `
                    SELECT i.id, i.name, i.sku, i.category, bs.quantity, i.reorder_level, i.unit
                    FROM sarga_inventory i
                    JOIN sarga_branch_stock bs ON i.id = bs.inventory_item_id
                    WHERE bs.branch_id IN (?)
                      AND bs.quantity <= GREATEST(i.reorder_level, 1)
                    ORDER BY bs.quantity ASC LIMIT 50
                `;
                params = [branchIds];
            } else {
                query = `
                    SELECT id, name, sku, category, quantity, reorder_level, unit
                    FROM sarga_inventory
                    WHERE quantity <= GREATEST(reorder_level, 1)
                    ORDER BY quantity ASC LIMIT 50
                `;
                params = [];
            }
            const [rows] = await pool.query(query, params);
            return res.json(rows);
        }

        case 'urgent_overdue_jobs': {
            const [rows] = await pool.query(`
                SELECT
                    j.id AS job_id,
                    j.job_number,
                    j.job_name,
                    j.total_amount,
                    j.status,
                    j.payment_status,
                    j.priority,
                    j.delivery_date,
                    j.created_at,
                    COALESCE(c.id, 0) AS customer_id,
                    COALESCE(c.name, 'Walk-in') AS customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE j.status NOT IN ('Delivered','Cancelled')
                  AND (j.priority = 'Urgent' OR j.delivery_date < ?)
                  ${branchClause('j')}
                ORDER BY j.delivery_date ASC, j.priority DESC
                LIMIT 50
            `, [targetDate, ...branchParams]);
            return res.json(rows);
        }

        case 'ready_pickup_jobs': {
            const [rows] = await pool.query(`
                SELECT
                    j.id AS job_id,
                    j.job_number,
                    j.job_name,
                    j.total_amount,
                    j.advance_paid,
                    j.balance_amount,
                    j.status,
                    j.payment_status,
                    j.created_at,
                    COALESCE(c.id, 0) AS customer_id,
                    COALESCE(c.name, 'Walk-in') AS customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE j.status IN ('Completed', 'Ready')
                  ${branchClause('j')}
                ORDER BY j.updated_at DESC
                LIMIT 50
            `, [...branchParams]);
            return res.json(rows);
        }

        case 'delivered_today_jobs': {
            const [rows] = await pool.query(`
                SELECT
                    j.id AS job_id,
                    j.job_number,
                    j.job_name,
                    j.total_amount,
                    j.advance_paid,
                    j.balance_amount,
                    j.status,
                    j.payment_status,
                    j.created_at,
                    COALESCE(c.id, 0) AS customer_id,
                    COALESCE(c.name, 'Walk-in') AS customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE j.status = 'Delivered' AND DATE(j.updated_at) = ?
                  ${branchClause('j')}
                ORDER BY j.updated_at DESC
                LIMIT 50
            `, [targetDate, ...branchParams]);
            return res.json(rows);
        }

        case 'pending_approval_jobs': {
            const [rows] = await pool.query(`
                SELECT
                    j.id AS job_id,
                    j.job_number,
                    j.job_name,
                    j.total_amount,
                    j.advance_paid,
                    j.balance_amount,
                    j.status,
                    j.payment_status,
                    j.created_at,
                    COALESCE(c.id, 0) AS customer_id,
                    COALESCE(c.name, 'Walk-in') AS customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE j.status = 'Approval Pending'
                  ${branchClause('j')}
                ORDER BY j.updated_at DESC
                LIMIT 50
            `, [...branchParams]);
            return res.json(rows);
        }

        case 'avg_processing': {
            const [rows] = await pool.query(`
                SELECT
                    j.id AS job_id,
                    j.job_number,
                    j.job_name,
                    j.total_amount,
                    j.advance_paid,
                    j.balance_amount,
                    j.status,
                    j.payment_status,
                    j.created_at,
                    COALESCE(c.id, 0) AS customer_id,
                    COALESCE(c.name, 'Walk-in') AS customer_name
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                WHERE j.status NOT IN ('Cancelled')
                  ${branchClause('j')}
                ORDER BY j.created_at DESC
                LIMIT 50
            `, [...branchParams]);
            return res.json(rows);
        }

        default:
            return res.status(400).json({ message: `Unknown metric: ${metric}. Supported: todays_collection, pending_amount, todays_jobs, todays_expenses, in_progress_jobs, low_stock_items, urgent_overdue_jobs, ready_pickup_jobs, delivered_today_jobs, pending_approval_jobs, avg_processing` });
    }
}));

// --- PAYMENT VERIFICATION ROUTES ---

// List payments pending verification (UPI, Cheque, Account Transfer only)
router.get('/customer-payments/pending-verification', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);
        const { status: filterStatus, startDate, endDate, search } = req.query;

        let whereClauses = [];
        const params = [];

        // Branch filter for non-admin
        const branchScope = await branchFilter(req, { column: 'branch_id', allowPrivilegedQuery: false });
        if (branchScope.clause.trim()) {
            whereClauses.push(branchScope.clause.replace(/^\s*AND\s*/, '').trim());
            params.push(...branchScope.params);
        }

        // Payment method filter (non-Cash payments require verification)
        whereClauses.push(`payment_method IN ('UPI', 'Cheque', 'Account Transfer', 'Both')`);

        if (filterStatus === 'Pending') {
            whereClauses.push(`(verification_status = 'Pending' OR verification_status IS NULL)`);
        } else if (filterStatus && filterStatus !== 'all') {
            whereClauses.push(`verification_status = ?`);
            params.push(filterStatus);
        }
        if (startDate) { whereClauses.push(`payment_date >= ?`); params.push(startDate); }
        if (endDate) { whereClauses.push(`payment_date <= ?`); params.push(endDate); }
        if (search) { whereClauses.push(`(customer_name LIKE ? OR reference_number LIKE ?)`); params.push(`%${search}%`, `%${search}%`); }

        const whereSection = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';
        const baseFrom = `FROM sarga_customer_payments ${whereSection}`;

        const [countResult] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
        const total = countResult[0]?.total || 0;
        const [rows] = await pool.query(`SELECT ${CUSTOMER_PAYMENT_LIST_COLUMNS} ${baseFrom} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
        res.json(response(rows, total));
    } catch (err) {
        console.error('Pending verification list error:', err.message, err.stack);
        res.status(500).json({ message: err.message || 'Database error' });
    }
});

// Verify or Reject a payment
router.patch('/customer-payments/:id/verify', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!['Verified', 'Rejected', 'Not in Statement', 'Pending'].includes(status)) {
        return res.status(400).json({ message: 'Invalid verification status' });
    }

    const [[payment]] = await pool.query('SELECT id, payment_method, verification_status FROM sarga_customer_payments WHERE id = ?', [id]);
    if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.payment_method === 'Cash') {
        return res.status(400).json({ message: 'Cash payments do not require verification' });
    }

    await pool.query(
        `UPDATE sarga_customer_payments SET verification_status = ?, verified_by = ?, verified_at = NOW(), verification_note = ? WHERE id = ?`,
        [status, req.user.id, note || null, id]
    );

    await auditLog(req.user.id, 'PAYMENT_VERIFICATION', `Payment #${id} marked as ${status}`, {
        entity_type: 'sarga_customer_payments',
        entity_id: id,
        old_value: payment.verification_status,
        new_value: status
    });

    res.json({ message: `Payment ${status.toLowerCase()} successfully`, id, status });
    invalidateDashboardCache().catch(() => {});
    invalidateAnalyticsCache().catch(() => {});
}));

// Verification summary stats
router.get('/customer-payments/verification-stats', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const [[stats]] = await pool.query(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN (verification_status = 'Pending' OR verification_status IS NULL) THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN verification_status = 'Verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN verification_status = 'Rejected' THEN 1 ELSE 0 END) as rejected,
                SUM(CASE WHEN verification_status = 'Not in Statement' THEN 1 ELSE 0 END) as not_in_statement,
                SUM(CASE WHEN (verification_status = 'Pending' OR verification_status IS NULL) THEN advance_paid ELSE 0 END) as pending_amount,
                SUM(CASE WHEN verification_status = 'Verified' THEN advance_paid ELSE 0 END) as verified_amount,
                SUM(CASE WHEN verification_status = 'Rejected' THEN advance_paid ELSE 0 END) as rejected_amount,
                SUM(CASE WHEN verification_status = 'Not in Statement' THEN advance_paid ELSE 0 END) as not_in_statement_amount
            FROM sarga_customer_payments
            WHERE payment_method IN ('UPI', 'Cheque', 'Account Transfer', 'Both')
        `);
        res.json(stats);
    } catch (err) {
        console.error('Verification stats error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;


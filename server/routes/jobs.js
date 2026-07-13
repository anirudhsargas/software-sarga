const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles, normalizeRole } = require('../middleware/auth');
const { auditLog, auditFieldChanges, getUsageMap, _sortByPositionThenName, sortByUsageThenPosition, bumpUsageForUser, generateJobNumber, getTodayDate } = require('../helpers');
const { analyzeDesign } = require('../helpers/designAnalyzer');
const { validate, addJobSchema } = require('../middleware/validate');
const { fileToBase64 } = require('../utils/base64');
const { paginate } = require('../helpers/pagination');
const { branchFilter } = require('../middleware/branchFilter');
const { invalidateDashboardCache, invalidateCustomerCache, invalidatePattern } = require('../services/cacheService');
const { routeCache } = require('../middleware/cache');

const normalizeBookTypeFromCategory = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'laser') return 'Laser';
    if (normalized === 'other') return 'Other';
    return 'Offset';
};

const JOB_LIST_COLUMNS = [
    'id',
    'customer_id',
    'product_id',
    'branch_id',
    'job_number',
    'job_name',
    'description',
    'quantity',
    'unit_price',
    'total_amount',
    'advance_paid',
    'balance_amount',
    'category',
    'subcategory',
    'machine_id',
    'status',
    'payment_status',
    'delivery_date',
    'created_at',
    'updated_at'
].join(', ');

const CATEGORY_COLUMNS = 'id, name, position, image_url, is_active, created_at';
const SUBCATEGORY_COLUMNS = 'id, category_id, name, position, image_url, is_active, created_at';
const PRODUCT_COLUMNS = 'id, subcategory_id, name, product_code, company_name, company_code, size, calculation_type, description, image_url, has_paper_rate, paper_rate, has_double_side_rate, position, inventory_item_id, is_physical_product, is_active, created_at, updated_at';
const PAYMENT_SUMMARY_COLUMNS = 'id, customer_id, customer_name, customer_mobile, total_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, branch_id, reference_number, description, payment_date, created_at, verification_status';

// --- PRODUCT HIERARCHY DATA ---

const getHierarchyData = async (includeInactive = false) => {
    // Acquire a single connection to prevent packets out of order / connection contention
    const connection = await pool.getConnection();
    try {
        const categoryQuery = includeInactive
            ? `SELECT ${CATEGORY_COLUMNS} FROM sarga_product_categories`
            : `SELECT ${CATEGORY_COLUMNS} FROM sarga_product_categories WHERE is_active = 1`;
        const subcategoryQuery = includeInactive
            ? `SELECT ${SUBCATEGORY_COLUMNS} FROM sarga_product_subcategories`
            : `SELECT ${SUBCATEGORY_COLUMNS} FROM sarga_product_subcategories WHERE is_active = 1`;

        const categories = await connection.query(categoryQuery).then(r => r[0]);
        const subcategories = await connection.query(subcategoryQuery).then(r => r[0]);

        // Use is_deleted filter if column exists (migration may not have run yet)
        let products, inventory;
        const prefixedProductColumns = PRODUCT_COLUMNS.split(', ').map(col => `p.${col}`).join(', ');
        try {
            const productsQuery = includeInactive
                ? `SELECT ${prefixedProductColumns} FROM sarga_products p LEFT JOIN sarga_inventory i ON p.inventory_item_id = i.id WHERE p.is_deleted = 0 AND (p.inventory_item_id IS NULL OR i.is_deleted = 0)`
                : `SELECT ${prefixedProductColumns} FROM sarga_products p LEFT JOIN sarga_inventory i ON p.inventory_item_id = i.id WHERE p.is_active = 1 AND p.is_deleted = 0 AND (p.inventory_item_id IS NULL OR i.is_deleted = 0)`;

            // When not including inactive: only link to ACTIVE products.
            // Also fetch has_any_product so we can exclude inventory items tied
            // to a disabled product from appearing as raw "unlinked" items in billing.
            const inventoryQuery = includeInactive
                ? "SELECT i.id, i.name, i.sku, i.sell_price, i.category, p.id as linked_product_id, 0 as has_disabled_product FROM sarga_inventory i LEFT JOIN sarga_products p ON i.id = p.inventory_item_id AND p.is_deleted = 0 WHERE i.is_deleted = 0"
                : "SELECT i.id, i.name, i.sku, i.sell_price, i.category, active_p.id as linked_product_id, (any_p.id IS NOT NULL AND active_p.id IS NULL) as has_disabled_product FROM sarga_inventory i LEFT JOIN sarga_products active_p ON i.id = active_p.inventory_item_id AND active_p.is_active = 1 AND active_p.is_deleted = 0 LEFT JOIN sarga_products any_p ON i.id = any_p.inventory_item_id AND any_p.is_deleted = 0 WHERE i.is_deleted = 0";

            products = await connection.query(productsQuery).then(r => r[0]);
            inventory = await connection.query(inventoryQuery).then(r => r[0]);
        } catch (_) {
            // Fallback if is_deleted column doesn't exist yet
            const productsQuery = includeInactive
                ? `SELECT ${prefixedProductColumns} FROM sarga_products p LEFT JOIN sarga_inventory i ON p.inventory_item_id = i.id WHERE (p.inventory_item_id IS NULL OR i.is_deleted = 0)`
                : `SELECT ${prefixedProductColumns} FROM sarga_products p LEFT JOIN sarga_inventory i ON p.inventory_item_id = i.id WHERE p.is_active = 1 AND (p.inventory_item_id IS NULL OR i.is_deleted = 0)`;

            const inventoryQuery = includeInactive
                ? "SELECT i.id, i.name, i.sku, i.sell_price, i.category, p.id as linked_product_id, 0 as has_disabled_product FROM sarga_inventory i LEFT JOIN sarga_products p ON i.id = p.inventory_item_id"
                : "SELECT i.id, i.name, i.sku, i.sell_price, i.category, active_p.id as linked_product_id, (any_p.id IS NOT NULL AND active_p.id IS NULL) as has_disabled_product FROM sarga_inventory i LEFT JOIN sarga_products active_p ON i.id = active_p.inventory_item_id AND active_p.is_active = 1 LEFT JOIN sarga_products any_p ON i.id = any_p.inventory_item_id";

            products = await connection.query(productsQuery).then(r => r[0]);
            inventory = await connection.query(inventoryQuery).then(r => r[0]);
        }
        const slabs = await connection.query("SELECT id, product_id, min_qty, max_qty, unit_rate, base_value, double_side_unit_rate FROM sarga_product_slabs ORDER BY product_id, min_qty ASC").then(r => r[0]);
        const extras = await connection.query("SELECT id, product_id, purpose AS extra_name, amount AS unit_rate, 1 as is_active FROM sarga_product_extras_template").then(r => r[0]);
        const links = await connection.query("SELECT id, product_id, name, url FROM sarga_product_links ORDER BY id ASC").then(r => r[0]);

        // Attach slabs and extras to their respective products for offline pricing
        const slabsByProduct = {};
        slabs.forEach(s => {
            if (!slabsByProduct[s.product_id]) slabsByProduct[s.product_id] = [];
            slabsByProduct[s.product_id].push(s);
        });
        const extrasByProduct = {};
        extras.forEach(e => {
            if (!extrasByProduct[e.product_id]) extrasByProduct[e.product_id] = [];
            extrasByProduct[e.product_id].push(e);
        });
        const linksByProduct = {};
        (links || []).forEach(l => {
            if (!linksByProduct[l.product_id]) linksByProduct[l.product_id] = [];
            linksByProduct[l.product_id].push({ id: l.id, name: l.name, url: l.url });
        });
        products.forEach(p => {
            p.slabs = slabsByProduct[p.id] || [];
            p.extras = extrasByProduct[p.id] || [];
            p.links = linksByProduct[p.id] || [];
        });

        return { categories, subcategories, products, inventory };
    } finally {
        connection.release();
    }
};

// Invalidate hierarchy cache (call after product/category CRUD)
const invalidateHierarchyCache = () => {
    invalidatePattern('product-hierarchy').catch(err => console.error('[Cache] invalidateHierarchyCache error:', err));
};

// --- HELPER: PRICING ENGINE ---
const _calculateProductPrice = (product, quantity, slabs) => {
    let result = { unit_price: 0, total: 0 };
    const qty = Number(quantity) || 0;

    // For Slab type: track the effective slab so the double-side add-on reads
    // the correct row rather than always falling back to slabs[0].
    let slabForDS = null;

    if (product.calculation_type === 'Normal') {
        const rate = slabs && slabs.length > 0 ? slabs[0].unit_rate : 0;
        result = { unit_price: rate, total: rate * qty };
    } else if (product.calculation_type === 'Slab') {
        // Linear Interpolation
        if (slabs && slabs.length > 0) {
            const sortedSlabs = [...slabs].sort((a, b) => a.min_qty - b.min_qty);
            slabForDS = sortedSlabs[0]; // default; overridden below
            const exactMatch = sortedSlabs.find(s => Number(s.min_qty) === qty);

            if (exactMatch) {
                result.total = Number(exactMatch.base_value);
                slabForDS = exactMatch;
            } else if (qty < sortedSlabs[0].min_qty) {
                result.total = Number(sortedSlabs[0].base_value);
                slabForDS = sortedSlabs[0];
            } else if (qty > sortedSlabs[sortedSlabs.length - 1].min_qty) {
                const lastSlab = sortedSlabs[sortedSlabs.length - 1];
                // Use the slab's unit_rate directly for quantities beyond the last slab.
                // Deriving from base_value/min_qty was wrong when qty >> min_qty.
                const lastUnit = Number(lastSlab.unit_rate) || 0;
                result.total = lastUnit * qty;
                slabForDS = lastSlab;
            } else {
                for (let i = 0; i < sortedSlabs.length - 1; i++) {
                    const s1 = sortedSlabs[i];
                    const s2 = sortedSlabs[i + 1];
                    if (qty > s1.min_qty && qty < s2.min_qty) {
                        const ratio = (qty - s1.min_qty) / (s2.min_qty - s1.min_qty);
                        result.total = Number(s1.base_value) + ratio * (s2.base_value - s1.base_value);
                        slabForDS = s1; // use lower-bound slab for add-on rates
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

    // Bug 1 fix: use effective slab's double_side_unit_rate, not slabs[0]
    if (product.calculation_type === 'Slab' && product.has_double_side_rate) {
        const doubleSideRate = Number(slabForDS?.double_side_unit_rate) || 0;
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
        const reportDate = getTodayDate();

        // 1. Get or create daily report (machine_id + report_date is unique)
        const [[machineRow]] = await pool.query('SELECT branch_id FROM sarga_machines WHERE id = ?', [machineId]);
        if (!machineRow) {
            console.error(`[MachineSync] Machine ${machineId} not found`);
            return;
        }
        await pool.query(
            `INSERT IGNORE INTO sarga_daily_report_machine (report_date, machine_id, branch_id, created_by)
             VALUES (?, ?, ?, ?)`,
            [reportDate, machineId, machineRow.branch_id, userId]
        );
        const [[reportRow]] = await pool.query(
            'SELECT id FROM sarga_daily_report_machine WHERE machine_id = ? AND report_date = ?',
            [machineId, reportDate]
        );
        const reportId = reportRow ? reportRow.id : null;
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

        const wasteAdd = parseInt(jobData.waste_prints) || 0;
        const proofAdd = parseInt(jobData.proof_prints) || 0;

        if (existingEntryId) {
            await pool.query(
                `UPDATE sarga_machine_work_entries SET
                 customer_name = ?, work_details = ?, copies = ?, waste_copies = ?, proof_copies = ?, payment_type = ?, 
                 cash_amount = ?, upi_amount = ?, credit_amount = ?, total_amount = ?, 
                 remarks = ?
                 WHERE id = ?`,
                [
                    jobData.customer_name || 'Walk-in',
                    jobData.job_name || 'Job',
                    parseInt(jobData.quantity) || 0,
                    wasteAdd,
                    proofAdd,
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
                 (report_id, job_id, customer_name, work_details, copies, waste_copies, proof_copies, payment_type, cash_amount, upi_amount, credit_amount, total_amount, remarks)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    reportId,
                    jobId,
                    jobData.customer_name || 'Walk-in',
                    jobData.job_name || 'Job',
                    parseInt(jobData.quantity) || 0,
                    wasteAdd,
                    proofAdd,
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
                // Manual entry — closing_count is already set by user; total_copies computed on read
            } else {
                // If it's empty or was auto-synced, update everything
                await pool.query(
                    `INSERT INTO sarga_machine_readings (machine_id, reading_date, opening_count, closing_count, notes, created_by)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                        closing_count = opening_count + ?,
                        notes = VALUES(notes),
                        updated_by = VALUES(created_by)`,
                    [machineId, reportDate, opening, opening + totalCopies, '[Auto-Sync] Live Billing', userId, totalCopies]
                );
            }
        }
    } catch (err) {
        console.error('[MachineSync] Error syncing job to machine:', err.message);
    }
};
const JOB_LIST_COL_MINIMAL = 'j.id, j.job_number, j.job_name, j.status, j.total_amount, j.balance_amount, j.delivery_date, j.category, j.created_at, j.payment_status, j.used_sheets, j.required_sheets, j.payment_id';

// --- JOB ROUTES ---

// List All Jobs (with Customer details)
router.get('/jobs', authenticateToken, async (req, res) => {
    try {
        const search = String(req.query.search || '').trim();
        const status = String(req.query.status || '').trim();
        const qBranch = String(req.query.branch_id || '').trim();
        const category = String(req.query.category || '').trim();
        const customerType = String(req.query.customer_type || '').trim();
        const tab = String(req.query.tab || 'active').trim().toLowerCase();
        const userRole = String(req.user.role || '').trim();
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);
        const { branchId } = await branchFilter(req);

        let where = '';
        const params = [];

        // For non-admin/non-accountant/non-front-office staff, include their personal assignment status
        const normalizedRole = userRole.toLowerCase();
        const isStaff = !['admin', 'accountant', 'front office', 'frontoffice'].includes(normalizedRole);
        let myStatusJoin = '';
        const myStatusParams = [];
        if (isStaff) {
            // Replace correlated subquery with LEFT JOIN + derived table (single pass, no per-row subquery)
            myStatusJoin = `LEFT JOIN LATERAL (
                SELECT status FROM sarga_job_staff_assignments
                WHERE job_id = j.id AND (staff_id = ? OR (staff_id IS NULL AND role = ?))
                LIMIT 1
            ) jsa ON TRUE`;
            myStatusParams.push(req.user.id, req.user.role);
        }

        if (isStaff) {
            // Show jobs assigned to this staff directly OR by role, restricted to their branch
            // EXISTS is now efficient with index on (job_id, staff_id, role, status)
            if (tab === 'history') {
                where += ' AND EXISTS (SELECT 1 FROM sarga_job_staff_assignments jsa WHERE jsa.job_id = j.id AND (jsa.staff_id = ? OR (jsa.staff_id IS NULL AND jsa.role = ?)) AND (jsa.status = "Completed" OR j.status = "Cancelled"))';
            } else {
                // Default staff view: Active
                where += ' AND EXISTS (SELECT 1 FROM sarga_job_staff_assignments jsa WHERE jsa.job_id = j.id AND (jsa.staff_id = ? OR (jsa.staff_id IS NULL AND jsa.role = ?)) AND jsa.status != "Completed" AND j.status != "Cancelled")';
            }
            params.push(req.user.id, req.user.role);
            if (branchId) {
                where += ' AND j.branch_id = ?';
                params.push(branchId);
            }
        } else {
            // Admin / Accountant / Front Office
            const reqNormalizedRole = normalizeRole(req.user.role);
            const isPrivileged = reqNormalizedRole === 'Admin' || reqNormalizedRole === 'Accountant';
            if (isPrivileged) {
                if (qBranch) {
                    where += ' AND j.branch_id = ?';
                    params.push(qBranch);
                }
            } else {
                // Non-privileged (Front Office): ignore qBranch, always filter by req.user.branch_id
                where += ' AND j.branch_id = ?';
                params.push(req.user.branch_id);
            }

            // Tabs / Filters
            if (tab === 'active') {
                where += " AND j.status NOT IN ('Delivered', 'Completed', 'Cancelled')";
            } else if (tab === 'completed') {
                where += ' AND j.status = "Completed"';
            } else if (tab === 'delivered') {
                where += ' AND j.status = "Delivered"';
            } else if (tab === 'due') {
                where += ' AND j.balance_amount > 0 AND j.status != "Cancelled"';
            } else if (tab === 'overdue') {
                where += ' AND j.delivery_date < NOW() AND j.status NOT IN ("Delivered", "Cancelled")';
            } else if (tab === 'payments') {
                where += ' AND j.payment_status = "Paid"';
            }

            if (!search && !status && ['completed', 'delivered', 'due', 'overdue', 'payments'].includes(tab)) {
                // Restrict heavy historical tabs to recent jobs for performance
                where += ' AND j.created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)';
            } else if (!search && !status && !['active', 'completed', 'delivered', 'due', 'overdue', 'payments'].includes(tab)) {
                // Default dashboard query for Admins: last 90 days only
                where += ' AND j.created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)';
            }
        }

        if (status) {
            where += ' AND j.status = ?';
            params.push(status);
        }
        if (category) {
            const cat = String(category).trim().toUpperCase();
            if (cat === 'OTHER') {
                where += " AND (j.category IS NULL OR UPPER(j.category) NOT IN ('OFFSET', 'LASER'))";
            } else {
                where += ' AND UPPER(COALESCE(j.category, "")) = ?';
                params.push(cat);
            }
        }
        if (customerType) {
            where += ' AND c.type = ?';
            params.push(customerType);
        }
        if (search) {
            where += ' AND (LOWER(COALESCE(c.name, "Walk-in")) LIKE ? OR LOWER(c.mobile) LIKE ? OR LOWER(j.job_number) LIKE ? OR LOWER(j.job_name) LIKE ?)';
            const s = `%${search.trim().toLowerCase()}%`;
            params.push(s, s, s, s);
        }

        const baseFrom = `
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            LEFT JOIN sarga_branches b ON j.branch_id = b.id
            ${myStatusJoin}
            WHERE 1=1 ${where}`;

        const countQuery = `SELECT COUNT(*) as total ${baseFrom}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `
            SELECT ${JOB_LIST_COL_MINIMAL}, COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile, c.type as customer_type, b.name as branch_name${isStaff ? ', jsa.status as my_assignment_status' : ''}
            ${baseFrom} ORDER BY j.created_at DESC LIMIT ? OFFSET ?
        `;
        const [rows] = await pool.query(dataQuery, [...myStatusParams, ...params, limit, offset]);

        res.json(response(rows, total));
    } catch (err) {
        console.error('List jobs error:', err?.stack || err);
        return res.json({
            data: [],
            total: 0,
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 20,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
        });
    }
});

// Get completed jobs for a specific date (for daily report sync)
router.get('/jobs/completed-by-date', authenticateToken, async (req, res) => {
    try {
        const { date, branch_id: qBranch } = req.query;
        const { branchId } = await branchFilter(req);

        if (!date) {
            return res.status(400).json({ message: 'Date parameter is required' });
        }

        let where = ' AND (j.status = ? OR j.status = ?)';
        const params = ['Completed', 'Delivered'];

        // Filter by branch
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
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
        const custLimit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        console.log('Fetching jobs for customer:', customerId, 'search=', search);

        let sql = `SELECT ${JOB_LIST_COLUMNS} FROM sarga_jobs WHERE customer_id = ?`;
        const params = [customerId];

        if (search) {
            sql += " AND job_name LIKE ?";
            params.push(`%${search}%`);
        }

        sql += ` ORDER BY created_at DESC LIMIT ${custLimit}`;
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
        const { branchId } = await branchFilter(req, { allowPrivilegedQuery: false });
        const created = [];

        for (let i = 0; i < order_lines.length; i += 1) {
            const line = order_lines[i] || {};
            const jobNumber = await generateJobNumber(connection, branchId);
            const total = Number(line.total_amount) || 0;

            try {
                const [result] = await connection.query(
                    `INSERT INTO sarga_jobs
                (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras, category, subcategory, machine_id, waste_prints, proof_prints, machine_print_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                        line.machine_id || null,
                        Number(line.waste_prints) || 0,
                        Number(line.proof_prints) || 0,
                        line.machine_print_count != null ? (Number(line.machine_print_count) || null) : null
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
                        customer_name: 'Walk-in',
                        waste_prints: Number(line.waste_prints) || 0,
                        proof_prints: Number(line.proof_prints) || 0
                    }, line.machine_id, req.user.id);
                }

                created.push({ id: result.insertId, job_number: jobNumber });
                // Reserve inventory for linked product (prevent double-booking of same stock)
                if (line.product_id) {
                    try {
                        const [[prodRow]] = await connection.query('SELECT inventory_item_id FROM sarga_products WHERE id = ? FOR UPDATE', [line.product_id]);
                        const invId = prodRow ? prodRow.inventory_item_id : null;
                        const qty = Number(line.quantity) || 1;
                        if (invId) {
                            const [[invRow]] = await connection.query('SELECT quantity, COALESCE(reserved_quantity, 0) AS reserved FROM sarga_inventory WHERE id = ? FOR UPDATE', [invId]);
                            const available = (invRow ? Number(invRow.quantity || 0) : 0) - Number(invRow?.reserved || 0);
                            if (available < qty) {
                                throw new Error(`Insufficient stock to reserve for product ${line.product_name || line.product_id}`);
                            }
                            await connection.query('UPDATE sarga_inventory SET reserved_quantity = COALESCE(reserved_quantity,0) + ? WHERE id = ?', [qty, invId]);
                        }
                    } catch (reserveErr) {
                        console.error('Reserve failed (bulk jobs):', reserveErr.message || reserveErr);
                        await connection.rollback();
                        return res.status(409).json({ message: reserveErr.message || 'Insufficient stock' });
                    }
                }
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
        invalidateDashboardCache().catch(() => {});
        invalidateCustomerCache().catch(() => {});
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
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const job_number = await generateJobNumber(connection, branch_id);

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

            const jobBookType = normalizeBookTypeFromCategory(category);

            const [cpResult] = await connection.query(`
                INSERT INTO sarga_customer_payments 
                (customer_id, customer_name, customer_mobile, total_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, branch_id, description, payment_date, book_type) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)
            `, [
                customer_id || null,
                cName,
                cMobile,
                total_amount,
                advance_paid,
                balance_amount,
                jobPaymentMethod,
                jobCash,
                jobUpi,
                branch_id || null,
                `Advance for Job ${job_number}`,
                jobBookType,
            ]);
            // Store payment reference on the job so it can be cleaned up on deletion
            await connection.query('UPDATE sarga_jobs SET payment_id = ? WHERE id = ?', [cpResult.insertId, result.insertId]);
        }

        // 3. Audit log (inside transaction for consistency)
        await connection.query(
            `INSERT INTO sarga_audit_logs (user_id_internal, action, details, entity_type, entity_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, 'JOB_CREATE', `Created job ${job_number} for customer ${customer_id || 'walk-in'}`, 'job', result.insertId, req.ip]
        );

        // Reserve inventory for linked product (prevent double-booking of same stock)
        try {
            if (product_id) {
                const [[prodRow]] = await connection.query('SELECT inventory_item_id FROM sarga_products WHERE id = ? FOR UPDATE', [product_id]);
                const invId = prodRow ? prodRow.inventory_item_id : null;
                const qty = Number(quantity) || 1;
                if (invId) {
                    const [[invRow]] = await connection.query('SELECT quantity, COALESCE(reserved_quantity,0) AS reserved FROM sarga_inventory WHERE id = ? FOR UPDATE', [invId]);
                    const available = (invRow ? Number(invRow.quantity || 0) : 0) - Number(invRow?.reserved || 0);
                    if (available < qty) {
                        await connection.rollback();
                        return res.status(409).json({ message: 'Insufficient stock to reserve for this job' });
                    }
                    await connection.query('UPDATE sarga_inventory SET reserved_quantity = COALESCE(reserved_quantity,0) + ? WHERE id = ?', [qty, invId]);
                }
            }
        } catch (reserveErr) {
            console.error('Reserve failed (single job):', reserveErr.message || reserveErr);
            await connection.rollback();
            return res.status(500).json({ message: reserveErr.message || 'Failed to reserve stock' });
        }

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
            const jobCashForSync = Number(req.body.cash_amount) || 0;
            const jobUpiForSync = Number(req.body.upi_amount) || 0;
            syncJobToMachineWorkEntry({
                id: result.insertId, job_number, job_name, quantity, total_amount,
                advance_paid, balance_amount, payment_status, customer_name: customerName,
                cash_amount: jobCashForSync, upi_amount: jobUpiForSync
            }, machine_id, req.user.id).catch(err => console.error('Machine sync error:', err));
        }

        res.status(201).json({ id: result.insertId, job_number, message: 'Job created successfully' });
        invalidateDashboardCache().catch(() => {});
        invalidateCustomerCache().catch(() => {});

        // Trigger anomaly check asynchronously (non-blocking)
        try { require('./anomalies').checkAnomalies().catch(() => {}); } catch (_ignored) { /* ignored */ }
    } catch (err) {
        await connection.rollback();
        console.error("Job create error:", err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Fetch Hierarchy Tree
router.get('/product-hierarchy', authenticateToken, routeCache(3600, (req) => `sarga:product-hierarchy:${req.query.include_inactive === 'true'}`), async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';
        const [usageMap, { categories, subcategories, products, inventory }] = await Promise.all([
            getUsageMap(req.user.id),
            getHierarchyData(includeInactive)
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

        // Add unlinked inventory items into matching categories where possible,
        // and keep a fallback virtual category for truly unmatched names.
        // Exclude items that are linked to a DISABLED product — they have has_disabled_product=true
        // and should not fall through as "unlinked" raw inventory in billing.
        const unlinkedItems = inventory.filter(i => !i.linked_product_id && !i.has_disabled_product);
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

            const normalizeName = (value) => String(value || '').trim().toLowerCase();
            const fallbackSubcats = [];

            Object.entries(inventoryGroups).forEach(([inventoryCategoryName, items], idx) => {
                const normalizedInventoryCategory = normalizeName(inventoryCategoryName);
                const matchedCategory = hierarchy.find((cat) => {
                    const normalizedCategory = normalizeName(cat.name);
                    if (normalizedCategory === normalizedInventoryCategory) return true;
                    return normalizedInventoryCategory.includes(normalizedCategory) || normalizedCategory.includes(normalizedInventoryCategory);
                });

                if (matchedCategory) {
                    const inventorySubcategoryName = 'Inventory Items';
                    const existingInventorySubcategory = (matchedCategory.subcategories || []).find(
                        (sub) => normalizeName(sub.name) === normalizeName(inventorySubcategoryName)
                    );

                    if (existingInventorySubcategory) {
                        existingInventorySubcategory.products = [
                            ...(existingInventorySubcategory.products || []),
                            ...items
                        ];
                    } else {
                        matchedCategory.subcategories = [
                            ...(matchedCategory.subcategories || []),
                            {
                                id: `inv-sub-${matchedCategory.id}`,
                                name: inventorySubcategoryName,
                                products: items
                            }
                        ];
                    }
                    return;
                }

                fallbackSubcats.push({
                    id: `inv-sub-${idx}`,
                    name: inventoryCategoryName,
                    products: items
                });
            });

            if (fallbackSubcats.length > 0) {
                hierarchy.push({
                    id: 'inv-root',
                    name: 'Raw Inventory',
                    position: 999,
                    subcategories: fallbackSubcats
                });
            }
        }

        res.json(hierarchy);
    } catch (error) {
        console.error('[product-hierarchy] GET error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch product hierarchy',
            details: error.message 
        });
    }
});

// Force-refresh hierarchy cache
router.post('/product-hierarchy/refresh', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        invalidateHierarchyCache();
        res.json({ message: 'Hierarchy cache cleared' });
    } catch (error) {
        console.error('[product-hierarchy/refresh] POST error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to refresh product hierarchy cache',
            details: error.message 
        });
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
        let branchClause = '';
        let roleFilter = '';
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            const { branchId } = await branchFilter(req, { allowPrivilegedQuery: false });
            if (branchId) {
                branchClause = ' AND j.branch_id = ?';
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
         WHERE j.product_id IN (${productIds.map(() => '?').join(',')})${branchClause}${roleFilter}
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
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// GET /jobs/assignments/all — Fetch all assignments for offline sync
router.get('/jobs/assignments/all', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);
        let where = '';
        const params = [];

        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            if (branchId) {
                where = ' WHERE j.branch_id = ?';
                params.push(branchId);
            }
        }

        const [rows] = await pool.query(`
            SELECT jsa.id, jsa.job_id, jsa.staff_id, jsa.role, jsa.assigned_date, jsa.status, jsa.notes 
            FROM sarga_job_staff_assignments jsa
            INNER JOIN sarga_jobs j ON jsa.job_id = j.id
            ${where}
        `, params);

        res.json(rows);
    } catch (err) {
        console.error('Fetch all assignments error:', err);
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

        let _branchId = null;
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            ({ branchId: _branchId } = await branchFilter(req, { allowPrivilegedQuery: false }));
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
                if (staffId !== null) {
                    await conn.query(
                        `DELETE FROM sarga_job_staff_assignments WHERE job_id = ? AND staff_id = ?`,
                        [jobId, staffId]
                    );
                } else {
                    await conn.query(
                        `DELETE FROM sarga_job_staff_assignments WHERE job_id = ? AND role = ? AND staff_id IS NULL`,
                        [jobId, role]
                    );
                }
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
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Remove an individual assignment
router.delete('/jobs/assignments/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!['Admin', 'Front Office', 'front office'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const [[assignment]] = await pool.query(
            'SELECT job_id, staff_id, role FROM sarga_job_staff_assignments WHERE id = ?',
            [id]
        );

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        await pool.query('DELETE FROM sarga_job_staff_assignments WHERE id = ?', [id]);

        auditLog(req.user.id, 'JOB_ASSIGNMENT_DELETE', `Deleted assignment #${id} on job ${assignment.job_id}`, { entity_type: 'job_assignment', entity_id: id });
        res.json({ message: 'Assignment removed successfully' });
    } catch (err) {
        console.error('Delete assignment error:', err);
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

        // Get the assignment to find the job_id
        const [assignments] = await pool.query(
            'SELECT job_id FROM sarga_job_staff_assignments WHERE id = ?',
            [id]
        );

        if (assignments.length === 0) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const job_id = assignments[0].job_id;

        const [[jobRow]] = await pool.query('SELECT status FROM sarga_jobs WHERE id = ?', [job_id]);
        if (!jobRow) {
            return res.status(404).json({ message: 'Job not found' });
        }

        await pool.query(
            'UPDATE sarga_job_staff_assignments SET status = ? WHERE id = ?',
            [status, id]
        );

        // If assignment is marked Completed, check if ALL assignments for this job are now Completed
        if (status === 'Completed') {
            const [allAssignments] = await pool.query(
                'SELECT status FROM sarga_job_staff_assignments WHERE job_id = ?',
                [job_id]
            );

            const allCompleted = allAssignments.every(a => a.status === 'Completed');
            
            if (allCompleted) {
                if (['Delivered', 'Cancelled'].includes(jobRow.status)) {
                    auditLog(req.user.id, 'JOB_STATUS_TRANSITION_DENIED', `Denied auto status transition for terminal job ${job_id}: ${jobRow.status} -> Completed`);
                    return res.status(409).json({ message: `Cannot change terminal job status (${jobRow.status}) via assignment update.` });
                }
                // Mark job as Completed if all assignments are done
                await pool.query(
                    'UPDATE sarga_jobs SET status = ? WHERE id = ?',
                    ['Completed', job_id]
                );
            }
        }

        auditLog(req.user.id, 'ASSIGNMENT_STATUS_UPDATE', `Assignment #${id} status changed to ${status}`, { entity_type: 'job_assignment', entity_id: id });
        res.json({ message: 'Assignment status updated successfully' });
    } catch (err) {
        console.error('Update assignment status error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ── Simplified single-job assignment endpoints ──

// POST /jobs/:id/assign — Assign staff (individual or by role) to a specific job
router.post('/jobs/:id/assign', authenticateToken, async (req, res) => {
    try {
        // RBAC: Only Admin, Front Office, and super_admin can assign
        const normalized = String(req.user.role || '').toLowerCase().replace(/\s+/g, '_');
        if (!['admin', 'super_admin', 'front_office'].includes(normalized)) {
            return res.status(403).json({ message: 'You do not have permission to assign staff' });
        }

        const jobId = Number(req.params.id);
        if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job ID' });

        const { assign_type, staff_id, role } = req.body;

        if (!assign_type || !['staff', 'role'].includes(assign_type)) {
            return res.status(400).json({ message: 'assign_type must be "staff" or "role"' });
        }

        if (assign_type === 'staff') {
            if (!staff_id) return res.status(400).json({ message: 'staff_id is required for staff assignment' });
            await pool.query(
                `INSERT IGNORE INTO sarga_job_staff_assignments (job_id, staff_id, role, status)
                 VALUES (?, ?, (SELECT role FROM sarga_staff WHERE id = ?), 'Pending')`,
                [jobId, staff_id, staff_id]
            );
        } else {
            if (!role) return res.status(400).json({ message: 'role is required for role assignment' });
            const [staffList] = await pool.query(
                'SELECT id FROM sarga_staff WHERE role = ? AND role != "Admin"',
                [role]
            );
            for (const s of staffList) {
                await pool.query(
                    `INSERT IGNORE INTO sarga_job_staff_assignments (job_id, staff_id, role, status)
                     VALUES (?, ?, ?, 'Pending')`,
                    [jobId, s.id, role]
                );
            }
        }

        const [assignments] = await pool.query(
            `SELECT jsa.*, s.name AS staff_name, s.role AS staff_role
             FROM sarga_job_staff_assignments jsa
             LEFT JOIN sarga_staff s ON s.id = jsa.staff_id
             WHERE jsa.job_id = ?`,
            [jobId]
        );

        res.json({ success: true, assignments });
    } catch (err) {
        console.error('Error assigning staff:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// GET /jobs/:id/assign — Get current assignments for a job
router.get('/jobs/:id/assign', authenticateToken, async (req, res) => {
    try {
        const jobId = Number(req.params.id);
        if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job ID' });

        const [assignments] = await pool.query(
            `SELECT jsa.*, s.name AS staff_name, s.role AS staff_role
             FROM sarga_job_staff_assignments jsa
             LEFT JOIN sarga_staff s ON s.id = jsa.staff_id
             WHERE jsa.job_id = ?`,
            [jobId]
        );

        res.json({ success: true, assignments });
    } catch (err) {
        console.error('Error fetching assignments:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// DELETE /jobs/:id/assign/:userId — Remove a single assignment from a job
router.delete('/jobs/:id/assign/:userId', authenticateToken, async (req, res) => {
    try {
        // RBAC: Only Admin, Front Office, and super_admin can unassign
        const normalized = String(req.user.role || '').toLowerCase().replace(/\s+/g, '_');
        if (!['admin', 'super_admin', 'front_office'].includes(normalized)) {
            return res.status(403).json({ message: 'You do not have permission to unassign staff' });
        }

        const jobId = Number(req.params.id);
        const userId = Number(req.params.userId);
        if (!Number.isFinite(jobId) || !Number.isFinite(userId)) {
            return res.status(400).json({ message: 'Invalid job ID or user ID' });
        }

        await pool.query(
            'DELETE FROM sarga_job_staff_assignments WHERE job_id = ? AND staff_id = ?',
            [jobId, userId]
        );

        const [assignments] = await pool.query(
            `SELECT jsa.*, s.name AS staff_name, s.role AS staff_role
             FROM sarga_job_staff_assignments jsa
             LEFT JOIN sarga_staff s ON s.id = jsa.staff_id
             WHERE jsa.job_id = ?`,
            [jobId]
        );

        res.json({ success: true, assignments, message: 'Assignment removed' });
    } catch (err) {
        console.error('Error removing assignment:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// GET /jobs/offset-pending — Fetch jobs explicitly for Offset Print Ganging (Plate Management)
router.get('/jobs/offset-pending', authenticateToken, async (req, res) => {
    try {
        const { branch_id: qBranch } = req.query;
        const { branchId } = await branchFilter(req, { allowPrivilegedQuery: false });

        // Fetch jobs where category is 'Offset' and status is pending/processing (i.e. not completed, delivered, cancelled)
        let where = " AND j.category = 'Offset' AND j.status NOT IN ('Completed', 'Delivered', 'Cancelled')";
        const params = [];

        // Apply branch filtering
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
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

        // Branch validation: non-privileged users cannot access other branches' jobs
        const reqNormalizedRole = normalizeRole(req.user.role);
        const isPrivileged = reqNormalizedRole === 'Admin' || reqNormalizedRole === 'Accountant';
        if (!isPrivileged && String(job.branch_id) !== String(req.user.branch_id)) {
            return res.status(403).json({ message: 'Branch access denied. You do not have permission to view jobs from this branch.' });
        }

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
                    `SELECT ${PAYMENT_SUMMARY_COLUMNS} FROM sarga_customer_payments WHERE id = ?`,
                    [job.payment_id]
                );
                payments = rows;
            }
        } catch (_e) { /* ignore if column not yet migrated */ }

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
        } catch (_e) { /* table may not exist */ }

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
    const VALID_PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid', 'Credit'];

    // Status transition matrix — defines which statuses can move to which (C-06)
    const VALID_TRANSITIONS = {
        'Pending': ['Processing', 'Designing', 'Printing', 'Production', 'Completed', 'Delivered', 'Cancelled'],
        'Processing': ['Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production', 'Approval Pending', 'Completed', 'Delivered', 'Cancelled'],
        'Designing': ['Processing', 'Printing', 'Approval Pending', 'Completed', 'Delivered', 'Cancelled'],
        'Printing': ['Cutting', 'Lamination', 'Binding', 'Completed', 'Delivered', 'Cancelled'],
        'Cutting': ['Lamination', 'Binding', 'Completed', 'Delivered', 'Cancelled'],
        'Lamination': ['Cutting', 'Binding', 'Completed', 'Delivered', 'Cancelled'],
        'Binding': ['Completed', 'Delivered', 'Cancelled'],
        'Production': ['Approval Pending', 'Completed', 'Delivered', 'Cancelled'],
        'Approval Pending': ['Completed', 'Delivered', 'Cancelled', 'Processing', 'Designing'],
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

        // Branch validation: non-privileged users cannot access other branches' jobs
        const reqNormalizedRole = normalizeRole(req.user.role);
        const isPrivileged = reqNormalizedRole === 'Admin' || reqNormalizedRole === 'Accountant';
        if (!isPrivileged && String(currentJob.branch_id) !== String(req.user.branch_id)) {
            return res.status(403).json({ message: 'Branch access denied. You do not have permission to modify jobs from other branches.' });
        }

        // Prevent non-privileged roles from silently modifying the branch_id
        if (!isPrivileged) {
            delete updates.branch_id;
        }

        // Cannot mark as Delivered unless fully paid.
        if (updates.status === 'Delivered') {
            const total = updates.total_amount !== undefined ? Number(updates.total_amount) : Number(currentJob.total_amount);
            const paid = updates.advance_paid !== undefined ? Number(updates.advance_paid) : Number(currentJob.advance_paid);
            const remaining = Math.max(total - paid, 0);

            if (remaining > 0) {
                const ALLOWED_CREDIT_ROLES = ['Admin', 'Accountant', 'Front Office'];
                const userRole = normalizeRole(req.user.role);
                const reason = (updates.credit_reason || '').trim();

                if (!updates.credit_override || !ALLOWED_CREDIT_ROLES.includes(userRole) || reason.length < 5) {
                    return res.status(409).json({
                        message: 'Cannot mark as Delivered until full payment is collected.',
                        remaining_amount: Number(remaining.toFixed(2)),
                        customer_id: currentJob.customer_id || null,
                        job_id: Number(id),
                        credit_override_available: true,
                        credit_override_roles: ALLOWED_CREDIT_ROLES
                    });
                }

                // Credit override authorized — record it.
                updates.payment_status = 'Credit';
                
                // Get the user's display name from the database.
                let creditAuthorizedByName = null;
                try {
                    const [staffRows] = await pool.query('SELECT name FROM sarga_staff WHERE id = ?', [req.user.id]);
                    if (staffRows.length > 0) {
                        creditAuthorizedByName = staffRows[0].name;
                    }
                } catch (err) {
                    console.error('Failed to fetch staff name for credit delivery:', err);
                    creditAuthorizedByName = req.user.user_id || 'Staff';
                }

                updates.credit_authorized_by = req.user.id;
                updates.credit_authorized_by_name = creditAuthorizedByName;
                updates.credit_authorized_at = new Date();
                updates.credit_reason = reason;

                auditLog(req.user.id, 'CREDIT_DELIVERY_OVERRIDE',
                    `Job ${id} delivered with ₹${remaining.toFixed(2)} outstanding. Reason: ${reason}`);
            }
        }

        // Validate status transition (C-06)
        if (updates.status !== undefined && updates.status !== currentJob.status) {
            const allowed = VALID_TRANSITIONS[currentJob.status] || [];
            if (!allowed.includes(updates.status)) {
                auditLog(req.user.id, 'JOB_STATUS_TRANSITION_DENIED', `Denied status transition job ${id}: ${currentJob.status} -> ${updates.status}`);
                return res.status(400).json({ message: `Cannot transition from '${currentJob.status}' to '${updates.status}'. Allowed: ${allowed.join(', ') || 'none'}` });
            }
        }

        const fields = [];
        const params = [];

        // Dynamic field builder
        const allowedFields = [
            'status', 'payment_status', 'advance_paid', 'total_amount', 'delivery_date', 
            'branch_id', 'job_name', 'description', 'quantity', 'unit_price', 
            'required_sheets', 'used_sheets', 'paper_size', 'plate_count', 'plate_details',
            'credit_authorized_by', 'credit_authorized_by_name', 'credit_authorized_at', 'credit_reason'
        ];

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

        // If job is marked as Completed/Delivered, also mark all assignments as Completed
        if ((updates.status === 'Completed' || updates.status === 'Delivered') && updates.status !== currentJob.status) {
            console.log(`[SYNC] Job ${id} marked as ${updates.status} - updating all assignments...`);
            const [result] = await pool.query(
                `UPDATE sarga_job_staff_assignments SET status = 'Completed' WHERE job_id = ? AND status != 'Completed'`,
                [id]
            );
            console.log(`[SYNC] Updated ${result.affectedRows} assignments for job ${id}`);
        }

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
            // If job is being Cancelled, release any reserved inventory for its product
            try {
                if (updates.status === 'Cancelled' && currentJob.status !== 'Cancelled' && currentJob.product_id) {
                    const [[prodRow]] = await pool.query('SELECT inventory_item_id FROM sarga_products WHERE id = ? LIMIT 1', [currentJob.product_id]);
                    const invId = prodRow ? prodRow.inventory_item_id : null;
                    const qtyToRelease = Number(currentJob.quantity) || 0;
                    if (invId && qtyToRelease > 0) {
                        await pool.query('UPDATE sarga_inventory SET reserved_quantity = GREATEST(COALESCE(reserved_quantity,0) - ?, 0) WHERE id = ?', [qtyToRelease, invId]);
                    }
                }
            } catch (relErr) {
                console.error('Failed to release reserved inventory on cancel:', relErr.message || relErr);
            }
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
        invalidateDashboardCache().catch(() => {});
        invalidateCustomerCache().catch(() => {});
    } catch (err) {
        console.error('Update failure:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Job (Admin only — cascades all associated data)
router.delete('/jobs/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const jobId = Number(req.params.id);
        if (!Number.isFinite(jobId) || jobId <= 0) {
            connection.release();
            return res.status(400).json({ message: 'Invalid job id' });
        }

        await connection.beginTransaction();

        const [[job]] = await connection.query('SELECT id, product_id, quantity, payment_id FROM sarga_jobs WHERE id = ? FOR UPDATE', [jobId]);
        if (!job) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: 'Job not found' });
        }

        // 1. Delete design checks
        await connection.query('DELETE FROM sarga_design_checks WHERE job_id = ?', [jobId]).catch(() => {});

        // 2. Delete proofs
        await connection.query('DELETE FROM sarga_job_proofs WHERE job_id = ?', [jobId]).catch(() => {});

        // 3. Delete status history
        await connection.query('DELETE FROM sarga_job_status_history WHERE job_id = ?', [jobId]).catch(() => {});

        // 4. Delete paper usage logs
        await connection.query('DELETE FROM sarga_paper_usage_logs WHERE job_id = ?', [jobId]).catch(() => {});

        // 5. Delete machine work entries
        await connection.query('DELETE FROM sarga_machine_work_entries WHERE job_id = ?', [jobId]).catch(() => {});

        // 6. Delete staff assignments
        await connection.query('DELETE FROM sarga_job_staff_assignments WHERE job_id = ?', [jobId]).catch(() => {});

        // 7. Delete customer payments that reference this job in order_lines JSON
        await connection.query(
            "DELETE FROM sarga_customer_payments WHERE JSON_CONTAINS(order_lines, JSON_OBJECT('job_id', CAST(? AS UNSIGNED)), '$')",
            [jobId]
        ).catch(() => {});

        // 8. Delete direct linked payment record (advance payment created at job creation)
        if (job.payment_id) {
            await connection.query('DELETE FROM sarga_customer_payments WHERE id = ?', [job.payment_id]).catch(() => {});
            await connection.query('DELETE FROM sarga_payments WHERE id = ?', [job.payment_id]).catch(() => {});
        }

        // Release reserved stock for linked inventory (if any)
        if (job.product_id) {
            try {
                const [[prodRow]] = await connection.query('SELECT inventory_item_id FROM sarga_products WHERE id = ? LIMIT 1', [job.product_id]);
                const invId = prodRow ? prodRow.inventory_item_id : null;
                const qty = Number(job.quantity) || 0;
                if (invId && qty > 0) {
                    await connection.query('UPDATE sarga_inventory SET reserved_quantity = GREATEST(COALESCE(reserved_quantity,0) - ?, 0) WHERE id = ?', [qty, invId]);
                }
            } catch (releaseErr) {
                console.warn('Failed to release reserved stock on job delete (non-blocking):', releaseErr.message || releaseErr);
            }
        }

        // 9. Delete the job itself
        await connection.query('DELETE FROM sarga_jobs WHERE id = ?', [jobId]);

        await connection.commit();
        connection.release();

        auditLog(req.user.id, 'JOB_DELETE', `Deleted job ${jobId} with all associated payments and records`);
        res.json({ message: 'Job and all associated records deleted successfully' });
        invalidateDashboardCache().catch(() => {});
        invalidateCustomerCache().catch(() => {});
    } catch (err) {
        await connection.rollback().catch(() => {});
        connection.release();
        console.error('Delete job error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ─── Repeat Order (One-click clone) ───────────────────────────
router.post('/jobs/:id/repeat', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT * FROM sarga_jobs WHERE id = ? FOR UPDATE', [req.params.id]);
        if (!rows[0]) {
            await connection.rollback();
            return res.status(404).json({ message: 'Original job not found' });
        }

        const orig = rows[0];
        const job_number = await generateJobNumber(connection, orig.branch_id);
        const quantity = Number(req.body.quantity) || Number(orig.quantity) || 1;
        const unit_price = Number(req.body.unit_price) || Number(orig.unit_price) || 0;
        const total_amount = quantity * unit_price;

        const [result] = await connection.query(
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
                JSON.stringify(orig.applied_extras || []),
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
        } catch (_e) { /* non-critical */ }

        await connection.commit();

        auditLog(req.user.id, 'JOB_REPEAT', `Repeated job ${orig.job_number} as ${job_number} for customer ${orig.customer_id || 'walk-in'}`);

        res.status(201).json({
            id: result.insertId,
            job_number,
            message: `Order repeated successfully as ${job_number}`,
            original_job_number: orig.job_number
        });
    } catch (err) {
        await connection.rollback();
        console.error('Repeat order error:', err);
        res.status(500).json({ message: 'Failed to repeat order' });
    } finally {
        connection.release();
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

        // Attempt to auto-decrement matching paper inventory (branch-aware)
        try {
            const [[jobRow]] = await pool.query('SELECT branch_id FROM sarga_jobs WHERE id = ?', [jobId]);
            const branchId = jobRow ? jobRow.branch_id : null;
            const search = String(paper_size || '').trim();
            const sizeMatch = (search.match(/(\d+)/) || []);
            const sizeCode = sizeMatch[1] || null;

            const [invRows] = await pool.query(
                `SELECT id, quantity FROM sarga_inventory WHERE (size_code = ? OR REPLACE(UPPER(sku), ' ', '') = REPLACE(UPPER(?), ' ', '') OR name LIKE ?) AND (LOWER(category) LIKE '%laser%' OR LOWER(category) LIKE '%offset%') LIMIT 1`,
                [sizeCode || search, search, `%${search}%`]
            );

            if (invRows && invRows.length) {
                const invId = invRows[0].id;
                const qtyToConsume = used; // sheets used

                if (branchId) {
                    // Try to consume from branch stock first
                    const [bs] = await pool.query('SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ? FOR UPDATE', [invId, branchId]);
                    if (bs && bs.length) {
                        const avail = Number(bs[0].quantity || 0);
                        if (avail <= 0) {
                            // Nothing to deduct at branch level — fallback to global inventory
                            const [invBefore] = await pool.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                            const qtyBefore = Number(invBefore[0]?.quantity || 0);
                            await pool.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [qtyToConsume, invId]);
                            await pool.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Auto-consumption via job print log', ?)`,
                                [invId, -qtyToConsume, qtyBefore, qtyBefore - qtyToConsume, jobId, req.user?.id]
                            );
                        } else if (avail >= qtyToConsume) {
                            await pool.query('UPDATE sarga_branch_stock SET quantity = quantity - ? WHERE inventory_item_id = ? AND branch_id = ?', [qtyToConsume, invId, branchId]);
                            await pool.query(
                                `UPDATE sarga_inventory i
                                 SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id)
                                 WHERE id = ?`,
                                [invId]
                            );
                            await pool.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, ?, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Auto-consumption via job print log', ?)`,
                                [invId, branchId, -qtyToConsume, avail, avail - qtyToConsume, jobId, req.user?.id]
                            );
                        } else {
                            // Partial: zero out branch and deduct remainder from global
                            const remainder = qtyToConsume - avail;
                            await pool.query('UPDATE sarga_branch_stock SET quantity = 0 WHERE inventory_item_id = ? AND branch_id = ?', [invId, branchId]);
                            
                            const [invBefore] = await pool.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                            const qtyBeforeGlobal = Number(invBefore[0]?.quantity || 0);
                            await pool.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [remainder, invId]);

                            await pool.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, ?, 'Consumption', ?, ?, 0, 'job', ?, 'Auto-consumption via job print log (branch part)', ?)`,
                                [invId, branchId, -avail, avail, jobId, req.user?.id]
                            );
                            await pool.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Auto-consumption via job print log (global part)', ?)`,
                                [invId, -remainder, qtyBeforeGlobal, qtyBeforeGlobal - remainder, jobId, req.user?.id]
                            );
                        }
                    } else {
                        // No branch row — consume from global inventory
                        const [invBefore] = await pool.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                        const qtyBefore = Number(invBefore[0]?.quantity || 0);
                        await pool.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [qtyToConsume, invId]);
                        await pool.query(
                            `INSERT INTO sarga_inventory_movement_log
                             (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                             VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Auto-consumption via job print log', ?)`,
                            [invId, -qtyToConsume, qtyBefore, qtyBefore - qtyToConsume, jobId, req.user?.id]
                        );
                    }
                } else {
                    // No branch context — consume from global inventory
                    const [invBefore] = await pool.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                    const qtyBefore = Number(invBefore[0]?.quantity || 0);
                    await pool.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [qtyToConsume, invId]);
                    await pool.query(
                        `INSERT INTO sarga_inventory_movement_log
                         (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                         VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Auto-consumption via job print log', ?)`,
                        [invId, -qtyToConsume, qtyBefore, qtyBefore - qtyToConsume, jobId, req.user?.id]
                    );
                }

                // Record consumption in inventory consumption table for audit
                try {
                    await pool.query('INSERT INTO sarga_inventory_consumption (inventory_item_id, quantity_consumed, consumed_by_user_id, notes) VALUES (?, ?, ?, ?)', [invId, qtyToConsume, req.user.id, `Paper usage for job ${jobId} (stage: ${stage || 'unknown'})`]);
                    auditLog(req.user.id, 'INVENTORY_CONSUME', `Auto-consumed ${qtyToConsume} of inventory ${invId} for job ${jobId}`);
                } catch (consErr) {
                    console.warn('Failed to insert inventory consumption record (non-blocking):', consErr.message || consErr);
                }
            }
        } catch (invErr) {
            console.warn('Auto-decrement inventory for paper failed (non-blocking):', invErr.message || invErr);
        }

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
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- Consume paper for a job (supports cutting parent sheets into child sizes) ---
const calculateDefaultWaste = (required) => {
    const qty = Number(required) || 0;
    if (qty <= 0) return 0;
    if (qty < 500) return Math.max(Math.ceil(qty * 0.05), 20);
    if (qty < 2000) return Math.max(Math.ceil(qty * 0.03), 30);
    return Math.max(Math.ceil(qty * 0.02), 50);
};

const calculateParentNeeded = (requiredChild, piecesPerParent, lossPct, minWaste) => {
    const req = Number(requiredChild) || 0;
    const pieces = Math.max(1, Number(piecesPerParent) || 1);
    let waste = 0;
    if (lossPct !== null && lossPct !== undefined && !Number.isNaN(Number(lossPct))) {
        waste = Math.max(Math.ceil(req * (Number(lossPct) / 100)), Number(minWaste) || 0);
    } else {
        waste = calculateDefaultWaste(req);
    }
    const totalChild = req + waste;
    const parentNeeded = Math.ceil(totalChild / pieces);
    return { waste_child: waste, total_child: totalChild, parent_needed: parentNeeded };
};

router.post('/jobs/:id/consume-paper', authenticateToken, async (req, res) => {
    const jobId = req.params.id;
    const { items, stage, notes } = req.body; // items: [{ inventory_item_id?, required_sheets, cut_from_parent_id?, paper_size?, pieces_per_parent?, loss_pct?, min_waste? }]

    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'No items provided' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[jobRow]] = await conn.query('SELECT branch_id FROM sarga_jobs WHERE id = ?', [jobId]);
        const branchId = jobRow ? jobRow.branch_id : null;

        const results = [];
        for (const it of items) {
            const required = Math.max(0, Math.round(Number(it.required_sheets) || 0));
            if (required <= 0) {
                results.push({ error: 'invalid_required', message: 'required_sheets must be > 0', item: it });
                continue;
            }

            // Prepare child size and optional parent identification. Support category-based lookup when parent not explicitly provided.
            const childSize = it.paper_size || it.child_size_code || '';
            let parentId = it.cut_from_parent_id || it.parent_inventory_item_id || null;
            let mapping = null;

            // If no explicit parent provided, but caller supplied a paper_category + childSize, try to find a mapping or a candidate parent in that category
            if (!parentId && it.paper_category && childSize) {
                try {
                    const [mapRows] = await conn.query(
                        'SELECT pcm.*, i.name as parent_name, i.id as parent_inventory_item_id FROM sarga_paper_cut_map pcm LEFT JOIN sarga_inventory i ON i.id = pcm.parent_inventory_item_id WHERE LOWER(pcm.child_size_code) = LOWER(?) AND LOWER(COALESCE(i.category, \'\')) = LOWER(?) LIMIT 1',
                        [childSize, String(it.paper_category).trim()]
                    );
                    if (mapRows && mapRows.length) {
                        mapping = mapRows[0];
                        parentId = mapping.parent_inventory_item_id;
                    } else {
                        // no mapping; pick the most-stocked parent in that category as a fallback
                        const [cands] = await conn.query('SELECT id, name, category, size_code FROM sarga_inventory WHERE LOWER(COALESCE(category, \'\')) = LOWER(?) ORDER BY quantity DESC LIMIT 1', [String(it.paper_category).trim()]);
                        if (cands && cands.length) parentId = cands[0].id;
                    }
                } catch (e) {
                    console.warn('Category-based parent lookup failed (non-blocking):', e.message || e);
                }
            }

            // If a parent sheet is specified (cut from parent)
            if (parentId) {
                // If we don't already have a mapping from the category lookup, try to fetch mapping for this parent+child pair
                if (!mapping) {
                    try {
                        const [maps] = await conn.query('SELECT * FROM sarga_paper_cut_map WHERE parent_inventory_item_id = ? AND child_size_code = ? LIMIT 1', [parentId, childSize]);
                        mapping = maps && maps.length ? maps[0] : null;
                    } catch (_e) {
                        // ignore missing table
                    }
                }

                const pieces = it.pieces_per_parent || (mapping ? mapping.pieces_per_parent : 1);
                const lossPct = it.loss_pct !== undefined ? Number(it.loss_pct) : (mapping ? Number(mapping.loss_pct) : null);
                const minWaste = it.min_waste !== undefined ? Number(it.min_waste) : (mapping ? Number(mapping.min_waste) : 0);

                const { waste_child, total_child: _total_child, parent_needed } = calculateParentNeeded(required, pieces, lossPct, minWaste);

                // Attempt to deduct parent_needed (branch first, then global)
                let consumedFromBranch = 0;
                let consumedFromGlobal = 0;
                let _shortage = 0;

                if (branchId) {
                    const [bs] = await conn.query('SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ? FOR UPDATE', [parentId, branchId]);
                    if (bs && bs.length) {
                        const avail = Number(bs[0].quantity || 0);
                        if (avail >= parent_needed) {
                            await conn.query('UPDATE sarga_branch_stock SET quantity = quantity - ? WHERE inventory_item_id = ? AND branch_id = ?', [parent_needed, parentId, branchId]);
                            consumedFromBranch = parent_needed;
                            // Recalculate global quantity
                            await conn.query(
                                `UPDATE sarga_inventory i
                                 SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id)
                                 WHERE id = ?`,
                                [parentId]
                            );
                            // Log movement
                            await conn.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, ?, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Paper consumption for job (branch)', ?)`,
                                [parentId, branchId, -parent_needed, avail, avail - parent_needed, jobId, req.user.id]
                            );
                        } else if (avail > 0) {
                            const remainder = parent_needed - avail;
                            await conn.query('UPDATE sarga_branch_stock SET quantity = 0 WHERE inventory_item_id = ? AND branch_id = ?', [parentId, branchId]);
                            
                            const [invBefore] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [parentId]);
                            const qtyBeforeGlobal = Number(invBefore[0]?.quantity || 0);
                            await conn.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [remainder, parentId]);
                            consumedFromBranch = avail;
                            consumedFromGlobal = remainder;

                            // Log branch movement
                            await conn.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, ?, 'Consumption', ?, ?, 0, 'job', ?, 'Paper consumption for job (branch part)', ?)`,
                                [parentId, branchId, -avail, avail, jobId, req.user.id]
                            );
                            // Log global movement
                            await conn.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Paper consumption for job (global part)', ?)`,
                                [parentId, -remainder, qtyBeforeGlobal, qtyBeforeGlobal - remainder, jobId, req.user.id]
                            );
                        } else {
                            // no branch stock
                            const [invBefore] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [parentId]);
                            const qtyBefore = Number(invBefore[0]?.quantity || 0);
                            await conn.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [parent_needed, parentId]);
                            consumedFromGlobal = parent_needed;

                            await conn.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Paper consumption for job', ?)`,
                                [parentId, -parent_needed, qtyBefore, qtyBefore - parent_needed, jobId, req.user.id]
                            );
                        }
                    } else {
                        // no branch row
                        const [invBefore] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [parentId]);
                        const qtyBefore = Number(invBefore[0]?.quantity || 0);
                        await conn.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [parent_needed, parentId]);
                        consumedFromGlobal = parent_needed;

                        await conn.query(
                            `INSERT INTO sarga_inventory_movement_log
                             (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                             VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Paper consumption for job', ?)`,
                            [parentId, -parent_needed, qtyBefore, qtyBefore - parent_needed, jobId, req.user.id]
                        );
                    }
                } else {
                    // No branch context — consume from global inventory
                    const [invBefore] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [parentId]);
                    const qtyBefore = Number(invBefore[0]?.quantity || 0);
                    await conn.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [parent_needed, parentId]);
                    consumedFromGlobal = parent_needed;

                    await conn.query(
                        `INSERT INTO sarga_inventory_movement_log
                         (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                         VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Paper consumption for job', ?)`,
                        [parentId, -parent_needed, qtyBefore, qtyBefore - parent_needed, jobId, req.user.id]
                    );
                }

                // Read remaining global quantity
                const [[afterInv]] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [parentId]);
                const remaining = afterInv ? Number(afterInv.quantity || 0) : 0;

                // Record consumption for audit
                try {
                    await conn.query('INSERT INTO sarga_inventory_consumption (inventory_item_id, quantity_consumed, consumed_by_user_id, notes) VALUES (?, ?, ?, ?)', [parentId, parent_needed, req.user.id, `Paper consumption for job ${jobId} (cut ${childSize})`]);
                } catch (consErr) {
                    console.warn('Failed to insert inventory consumption (non-blocking):', consErr.message || consErr);
                }

                // Log paper usage (as produced child sheets)
                try {
                    await conn.query('INSERT INTO sarga_paper_usage_logs (job_id, stage, paper_size, sheets_used, sheets_wasted, notes, logged_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [jobId, stage || 'consume', childSize || null, required, waste_child, notes || `Cut from parent ${parentId}`, req.user.id]);
                } catch (logErr) {
                    console.warn('Failed to insert paper usage log (non-blocking):', logErr.message || logErr);
                }

                results.push({
                    parent_inventory_id: parentId,
                    parent_needed,
                    produced_child: parent_needed * pieces,
                    required_child: required,
                    waste_child,
                    consumedFromBranch,
                    consumedFromGlobal,
                    remaining_stock: remaining
                });
            } else if (it.inventory_item_id) {
                // Direct child inventory consumption
                const invId = it.inventory_item_id;
                const waste = it.loss_pct !== undefined ? Math.max(Math.ceil(required * (Number(it.loss_pct) / 100)), Number(it.min_waste) || 0) : calculateDefaultWaste(required);
                const qtyToConsume = required + waste;

                // Branch-aware deduction
                let consumedFromBranch = 0;
                let consumedFromGlobal = 0;

                if (branchId) {
                    const [bs] = await conn.query('SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ? FOR UPDATE', [invId, branchId]);
                    if (bs && bs.length) {
                        const avail = Number(bs[0].quantity || 0);
                        if (avail >= qtyToConsume) {
                            await conn.query('UPDATE sarga_branch_stock SET quantity = quantity - ? WHERE inventory_item_id = ? AND branch_id = ?', [qtyToConsume, invId, branchId]);
                            consumedFromBranch = qtyToConsume;
                            // Recalculate global quantity
                            await conn.query(
                                `UPDATE sarga_inventory i
                                 SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id)
                                 WHERE id = ?`,
                                [invId]
                            );
                            // Log movement
                            await conn.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, ?, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Direct paper consumption for job (branch)', ?)`,
                                [invId, branchId, -qtyToConsume, avail, avail - qtyToConsume, jobId, req.user.id]
                            );
                        } else if (avail > 0) {
                            const remainder = qtyToConsume - avail;
                            await conn.query('UPDATE sarga_branch_stock SET quantity = 0 WHERE inventory_item_id = ? AND branch_id = ?', [invId, branchId]);
                            
                            const [invBefore] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                            const qtyBeforeGlobal = Number(invBefore[0]?.quantity || 0);
                            await conn.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [remainder, invId]);
                            consumedFromBranch = avail;
                            consumedFromGlobal = remainder;

                            // Log branch movement
                            await conn.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, ?, 'Consumption', ?, ?, 0, 'job', ?, 'Direct paper consumption for job (branch part)', ?)`,
                                [invId, branchId, -avail, avail, jobId, req.user.id]
                            );
                            // Log global movement
                            await conn.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Direct paper consumption for job (global part)', ?)`,
                                [invId, -remainder, qtyBeforeGlobal, qtyBeforeGlobal - remainder, jobId, req.user.id]
                            );
                        } else {
                            const [invBefore] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                            const qtyBefore = Number(invBefore[0]?.quantity || 0);
                            await conn.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [qtyToConsume, invId]);
                            consumedFromGlobal = qtyToConsume;

                            await conn.query(
                                `INSERT INTO sarga_inventory_movement_log
                                 (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                                 VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Direct paper consumption for job', ?)`,
                                [invId, -qtyToConsume, qtyBefore, qtyBefore - qtyToConsume, jobId, req.user.id]
                            );
                        }
                    } else {
                        const [invBefore] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                        const qtyBefore = Number(invBefore[0]?.quantity || 0);
                        await conn.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [qtyToConsume, invId]);
                        consumedFromGlobal = qtyToConsume;

                        await conn.query(
                            `INSERT INTO sarga_inventory_movement_log
                             (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                             VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Direct paper consumption for job', ?)`,
                            [invId, -qtyToConsume, qtyBefore, qtyBefore - qtyToConsume, jobId, req.user.id]
                        );
                    }
                } else {
                    const [invBefore] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                    const qtyBefore = Number(invBefore[0]?.quantity || 0);
                    await conn.query('UPDATE sarga_inventory SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [qtyToConsume, invId]);
                    consumedFromGlobal = qtyToConsume;

                    await conn.query(
                        `INSERT INTO sarga_inventory_movement_log
                         (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                         VALUES (?, NULL, 'Consumption', ?, ?, GREATEST(?, 0), 'job', ?, 'Direct paper consumption for job', ?)`,
                        [invId, -qtyToConsume, qtyBefore, qtyBefore - qtyToConsume, jobId, req.user.id]
                    );
                }

                // Read remaining
                const [[afterInv]] = await conn.query('SELECT quantity FROM sarga_inventory WHERE id = ?', [invId]);
                const remaining = afterInv ? Number(afterInv.quantity || 0) : 0;

                try {
                    await conn.query('INSERT INTO sarga_inventory_consumption (inventory_item_id, quantity_consumed, consumed_by_user_id, notes) VALUES (?, ?, ?, ?)', [invId, qtyToConsume, req.user.id, `Direct paper consumption for job ${jobId}`]);
                } catch (consErr) {
                    console.warn('Failed to insert inventory consumption (non-blocking):', consErr.message || consErr);
                }

                try {
                    await conn.query('INSERT INTO sarga_paper_usage_logs (job_id, stage, paper_size, sheets_used, sheets_wasted, notes, logged_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [jobId, stage || 'consume', it.paper_size || null, required, waste, notes || 'Direct consume', req.user.id]);
                } catch (logErr) {
                    console.warn('Failed to insert paper usage log (non-blocking):', logErr.message || logErr);
                }

                results.push({ inventory_item_id: invId, required, waste, qty_consumed: qtyToConsume, consumedFromBranch, consumedFromGlobal, remaining_stock: remaining });
            } else {
                results.push({ error: 'invalid_item', message: 'No inventory identifier provided', item: it });
            }
        }

        await conn.commit();
        res.json({ results });
    } catch (err) {
        await conn.rollback().catch(() => {});
        console.error('Consume paper error:', err);
        res.status(500).json({ message: 'Failed to consume paper' });
    } finally {
        conn.release();
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

        // ─── Auto Design Check: analyze the uploaded proof automatically ───
        let designCheckResult = null;
        let analysis = null;
        try {
            const absFilePath = req.file.path; // multer provides absolute path
            analysis = await analyzeDesign(absFilePath);
        } catch (dcErr) {
            console.error('Auto design check error (pre-conversion):', dcErr.message);
        }

        const dataUri = await fileToBase64(req.file.path);
        const fileType = getProofFileType(req.file.originalname);

        const [result] = await pool.query(
            `INSERT INTO sarga_job_proofs 
             (job_id, version, file_url, original_name, file_size, file_type, designer_notes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [jobId, nextVersion, dataUri, req.file.originalname, req.file.size, fileType, designer_notes || null, req.user.id]
        );

        if (analysis) {
            try {
                // Save design check result to sarga_design_checks linked to this job
                const [dcResult] = await pool.query(
                    `INSERT INTO sarga_design_checks 
                        (file_name, file_path, file_type, file_size_kb, result_json, passed, 
                         total_issues, critical_issues, warnings, checked_by, job_id, proof_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        req.file.originalname,
                        dataUri,
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
            } catch (dcErr) {
                console.error('Auto design check save error:', dcErr.message);
            }
        }

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

        const [[jobState]] = await pool.query('SELECT status FROM sarga_jobs WHERE id = ?', [req.params.id]);
        if (!jobState) return res.status(404).json({ message: 'Job not found' });

        await pool.query(
            `UPDATE sarga_job_proofs 
             SET status = ?, customer_feedback = ?, reviewed_by = ?, reviewed_at = NOW()
             WHERE id = ?`,
            [status, customer_feedback || null, req.user.id, req.params.proofId]
        );

        // Update job status based on proof decision
        if (status === 'Approved') {
            if (['Delivered', 'Cancelled'].includes(jobState.status)) {
                auditLog(req.user.id, 'JOB_STATUS_TRANSITION_DENIED', `Denied proof review transition for terminal job ${req.params.id}: ${jobState.status} -> Processing`);
                return res.status(409).json({ message: `Cannot change terminal job status (${jobState.status}) from proof review.` });
            }
            await pool.query('UPDATE sarga_jobs SET status = ? WHERE id = ?', ['Processing', req.params.id]);
            await pool.query(
                'INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)',
                [req.params.id, 'Processing', req.user.id]
            );
        } else if (status === 'Rejected' || status === 'Revision Requested') {
            if (['Delivered', 'Cancelled'].includes(jobState.status)) {
                auditLog(req.user.id, 'JOB_STATUS_TRANSITION_DENIED', `Denied proof review transition for terminal job ${req.params.id}: ${jobState.status} -> Designing`);
                return res.status(409).json({ message: `Cannot change terminal job status (${jobState.status}) from proof review.` });
            }
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
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// Matter image upload — works for walk-in jobs (no customer needed)
// ═══════════════════════════════════════════════════════════════

const matterDir = path.join(__dirname, '..', 'uploads', 'matter');
if (!fs.existsSync(matterDir)) fs.mkdirSync(matterDir, { recursive: true });

const MATTER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.pdf']);

const matterStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, matterDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `matter-${unique}${ext}`);
    }
});

const uploadMatter = multer({
    storage: matterStorage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (MATTER_EXTS.has(ext)) return cb(null, true);
        cb(new Error('Invalid file type. Allowed: JPG, PNG, PDF, WEBP, GIF, BMP.'));
    },
    limits: { fileSize: 20 * 1024 * 1024 }
});

// POST /jobs/:id/matter — Upload matter image for a job (no customer required)
router.post('/jobs/:id/matter', authenticateToken, (req, res, next) => {
    uploadMatter.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
        next();
    });
}, async (req, res) => {
    const jobId = Number(req.params.id);
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const [jobRows] = await pool.query('SELECT id FROM sarga_jobs WHERE id = ?', [jobId]);
        if (!jobRows.length) {
            fs.unlink(req.file.path, () => {});
            return res.status(404).json({ message: 'Job not found' });
        }

        const dataUri = await fileToBase64(req.file.path);
        if (!dataUri) throw new Error('Base64 conversion failed');

        const [result] = await pool.query(
            `INSERT INTO sarga_job_matter (job_id, file_url, original_name, file_size, notes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [jobId, dataUri, req.file.originalname, req.file.size, req.body.notes || null, req.user.id || null]
        );

        auditLog(req.user.id, 'MATTER_UPLOAD', `Uploaded matter image for job ${jobId}`);
        res.status(201).json({ id: result.insertId, file_url: dataUri, message: 'Matter image uploaded' });
    } catch (err) {
        fs.unlink(req.file.path, () => {});
        console.error('Matter upload error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// GET /jobs/:id/matter — Get matter images for a job
router.get('/jobs/:id/matter', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT m.*, s.name as uploaded_by_name
             FROM sarga_job_matter m
             LEFT JOIN sarga_staff s ON m.uploaded_by = s.id
             WHERE m.job_id = ?
             ORDER BY m.created_at DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        res.status(500).json({ message: 'Database error' });
    }
});

// DELETE /jobs/:id/matter/:matterId — Delete a matter image
router.delete('/jobs/:id/matter/:matterId', authenticateToken, async (req, res) => {
    try {
        const [[matter]] = await pool.query('SELECT * FROM sarga_job_matter WHERE id = ? AND job_id = ?', [req.params.matterId, req.params.id]);
        if (!matter) return res.status(404).json({ message: 'Not found' });

        const filePath = path.join(__dirname, '..', matter.file_url.replace(/^\//, ''));
        try { fs.unlinkSync(filePath); } catch (_ignored) { /* ignored */ }
        await pool.query('DELETE FROM sarga_job_matter WHERE id = ?', [matter.id]);
        res.json({ message: 'Deleted' });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});


module.exports = { router, syncJobToMachineWorkEntry, invalidateHierarchyCache, getHierarchyData };


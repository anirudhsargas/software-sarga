const { pool } = require('../database');

/**
 * Normalize a phone value to E.164 where possible.
 * Returns a string:
 *  - E.164 (e.g. +919876543210) when parsable and valid
 *  - Fallback last-10-digits string when parsing fails (preserves legacy behavior)
 *  - Empty string for null/undefined/empty input
 *
 * @param {string} value
 * @param {string} [defaultRegion='IN'] - region hint for parsing non-international numbers
 * @returns {string}
 */
const normalizeMobile = (value, defaultRegion = 'IN') => {
    if (value === null || value === undefined) return '';
    const raw = String(value).trim();

    // Try using google-libphonenumber if available
    try {
        const libph = require('google-libphonenumber');
        const phoneUtil = libph.PhoneNumberUtil.getInstance();
        const PNF = libph.PhoneNumberFormat;

        let parsed;
        try {
            // Always provide a region hint; libphonenumber will accept international (+) numbers too.
            parsed = phoneUtil.parse(raw, defaultRegion);

            if (phoneUtil.isValidNumber(parsed)) {
                return phoneUtil.format(parsed, PNF.E164);
            }
        } catch (_err) {
            // parsing failed - fall through to legacy fallback
        }
    } catch (_err) {
        // google-libphonenumber not installed / require failed - fall back
    }

    // Legacy fallback: return last 10 digits (keeps existing behavior for older data)
    const cleaned = raw.replace(/\D/g, '');
    return cleaned.slice(-10);
};

/**
 * Normalize a mobile value using an optional countryCode hint.
 * - If `countryCode` is a 2-letter region (e.g. 'IN', 'US'), it is passed as the region hint to `normalizeMobile`.
 * - If `countryCode` is a calling code string like '+91' or '91', it will be combined with `value` before normalization.
 * - Falls back to calling `normalizeMobile(value)` on any error.
 *
 * @param {string} value
 * @param {string} [countryCode]
 * @param {string} [defaultRegion='IN']
 * @returns {string}
 */
const normalizeMobileWithCountry = (value, countryCode, defaultRegion = 'IN') => {
    try {
        if (!countryCode) return normalizeMobile(value, defaultRegion);
        const cc = String(countryCode).trim();
        if (/^[A-Za-z]{2}$/.test(cc)) {
            // Region hint like 'IN' or 'US'
            return normalizeMobile(value, cc.toUpperCase());
        }

        // Treat as calling code like '+91' or '91'
        let combined;
        if (cc.startsWith('+')) combined = `${cc}${value}`;
        else if (/^\d+$/.test(cc)) combined = `+${cc}${value}`;
        else combined = `${value}`;
        return normalizeMobile(combined, defaultRegion);
    } catch (_err) {
        return normalizeMobile(value, defaultRegion);
    }
};

/**
 * Resolve a customer by a phone input. Tries phone_numbers.number_e164 first
 * (if that table exists/populated), then falls back to matching RIGHT(mobile,10)
 * on `sarga_customers` for legacy data.
 *
 * Returns either the phone_numbers row joined with customer info, or a
 * customer row fallback: { customer_pk, customer_uid, name, mobile } or null.
 */
const resolveCustomerByE164 = async (phoneInput, opts = {}) => {
    if (!phoneInput) return null;
    const defaultRegion = opts.defaultRegion || 'IN';
    const normalized = normalizeMobile(phoneInput, defaultRegion);

    const digitsOnly = String(phoneInput || '').replace(/\D/g, '');
    const last10 = digitsOnly.slice(-10);

    // Prefer phone_numbers lookup (normalized to E.164 when possible)
    try {
        const [rows] = await pool.query(
            `SELECT pn.id AS phone_id, pn.customer_id, pn.number_e164, pn.is_primary, c.id AS customer_pk, c.customer_uid, c.name, c.mobile
             FROM phone_numbers pn
             JOIN sarga_customers c ON c.id = pn.customer_id
             WHERE pn.number_e164 = ? LIMIT 1`,
            [normalized]
        );
        if (rows && rows[0]) return rows[0];
    } catch (err) {
        // phone_numbers table may not exist yet; fall back quietly
        console.warn('resolveCustomerByE164: phone_numbers lookup failed, falling back to customers.mobile', err && err.message);
    }

    // Fallback: match last-10 digits against sarga_customers.mobile
    if (last10 && last10.length === 10) {
        const [rows2] = await pool.query(
            `SELECT id AS customer_pk, customer_uid, name, mobile FROM sarga_customers WHERE RIGHT(mobile,10) = ? LIMIT 1`,
            [last10]
        );
        return (rows2 && rows2[0]) ? rows2[0] : null;
    }

    return null;
};

const auditLog = async (userId, action, details, opts = {}) => {
    try {
        const { entity_type, entity_id, field_name, old_value, new_value, ip_address, connection: conn } = opts;
        const db = conn || pool;
        await db.query(
            `INSERT INTO sarga_audit_logs
             (user_id_internal, action, details, entity_type, entity_id, field_name, old_value, new_value, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                action,
                details,
                entity_type || null,
                entity_id || null,
                field_name || null,
                old_value !== undefined ? String(old_value) : null,
                new_value !== undefined ? String(new_value) : null,
                ip_address || null,
            ]
        );
    } catch (err) {
        console.error("Audit log failed:", err.message);
    }
};

/**
 * Log multiple field-level changes in a single call.
 * @param {number} userId
 * @param {string} action - e.g. 'JOB_UPDATE'
 * @param {string} entityType - e.g. 'job'
 * @param {number} entityId
 * @param {Object} oldData - previous values
 * @param {Object} newData - updated values
 * @param {Object} opts - { ip_address, connection }
 */
const auditFieldChanges = async (userId, action, entityType, entityId, oldData, newData, opts = {}) => {
    const changedFields = Object.keys(newData).filter(k => {
        if (newData[k] === undefined) return false;
        return String(oldData[k] ?? '') !== String(newData[k] ?? '');
    });
    if (changedFields.length === 0) return;

    const details = changedFields.map(f => `${f}: ${oldData[f] ?? '(empty)'} → ${newData[f]}`).join('; ');
    const db = opts.connection || pool;

    // Batch insert for efficiency
    const values = changedFields.map(f => [
        userId, action, details, entityType, entityId, f,
        oldData[f] !== undefined ? String(oldData[f]) : null,
        String(newData[f]),
        opts.ip_address || null,
    ]);

    for (const v of values) {
        try {
            await db.query(
                `INSERT INTO sarga_audit_logs
                 (user_id_internal, action, details, entity_type, entity_id, field_name, old_value, new_value, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, v
            );
        } catch (err) {
            console.error("Audit field log failed:", err.message);
        }
    }
};

/**
 * Get the next sequential invoice number (gap-free).
 * MUST be called inside a transaction with FOR UPDATE to prevent gaps.
 * @param {object} connection - MySQL connection (inside a transaction)
 * @param {string} [prefix='INV'] - Invoice prefix
 * @returns {Promise<string>} - e.g. 'INV-2025-26/00042'
 */
const getNextInvoiceNumber = async (connection, prefix = 'INV') => {
    // Determine financial year (Apr–Mar)
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const year = now.getFullYear();
    const fyStart = month >= 3 ? year : year - 1; // Apr=3
    const fyEnd = fyStart + 1;
    const fy = `${fyStart}-${String(fyEnd).slice(-2)}`; // e.g. '2025-26'

    // Lock the row for this FY+prefix to prevent concurrent gaps
    const [rows] = await connection.query(
        `SELECT id, last_number FROM sarga_invoice_sequence
         WHERE financial_year = ? AND prefix = ?
         FOR UPDATE`,
        [fy, prefix]
    );

    let nextNum;
    if (rows.length === 0) {
        nextNum = 1;
        await connection.query(
            `INSERT INTO sarga_invoice_sequence (financial_year, prefix, last_number) VALUES (?, ?, ?)`,
            [fy, prefix, 1]
        );
    } else {
        nextNum = rows[0].last_number + 1;
        await connection.query(
            `UPDATE sarga_invoice_sequence SET last_number = ? WHERE id = ?`,
            [nextNum, rows[0].id]
        );
    }

    const padded = String(nextNum).padStart(5, '0');
    return `${prefix}/${fy}/${padded}`;
};

const getUsageMap = async (userId) => {
    if (!userId) return new Map();
    const [rows] = await pool.query(
        "SELECT entity_type, entity_id, usage_count FROM sarga_product_usage WHERE user_id_internal = ?",
        [userId]
    );
    const map = new Map();
    rows.forEach((row) => {
        map.set(`${row.entity_type}:${row.entity_id}`, Number(row.usage_count) || 0);
    });
    return map;
};

const sortByPositionThenName = (a, b) => {
    const posA = Number(a.position) || 0;
    const posB = Number(b.position) || 0;
    if (posA !== posB) return posA - posB;
    return String(a.name || '').localeCompare(String(b.name || ''));
};

const sortByUsageThenPosition = (usageMap, type) => (a, b) => {
    const usageA = usageMap.get(`${type}:${a.id}`) || 0;
    const usageB = usageMap.get(`${type}:${b.id}`) || 0;
    if (usageA !== usageB) return usageB - usageA;
    return sortByPositionThenName(a, b);
};

const getUserBranchId = async (userId) => {
    if (!userId) return null;
    const [rows] = await pool.query("SELECT branch_id FROM sarga_staff WHERE id = ?", [userId]);
    return rows[0]?.branch_id || null;
};

const hasPendingCustomerBalance = async (customerId) => {
    if (!customerId) return false;
    const [rows] = await pool.query(
        "SELECT COUNT(*) AS pending_count FROM sarga_customer_payments WHERE customer_id = ? AND balance_amount > 0",
        [customerId]
    );
    return Number(rows[0]?.pending_count) > 0;
};

const bumpUsageForUser = async (userId, productId) => {
    if (!userId || !productId) return;
    const [rows] = await pool.query(
        `SELECT p.id AS product_id, p.subcategory_id, s.category_id
         FROM sarga_products p
         JOIN sarga_product_subcategories s ON p.subcategory_id = s.id
         WHERE p.id = ?`,
        [productId]
    );
    if (!rows[0]) return;
    const { subcategory_id, category_id } = rows[0];
    const entries = [
        { entity_type: 'product', entity_id: productId },
        { entity_type: 'subcategory', entity_id: subcategory_id },
        { entity_type: 'category', entity_id: category_id }
    ];

    for (const entry of entries) {
        await pool.query(
            `INSERT INTO sarga_product_usage (user_id_internal, entity_type, entity_id, usage_count)
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP`,
            [userId, entry.entity_type, entry.entity_id]
        );
    }
};

/**
 * Generate a smart job number: BRANCH-YYMMDD-001
 * Uses a daily atomic sequence for each branch.
 * @param {object} connection - MySQL connection (inside a transaction)
 * @param {number|null} branchId
 * @returns {Promise<string>}
 */
const generateJobNumber = async (connection, branchId = null) => {
    // 1. Get branch short code (fallback HO)
    let branchCode = 'HO';
    if (branchId) {
        const [branches] = await connection.query("SELECT short_name FROM sarga_branches WHERE id = ?", [branchId]);
        if (branches[0] && branches[0].short_name) {
            branchCode = branches[0].short_name.toUpperCase();
        }
    }

    // 2. Get today's date in YYMMDD format via MySQL to be consistent with CURDATE()
    const [[{ today, yymmdd }]] = await connection.query("SELECT CURDATE() as today, DATE_FORMAT(CURDATE(), '%y%m%d') as yymmdd");

    // 3. Atomically get next sequence for this branch/date
    const targetBranchId = branchId || 0;
    const [rows] = await connection.query(
        "SELECT last_seq FROM sarga_job_seq WHERE branch_id = ? AND seq_date = ? FOR UPDATE",
        [targetBranchId, today]
    );

    let nextSeq = 1;
    if (rows.length > 0) {
        nextSeq = rows[0].last_seq + 1;
        await connection.query(
            "UPDATE sarga_job_seq SET last_seq = ? WHERE branch_id = ? AND seq_date = ?",
            [nextSeq, targetBranchId, today]
        );
    } else {
        await connection.query(
            "INSERT INTO sarga_job_seq (branch_id, seq_date, last_seq) VALUES (?, ?, 1)",
            [targetBranchId, today]
        );
    }

    const paddedSeq = String(nextSeq).padStart(3, '0');
    return `${branchCode}-${yymmdd}-${paddedSeq}`;
};

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const getTodayDate = () => {
    // Returns YYYY-MM-DD in local time
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

module.exports = {
    normalizeMobile,
    normalizeMobileWithCountry,
    resolveCustomerByE164,
    auditLog,
    auditFieldChanges,
    getNextInvoiceNumber,
    generateJobNumber,
    getUsageMap,
    sortByPositionThenName,
    sortByUsageThenPosition,
    getUserBranchId,
    hasPendingCustomerBalance,
    bumpUsageForUser,
    asyncHandler,
    getTodayDate
};


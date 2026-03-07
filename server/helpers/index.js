const { pool } = require('../database');

const normalizeMobile = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/\D/g, '');
    return cleaned.slice(-10);
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

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
    normalizeMobile,
    auditLog,
    auditFieldChanges,
    getNextInvoiceNumber,
    getUsageMap,
    sortByPositionThenName,
    sortByUsageThenPosition,
    getUserBranchId,
    hasPendingCustomerBalance,
    bumpUsageForUser,
    asyncHandler
};


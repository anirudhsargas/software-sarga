const { pool } = require('../database');

const normalizeMobile = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/\D/g, '');
    return cleaned.slice(-10);
};

const auditLog = async (userId, action, details) => {
    try {
        await pool.query("INSERT INTO sarga_audit_logs (user_id_internal, action, details) VALUES (?, ?, ?)",
            [userId, action, details]);
    } catch (err) {
        console.error("Audit log failed:", err);
    }
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
    getUsageMap,
    sortByPositionThenName,
    sortByUsageThenPosition,
    getUserBranchId,
    hasPendingCustomerBalance,
    bumpUsageForUser,
    asyncHandler
};


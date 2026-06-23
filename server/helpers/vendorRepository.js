/**
 * VendorRepository — abstraction layer over sarga_vendors and vendors tables.
 *
 * sarga_vendors: legacy expense vendors (type, contact_person, phone, address, branch_id, order_link, gstin)
 * vendors: unified vendor master (name, contact_person, phone, email, gstin, address, city, vendor_code, category, credit_days, credit_limit, is_active, notes)
 *
 * Both tables remain operational. New writes go to `vendors` (primary).
 * Reads prefer `vendors`, fall back to `sarga_vendors`.
 * This is an additive, non-breaking layer.
 */

const { pool } = require('../database');

const S_VENDORS = 'sarga_vendors';
const VENDORS = 'vendors';

const S_COLS = ['id', 'name', 'type', 'contact_person', 'phone', 'address', 'branch_id', 'order_link', 'gstin', 'created_at']; // eslint-disable-line no-unused-vars
const V_COLS = ['id', 'name', 'contact_person', 'phone', 'email', 'gstin', 'address', 'city', 'vendor_code', 'category', 'credit_days', 'credit_limit', 'is_active', 'notes', 'created_at']; // eslint-disable-line no-unused-vars

/**
 * Normalize a vendor row from either table into a consistent shape.
 */
function normalizeRow(row, source) {
    if (!row) return null;
    if (source === VENDORS || source === 'vendors') {
        return {
            id: row.id,
            name: row.name,
            contactPerson: row.contact_person,
            phone: row.phone,
            email: row.email || null,
            gstin: row.gstin || null,
            address: row.address || null,
            city: row.city || null,
            vendorCode: row.vendor_code || null,
            category: row.category || null,
            creditDays: row.credit_days || 0,
            creditLimit: row.credit_limit || 0,
            isActive: row.is_active !== 0,
            notes: row.notes || null,
            source: VENDORS,
            raw: row,
        };
    }
    // sarga_vendors
    return {
        id: row.id,
        name: row.name,
        contactPerson: row.contact_person || null,
        phone: row.phone || null,
        email: null,
        gstin: row.gstin || null,
        address: row.address || null,
        city: null,
        vendorCode: null,
        category: row.type || 'Vendor',
        creditDays: 0,
        creditLimit: 0,
        isActive: true,
        notes: null,
        source: S_VENDORS,
        raw: row,
    };
}

/**
 * Get a single vendor by ID. Checks `vendors` first, falls back to `sarga_vendors`.
 */
async function getVendor(id) {
    const [rows] = await pool.query(`SELECT * FROM ${VENDORS} WHERE id = ?`, [id]);
    if (rows.length > 0) return normalizeRow(rows[0], VENDORS);
    const [sRows] = await pool.query(`SELECT * FROM ${S_VENDORS} WHERE id = ?`, [id]);
    return sRows.length > 0 ? normalizeRow(sRows[0], S_VENDORS) : null;
}

/**
 * List vendors from the primary `vendors` table with optional filters.
 */
async function listVendors({ search, isActive, category, limit, offset } = {}) {
    let sql = `SELECT * FROM ${VENDORS} WHERE 1=1`;
    const params = [];
    if (search) { sql += ' AND (name LIKE ? OR contact_person LIKE ? OR vendor_code LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (isActive !== undefined) { sql += ' AND is_active = ?'; params.push(isActive ? 1 : 0); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY name ASC';
    if (limit) { sql += ' LIMIT ?'; params.push(limit); }
    if (offset) { sql += ' OFFSET ?'; params.push(offset); }
    const [rows] = await pool.query(sql, params);
    return rows.map(r => normalizeRow(r, VENDORS));
}

/**
 * Create a vendor in the primary `vendors` table.
 */
async function createVendor({ name, contactPerson, phone, email, gstin, address, city, vendorCode, category, creditDays, creditLimit, notes }) {
    const [result] = await pool.query(
        `INSERT INTO ${VENDORS} (name, contact_person, phone, email, gstin, address, city, vendor_code, category, credit_days, credit_limit, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, contactPerson || null, phone || null, email || null, gstin || null, address || null, city || null, vendorCode || null, category || 'General', creditDays || 0, creditLimit || 0, notes || null]
    );
    return { id: result.insertId, ...await getVendor(result.insertId) };
}

/**
 * Update a vendor in the primary `vendors` table.
 */
async function updateVendor(id, fields) {
    const allowed = ['name', 'contact_person', 'phone', 'email', 'gstin', 'address', 'city', 'vendor_code', 'category', 'credit_days', 'credit_limit', 'is_active', 'notes'];
    const setClauses = [];
    const params = [];
    for (const [key, value] of Object.entries(fields)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (allowed.includes(dbKey)) {
            setClauses.push(`${dbKey} = ?`);
            params.push(value === undefined ? null : value);
        }
    }
    if (setClauses.length === 0) return getVendor(id);
    params.push(id);
    await pool.query(`UPDATE ${VENDORS} SET ${setClauses.join(', ')} WHERE id = ?`, params);
    return getVendor(id);
}

/**
 * Soft-delete a vendor.
 */
async function deleteVendor(id) {
    await pool.query(`UPDATE ${VENDORS} SET is_active = FALSE WHERE id = ?`, [id]);
    return { id, deleted: true };
}

/**
 * Get total count of vendors (primary table only).
 */
async function countVendors({ isActive } = {}) {
    let sql = `SELECT COUNT(*) as count FROM ${VENDORS}`;
    const params = [];
    if (isActive !== undefined) { sql += ' WHERE is_active = ?'; params.push(isActive ? 1 : 0); }
    const [rows] = await pool.query(sql, params);
    return rows[0].count;
}

/**
 * Check if a vendor name already exists in either table.
 */
async function findByName(name, excludeId) {
    let sql = `SELECT id FROM ${VENDORS} WHERE name = ?`;
    const params = [name];
    if (excludeId) { sql += ' AND id != ?'; params.push(excludeId); }
    const [rows] = await pool.query(sql, params);
    if (rows.length > 0) return { id: rows[0].id, source: VENDORS };
    const [sRows] = await pool.query(`SELECT id FROM ${S_VENDORS} WHERE name = ?`, [name]);
    if (sRows.length > 0) return { id: sRows[0].id, source: S_VENDORS };
    return null;
}

module.exports = {
    getVendor,
    listVendors,
    createVendor,
    updateVendor,
    deleteVendor,
    countVendors,
    findByName,
    normalizeRow,
};

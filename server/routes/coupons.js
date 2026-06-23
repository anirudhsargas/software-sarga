const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog, asyncHandler } = require('../helpers');

// ──────────────── ADMIN: CRUD ────────────────

// List all coupons
router.get('/coupons', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT c.*, s.name as created_by_name
         FROM sarga_coupons c
         LEFT JOIN sarga_staff s ON c.created_by = s.id
         ORDER BY c.created_at DESC`
    );
    res.json(rows);
}));

// Create coupon
router.post('/coupons', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { code, discount_type, discount_value, usage_type, max_uses, min_order_amount, expiry_date } = req.body;

    if (!code || !code.trim()) {
        return res.status(400).json({ message: 'Coupon code is required.' });
    }
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '');
    if (cleanCode.length < 3 || cleanCode.length > 50) {
        return res.status(400).json({ message: 'Coupon code must be 3-50 characters.' });
    }

    const discountVal = Number(discount_value);
    if (!discountVal || discountVal <= 0) {
        return res.status(400).json({ message: 'Discount value must be greater than 0.' });
    }
    if (discount_type === 'percent' && discountVal > 100) {
        return res.status(400).json({ message: 'Percentage discount cannot exceed 100%.' });
    }

    const validUsageTypes = ['one_time', 'limited', 'unlimited'];
    const resolvedUsageType = validUsageTypes.includes(usage_type) ? usage_type : 'unlimited';

    let resolvedMaxUses = null;
    if (resolvedUsageType === 'one_time') {
        resolvedMaxUses = 1;
    } else if (resolvedUsageType === 'limited') {
        resolvedMaxUses = Number(max_uses) || 10;
        if (resolvedMaxUses < 1) resolvedMaxUses = 1;
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO sarga_coupons (code, discount_type, discount_value, usage_type, max_uses, min_order_amount, expiry_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                cleanCode,
                discount_type === 'amount' ? 'amount' : 'percent',
                discountVal,
                resolvedUsageType,
                resolvedMaxUses,
                Number(min_order_amount) || 0,
                expiry_date || null,
                req.user.id
            ]
        );
        auditLog(req.user.id, 'COUPON_CREATED', `Created coupon ${cleanCode} (${discount_type} ${discountVal})`);
        res.status(201).json({ id: result.insertId, code: cleanCode, message: 'Coupon created successfully.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: `Coupon code "${cleanCode}" already exists.` });
        }
        throw err;
    }
}));

// Update coupon
router.put('/coupons/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { discount_type, discount_value, usage_type, max_uses, min_order_amount, expiry_date, is_active } = req.body;

    const [existing] = await pool.query('SELECT id, code, discount_type, discount_value, usage_type, max_uses, used_count, min_order_amount, expiry_date, is_active, created_at FROM sarga_coupons WHERE id = ?', [id]);
    if (!existing.length) {
        return res.status(404).json({ message: 'Coupon not found.' });
    }

    const discountVal = Number(discount_value);
    if (!discountVal || discountVal <= 0) {
        return res.status(400).json({ message: 'Discount value must be greater than 0.' });
    }
    if (discount_type === 'percent' && discountVal > 100) {
        return res.status(400).json({ message: 'Percentage discount cannot exceed 100%.' });
    }

    const validUsageTypes = ['one_time', 'limited', 'unlimited'];
    const resolvedUsageType = validUsageTypes.includes(usage_type) ? usage_type : existing[0].usage_type;

    let resolvedMaxUses = null;
    if (resolvedUsageType === 'one_time') {
        resolvedMaxUses = 1;
    } else if (resolvedUsageType === 'limited') {
        resolvedMaxUses = Number(max_uses) || 10;
        if (resolvedMaxUses < 1) resolvedMaxUses = 1;
    }

    await pool.query(
        `UPDATE sarga_coupons SET discount_type = ?, discount_value = ?, usage_type = ?, max_uses = ?, min_order_amount = ?, expiry_date = ?, is_active = ? WHERE id = ?`,
        [
            discount_type === 'amount' ? 'amount' : 'percent',
            discountVal,
            resolvedUsageType,
            resolvedMaxUses,
            Number(min_order_amount) || 0,
            expiry_date || null,
            is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active,
            id
        ]
    );
    auditLog(req.user.id, 'COUPON_UPDATED', `Updated coupon #${id} (${existing[0].code})`);
    res.json({ message: 'Coupon updated successfully.' });
}));

// Delete (deactivate) coupon
router.delete('/coupons/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT id, code, discount_type, discount_value, usage_type, max_uses, used_count, min_order_amount, expiry_date, is_active, created_at FROM sarga_coupons WHERE id = ?', [id]);
    if (!existing.length) {
        return res.status(404).json({ message: 'Coupon not found.' });
    }

    await pool.query('UPDATE sarga_coupons SET is_active = 0 WHERE id = ?', [id]);
    auditLog(req.user.id, 'COUPON_DEACTIVATED', `Deactivated coupon ${existing[0].code}`);
    res.json({ message: 'Coupon deactivated.' });
}));

// ──────────────── BILLING: VALIDATE ────────────────

// Validate a coupon code (called from billing UI)
router.post('/coupons/validate', authenticateToken, asyncHandler(async (req, res) => {
    const { code, order_total } = req.body;

    if (!code || !code.trim()) {
        return res.status(400).json({ valid: false, message: 'Coupon code is required.' });
    }

    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '');
    const [rows] = await pool.query('SELECT * FROM sarga_coupons WHERE code = ?', [cleanCode]);

    if (!rows.length) {
        return res.status(404).json({ valid: false, message: 'Invalid coupon code.' });
    }

    const coupon = rows[0];

    // Check if active
    if (!coupon.is_active) {
        return res.json({ valid: false, message: 'This coupon is no longer active.' });
    }

    // Check expiry
    if (coupon.expiry_date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(coupon.expiry_date);
        expiry.setHours(23, 59, 59, 999);
        if (today > expiry) {
            return res.json({ valid: false, message: 'This coupon has expired.' });
        }
    }

    // Check usage limits
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
        return res.json({ valid: false, message: 'This coupon has reached its usage limit.' });
    }

    // Check minimum order amount
    const orderTotal = Number(order_total) || 0;
    if (coupon.min_order_amount > 0 && orderTotal < coupon.min_order_amount) {
        return res.json({
            valid: false,
            message: `Minimum order of ₹${Number(coupon.min_order_amount).toFixed(0)} required for this coupon.`
        });
    }

    // Valid!
    res.json({
        valid: true,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
        message: coupon.discount_type === 'percent'
            ? `${Number(coupon.discount_value)}% discount applied!`
            : `₹${Number(coupon.discount_value).toFixed(0)} discount applied!`
    });
}));

module.exports = router;

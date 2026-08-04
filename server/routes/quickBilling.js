const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { branchFilter } = require('../middleware/branchFilter');
const { getTodayDate } = require('../helpers');

// 1. GET ALL SHORTCUTS
router.get('/shortcuts', authenticateToken, async (req, res) => {
    try {
        const { branchId } = await branchFilter(req);
        const userRole = req.user.role;

        const branchWhere = branchId ? 'AND (s.branch_id IS NULL OR s.branch_id = ?)' : '';
        const params = branchId ? [branchId] : [];

        // Fetch shortcuts with their tiers and usage data
        const [shortcuts] = await pool.query(`
            SELECT s.*, 
                   IFNULL((SELECT usage_count FROM sarga_quick_shortcut_usage u WHERE u.shortcut_id = s.id AND u.user_id = ? LIMIT 1), 0) as my_usage
            FROM sarga_quick_shortcuts s
            LEFT JOIN sarga_quick_shortcut_permissions p ON p.shortcut_id = s.id AND p.role = ?
            WHERE s.status = 'active'
              AND (p.can_use IS NULL OR p.can_use = TRUE)
              ${branchWhere}
            ORDER BY s.sort_order ASC, my_usage DESC, s.name ASC
        `, [req.user.id, userRole, ...params]);

        const [tiers] = await pool.query(`SELECT * FROM sarga_quick_shortcut_tiers`);

        const formatted = shortcuts.map(s => {
            return {
                ...s,
                tiers: tiers.filter(t => t.shortcut_id === s.id)
            };
        });

        res.json(formatted);
    } catch (err) {
        console.error('Error fetching shortcuts:', err);
        res.status(500).json({ message: 'Failed to fetch shortcuts' });
    }
});

// 2. CREATE A SHORTCUT
router.post('/shortcuts', authenticateToken, async (req, res) => {
    if (!['Admin', 'Manager'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    const {
        name, display_name, category, description, icon, color, branch_id,
        default_price, pricing_mode, pricing_formula, unit, tax_rate,
        inventory_item_id, enable_offline, enable_voice_trigger, enable_barcode_trigger,
        keyboard_shortcut, tiers
    } = req.body;

    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const [result] = await connection.query(`
                INSERT INTO sarga_quick_shortcuts 
                (name, display_name, category, description, icon, color, branch_id, 
                 default_price, pricing_mode, pricing_formula, unit, tax_rate, 
                 inventory_item_id, enable_offline, enable_voice_trigger, enable_barcode_trigger, 
                 keyboard_shortcut, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                name, display_name, category, description, icon, color, branch_id || null,
                default_price || 0, pricing_mode || 'fixed', pricing_formula, unit || 'pcs', tax_rate || 0,
                inventory_item_id || null, !!enable_offline, !!enable_voice_trigger, !!enable_barcode_trigger,
                keyboard_shortcut || null, req.user.id
            ]);

            const shortcutId = result.insertId;

            if (pricing_mode === 'tier' && tiers && tiers.length > 0) {
                for (const t of tiers) {
                    await connection.query(
                        `INSERT INTO sarga_quick_shortcut_tiers (shortcut_id, min_qty, max_qty, price) VALUES (?, ?, ?, ?)`,
                        [shortcutId, t.min_qty, t.max_qty || null, t.price]
                    );
                }
            }

            await connection.commit();
            connection.release();
            res.status(201).json({ message: 'Shortcut created successfully', id: shortcutId });
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    } catch (err) {
        console.error('Error creating shortcut:', err);
        res.status(500).json({ message: 'Failed to create shortcut' });
    }
});

// 3. CHECKOUT (Create jobs & payments)
router.post('/checkout', authenticateToken, async (req, res) => {
    const { items, customer_id, payment_mode, branch_id } = req.body;
    
    if (!items || !items.length) {
        return res.status(400).json({ message: 'Cart is empty' });
    }

    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        const today = getTodayDate();
        
        let totalAmount = 0;
        
        try {
            for (const item of items) {
                const subtotal = Number(item.price) * Number(item.quantity) - Number(item.discount || 0);
                totalAmount += subtotal;

                // Create the job immediately as Completed/Delivered
                const [_jobResult] = await connection.query(`
                    INSERT INTO sarga_jobs (
                        branch_id, customer_id, job_name, description, quantity, 
                        total_amount, advance_paid, balance_amount, status, payment_status, 
                        delivery_date, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Completed', 'Paid', ?, ?)
                `, [
                    branch_id,
                    customer_id || null,
                    item.name,
                    `Quick Billing: ${item.name}`,
                    item.quantity,
                    subtotal,
                    subtotal,
                    0,
                    today,
                    req.user.id
                ]);

                // Track shortcut usage
                if (item.shortcut_id) {
                    await connection.query(`
                        INSERT INTO sarga_quick_shortcut_usage (shortcut_id, user_id, branch_id, usage_count)
                        VALUES (?, ?, ?, 1)
                        ON DUPLICATE KEY UPDATE usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
                    `, [item.shortcut_id, req.user.id, branch_id]);
                }
            }

            // Create one consolidated payment record
            if (totalAmount > 0) {
                await connection.query(`
                    INSERT INTO sarga_customer_payments (
                        customer_id, branch_id, advance_paid, payment_method, 
                        payment_date, created_by, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    customer_id || null,
                    branch_id,
                    totalAmount,
                    payment_mode || 'Cash',
                    today,
                    req.user.id,
                    'Quick Billing Consolidation'
                ]);
            }

            await connection.commit();
            connection.release();
            res.status(200).json({ message: 'Checkout successful', totalAmount });
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    } catch (err) {
        console.error('Error during quick checkout:', err);
        res.status(500).json({ message: 'Failed to process checkout' });
    }
});

module.exports = router;

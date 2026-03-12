const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');

// Ensure that only Admin or Accountant can access these endpoints
const allowedRoles = ['Admin', 'Accountant'];

// GET /stock-verification/:month
// Fetches the stock verification for a specific month (YYYY-MM).
// If no draft exists, it returns a new draft with all current inventory items.
router.get('/:month', authenticateToken, authorizeRoles(...allowedRoles), async (req, res) => {
    try {
        const { month } = req.params;

        // Check if there is already an existing verification for this month
        const [verifications] = await pool.query(
            'SELECT * FROM sarga_stock_verifications WHERE month = ?',
            [month]
        );

        let verification = verifications[0];

        if (verification) {
            // Fetch the items for the existing verification
            const [items] = await pool.query(
                `SELECT 
                    vi.*, 
                    i.name, i.sku, i.category, i.unit, i.cost_price 
                 FROM sarga_stock_verification_items vi
                 JOIN sarga_inventory i ON vi.inventory_item_id = i.id
                 WHERE vi.verification_id = ?`,
                [verification.id]
            );
            return res.json({ verification, items });
        }

        // Generate a new draft
        // We do not save it to DB yet; we just build the payload.
        // It gets saved when they click "Save Draft" or "Complete Verification".
        const [inventoryItems] = await pool.query(
            `SELECT 
                id as inventory_item_id, 
                quantity as system_quantity,
                name, sku, category, unit, cost_price
             FROM sarga_inventory`
        );

        // Populate a fresh items array based on current inventory
        const draftItems = inventoryItems.map(item => ({
            ...item,
            physical_quantity: null, // User fills this in
            notes: null
        }));

        res.json({
            verification: {
                id: null,
                month,
                status: 'Draft',
                verified_by: null
            },
            items: draftItems
        });

    } catch (err) {
        console.error('Stock verification get error:', err);
        res.status(500).json({ message: 'Error fetching stock verification.' });
    }
});

// POST /stock-verification
// Creates or updates a stock verification draft/completion
router.post('/', authenticateToken, authorizeRoles(...allowedRoles), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { month, status, items } = req.body;
        const userId = req.user.id;

        if (!month || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
            return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
        }
        if (!['Draft', 'Completed'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status.' });
        }

        await connection.beginTransaction();

        // Check if there's an existing record
        const [existing] = await connection.query(
            'SELECT * FROM sarga_stock_verifications WHERE month = ? FOR UPDATE',
            [month]
        );

        let verificationId;

        if (existing.length > 0) {
            if (existing[0].status === 'Completed') {
                await connection.rollback();
                return res.status(400).json({ message: 'This month is already completed and cannot be modified.' });
            }
            verificationId = existing[0].id;
            // Update status and user
            await connection.query(
                'UPDATE sarga_stock_verifications SET status = ?, verified_by = ? WHERE id = ?',
                [status, userId, verificationId]
            );
            // Clear old items to rebuild
            await connection.query(
                'DELETE FROM sarga_stock_verification_items WHERE verification_id = ?',
                [verificationId]
            );
        } else {
            // Create new record
            const [insertResult] = await connection.query(
                'INSERT INTO sarga_stock_verifications (month, status, verified_by) VALUES (?, ?, ?)',
                [month, status, userId]
            );
            verificationId = insertResult.insertId;
        }

        // Insert items
        if (items && items.length > 0) {
            const values = items.map(item => [
                verificationId,
                item.inventory_item_id,
                Number(item.system_quantity) || 0,
                item.physical_quantity !== null && item.physical_quantity !== '' ? Number(item.physical_quantity) : null,
                item.notes || null
            ]);

            await connection.query(
                `INSERT INTO sarga_stock_verification_items 
                (verification_id, inventory_item_id, system_quantity, physical_quantity, notes) 
                VALUES ?`,
                [values]
            );
        }

        // If completing, we must update the main inventory
        if (status === 'Completed') {
            for (const item of items) {
                // Only update if a physical quantity was provided
                if (item.physical_quantity !== null && item.physical_quantity !== '') {
                    const physQty = Number(item.physical_quantity);
                    const sysQty = Number(item.system_quantity) || 0;

                    if (physQty !== sysQty) {
                        // Log consumption or restock based on the difference?
                        // For a pure physical verification, we simply OVERWRITE the current quantity
                        await connection.query(
                            'UPDATE sarga_inventory SET quantity = ? WHERE id = ?',
                            [physQty, item.inventory_item_id]
                        );

                        // We log the adjustment to the consumption/reorders table just to have a trail
                        const diff = physQty - sysQty;
                        if (diff < 0) {
                            // Shrinkage/Loss -> Consumption
                            await connection.query(
                                'INSERT INTO sarga_inventory_consumption (inventory_item_id, quantity_consumed, consumed_by_user_id, notes) VALUES (?, ?, ?, ?)',
                                [item.inventory_item_id, Math.abs(diff), userId, `Stock verification variance (${month})`]
                            );
                        } else if (diff > 0) {
                            // Extra Found -> Restock
                            await connection.query(
                                'INSERT INTO sarga_inventory_reorders (inventory_item_id, quantity_received, cost_price, notes, days_since_last_reorder) VALUES (?, ?, COALESCE((SELECT cost_price FROM sarga_inventory WHERE id = ?), 0), ?, NULL)',
                                [item.inventory_item_id, diff, item.inventory_item_id, `Stock verification variance (${month})`]
                            );
                        }
                    }
                }
            }
            auditLog(userId, 'STOCK_VERIFICATION_COMPLETE', `Completed stock verification for ${month}`);
        } else {
            auditLog(userId, 'STOCK_VERIFICATION_DRAFT', `Saved stock verification draft for ${month}`);
        }

        await connection.commit();
        res.json({ message: 'Stock verification saved successfully.' });
    } catch (err) {
        await connection.rollback();
        console.error('Stock verification post error:', err);
        res.status(500).json({ message: 'Failed to save stock verification.' });
    } finally {
        connection.release();
    }
});

// GET /stock-verification/history/list
// Fetch list of past verifications
router.get('/history/list', authenticateToken, authorizeRoles(...allowedRoles), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT v.*, s.name as verified_by_name 
             FROM sarga_stock_verifications v 
             LEFT JOIN sarga_staff s ON v.verified_by = s.id 
             ORDER BY v.month DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('Stock verification get history error:', err);
        res.status(500).json({ message: 'Error fetching history.' });
    }
});

module.exports = router;

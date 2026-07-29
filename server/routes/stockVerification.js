const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { paginate } = require('../helpers/pagination');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const verificationUpload = multer({
    storage: multer.diskStorage({
        destination: uploadsDir,
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || '.jpg';
            cb(null, `sv-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only image files (jpg, jpeg, png, webp, gif) are allowed.'));
    }
});

// Ensure that only Admin or Accountant can access these endpoints
const allowedRoles = ['Admin', 'Accountant'];

async function logInventoryMovement(conn, inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by) {
    await conn.query(
        `INSERT INTO sarga_inventory_movement_log
         (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes || null, created_by || null]
    );
}

// GET /stock-verification/:month
// Fetches the stock verification for a specific month (YYYY-MM).
// If no draft exists, it returns a new draft with all current inventory items.
router.get('/:month', authenticateToken, authorizeRoles(...allowedRoles), async (req, res) => {
    try {
        const { month } = req.params;
        const branchId = ['Admin', 'Accountant'].includes(req.user.role)
            ? (req.query.branch_id || req.user.branch_id)
            : req.user.branch_id;

        // Check if there is already an existing verification for this month and branch
        const [verifications] = await pool.query(
            'SELECT * FROM sarga_stock_verifications WHERE month = ? AND branch_id = ?',
            [month, branchId]
        );

        let verification = verifications[0];

        if (verification) {
            // Fetch ALL inventory items, left-joining saved verification data so
            // items added to inventory after the draft was saved still appear.
            const [items] = await pool.query(
                `SELECT 
                    i.id AS inventory_item_id,
                    COALESCE(vi.system_quantity, bs.quantity, 0) AS system_quantity,
                    vi.physical_quantity,
                    vi.notes,
                    vi.image,
                    i.name, i.sku, i.category, i.unit, i.cost_price
                 FROM sarga_inventory i
                 LEFT JOIN sarga_branch_stock bs
                   ON bs.inventory_item_id = i.id AND bs.branch_id = ?
                 LEFT JOIN sarga_stock_verification_items vi
                   ON vi.inventory_item_id = i.id AND vi.verification_id = ?
                 ORDER BY i.category, i.name`,
                [branchId, verification.id]
            );
            return res.json({ verification, items });
        }

        // Generate a new draft
        // We do not save it to DB yet; we just build the payload.
        // It gets saved when they click "Save Draft" or "Complete Verification".
        const [inventoryItems] = await pool.query(
            `SELECT 
                i.id as inventory_item_id, 
                COALESCE(bs.quantity, 0) as system_quantity,
                i.name, i.sku, i.category, i.unit, i.cost_price
             FROM sarga_inventory i
             LEFT JOIN sarga_branch_stock bs
               ON bs.inventory_item_id = i.id AND bs.branch_id = ?
             ORDER BY i.category, i.name`,
            [branchId]
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
                verified_by: null,
                branch_id: branchId
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
        const branchId = ['Admin', 'Accountant'].includes(req.user.role)
            ? (req.body.branch_id || req.user.branch_id)
            : req.user.branch_id;

        if (!month || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
            return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
        }
        if (!['Draft', 'Completed'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status.' });
        }

        await connection.beginTransaction();

        // Check if there's an existing record
        const [existing] = await connection.query(
            'SELECT * FROM sarga_stock_verifications WHERE month = ? AND branch_id = ? FOR UPDATE',
            [month, branchId]
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
                'INSERT INTO sarga_stock_verifications (month, status, verified_by, branch_id) VALUES (?, ?, ?, ?)',
                [month, status, userId, branchId]
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

        // If completing, we must update the branch stock and main inventory
        if (status === 'Completed') {
            for (const item of items) {
                // Only update if a physical quantity was provided
                if (item.physical_quantity !== null && item.physical_quantity !== '') {
                    const physQty = Number(item.physical_quantity);
                    const sysQty = Number(item.system_quantity) || 0;

                    if (physQty !== sysQty) {
                        // Update branch stock
                        await connection.query(
                            `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity)
                             VALUES (?, ?, ?)
                             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
                            [item.inventory_item_id, branchId, physQty]
                        );

                        // Recalculate global quantity
                        await connection.query(
                            `UPDATE sarga_inventory i
                             SET quantity = (
                                 SELECT COALESCE(SUM(quantity), 0)
                                 FROM sarga_branch_stock
                                 WHERE inventory_item_id = i.id
                             )
                             WHERE id = ?`,
                            [item.inventory_item_id]
                        );

                        // Log variance as an Adjustment record in sarga_inventory_movement_log
                        const diff = physQty - sysQty;
                        await logInventoryMovement(
                            connection,
                            item.inventory_item_id,
                            branchId,
                            'Adjustment',
                            diff,
                            sysQty,
                            physQty,
                            'stock_verification',
                            verificationId,
                            item.notes || `Stock verification variance (${month})`,
                            userId
                        );
                    }
                }
            }
            auditLog(userId, 'STOCK_VERIFICATION_COMPLETE', `Completed stock verification for ${month} (Branch #${branchId})`);
        } else {
            auditLog(userId, 'STOCK_VERIFICATION_DRAFT', `Saved stock verification draft for ${month} (Branch #${branchId})`);
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
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

        const baseFrom = `
            FROM sarga_stock_verifications v 
            LEFT JOIN sarga_staff s ON v.verified_by = s.id
            LEFT JOIN sarga_branches b ON v.branch_id = b.id`;

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`);
        const [rows] = await pool.query(`
            SELECT v.*, s.name as verified_by_name, b.name as branch_name 
            ${baseFrom}
            ORDER BY v.month DESC, b.name ASC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        
        res.json(response(rows, total));
    } catch (err) {
        console.error('Stock verification get history error:', err);
        res.status(500).json({ message: 'Error fetching history.' });
    }
});

// POST /stock-verification/:id/items/:itemId/image
// Upload an image for a specific verification item
router.post('/:id/items/:itemId/image', authenticateToken, authorizeRoles(...allowedRoles), (req, res, next) => {
    verificationUpload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ message: err.message });
        next();
    });
}, async (req, res) => {
    try {
        const { id, itemId } = req.params;

        const [[verification]] = await pool.query(
            'SELECT id FROM sarga_stock_verifications WHERE id = ?', [id]
        );
        if (!verification) return res.status(404).json({ message: 'Verification not found.' });

        const [[item]] = await pool.query(
            'SELECT id, image FROM sarga_stock_verification_items WHERE id = ? AND verification_id = ?',
            [itemId, id]
        );
        if (!item) return res.status(404).json({ message: 'Verification item not found.' });

        // Delete old image if exists
        if (item.image) {
            const oldPath = path.join(uploadsDir, item.image);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const filename = req.file.filename;
        await pool.query(
            'UPDATE sarga_stock_verification_items SET image = ? WHERE id = ?',
            [filename, itemId]
        );

        res.json({ image: filename });
    } catch (err) {
        console.error('Image upload error:', err);
        res.status(500).json({ message: 'Failed to upload image.' });
    }
});

// DELETE /stock-verification/:id/items/:itemId/image
// Remove the image from a verification item
router.delete('/:id/items/:itemId/image', authenticateToken, authorizeRoles(...allowedRoles), async (req, res) => {
    try {
        const { id, itemId } = req.params;

        const [[item]] = await pool.query(
            'SELECT id, image FROM sarga_stock_verification_items WHERE id = ? AND verification_id = ?',
            [itemId, id]
        );
        if (!item) return res.status(404).json({ message: 'Verification item not found.' });

        if (item.image) {
            const filePath = path.join(uploadsDir, item.image);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await pool.query(
                'UPDATE sarga_stock_verification_items SET image = ? WHERE id = ?',
                [null, itemId]
            );
        }

        res.json({ message: 'Image removed.' });
    } catch (err) {
        console.error('Image delete error:', err);
        res.status(500).json({ message: 'Failed to delete image.' });
    }
});

module.exports = router;

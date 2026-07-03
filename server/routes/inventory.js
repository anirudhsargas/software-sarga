const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog, getUserBranchId } = require('../helpers');
const { branchFilter } = require('../middleware/branchFilter');
const { invalidateHierarchyCache } = require('./jobs');
const { validate, addInventorySchema } = require('../middleware/validate');
const { paginate } = require('../helpers/pagination');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { extractBillData } = require('../utils/ocrParser');
const { _resolveInventoryImage, getInventoryImageSettings } = require('../services/imageService');

// Configure Multer for file uploads (temporary storage)
const upload = multer({ dest: os.tmpdir() });

const normalizeScannedCode = (value) => String(value || '').trim().replace(/\s+/g, '').toUpperCase();
const normalizeSkuInput = (value) => {
    const normalized = normalizeScannedCode(value);
    return normalized || null;
};

async function logInventoryMovement(conn, inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by) {
    await conn.query(
        `INSERT INTO sarga_inventory_movement_log
         (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes || null, created_by || null]
    );
}

async function findInventoryByScannedCode(rawCode) {
    const normalized = normalizeScannedCode(rawCode);
    if (!normalized) return { normalized, item: null, matchType: null };

    let rows;
    const itemIdMatch = normalized.match(/^ITEM-(\d+)$/i);

    if (itemIdMatch) {
        [rows] = await pool.query(
            'SELECT i.*, p.image_url FROM sarga_inventory i LEFT JOIN sarga_products p ON i.id = p.inventory_item_id WHERE i.id = ? LIMIT 1',
            [itemIdMatch[1]]
        );
        return { normalized, item: rows[0] || null, matchType: rows[0] ? 'fallback-id' : null };
    }

    [rows] = await pool.query(
        "SELECT i.*, p.image_url FROM sarga_inventory i LEFT JOIN sarga_products p ON i.id = p.inventory_item_id WHERE REPLACE(UPPER(i.sku), ' ', '') = ? LIMIT 1",
        [normalized]
    );
    return { normalized, item: rows[0] || null, matchType: rows[0] ? 'sku' : null };
}

// Auto-migrate: ensure reserved_quantity column exists on sarga_inventory (deferred to avoid startup database contention)
setTimeout(async () => {
    try {
        const [[dbRow]] = await pool.query('SELECT DATABASE() AS db');
        const dbName = dbRow?.db;
        const [cols] = await pool.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_inventory' AND COLUMN_NAME = 'reserved_quantity'`,
            [dbName]
        );
        if (!cols || cols.length === 0) {
            await pool.query('ALTER TABLE sarga_inventory ADD COLUMN reserved_quantity INT NOT NULL DEFAULT 0');
            try {
                await pool.query('ALTER TABLE sarga_inventory ADD CONSTRAINT chk_inventory_reserved_quantity CHECK (reserved_quantity >= 0)');
            } catch (_e) {
                // Some MySQL versions / engines ignore CHECK; non-fatal
            }
            console.log('[InventoryMigration] Added reserved_quantity column to sarga_inventory');
        }
    } catch (err) {
        console.warn('inventory migration warning:', err.message || err);
    }
}, 10000); // 10s delay to let the main DB migration finish and connections warm up

// --- INVENTORY ROUTES (Admin Only) ---

// List Inventory with enhanced filtering and branch stock support
router.get('/inventory', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'), async (req, res) => {
    try {
        const { branchId: filterBranchId } = await branchFilter(req, { column: 'i.id', allowPrivilegedQuery: true, queryKey: 'branch_id', nullableForPrivileged: true });
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);
        
        const search = req.query.search ? `%${String(req.query.search).trim().substring(0, 100)}%` : null;
        const itemType = req.query.item_type ? String(req.query.item_type).trim() : null;
        const category = req.query.category ? String(req.query.category).trim() : null;
        const status = req.query.status ? String(req.query.status).toLowerCase().trim() : null;
        const priceMin = req.query.price_min ? Math.max(0, parseFloat(req.query.price_min)) : null;
        const priceMax = req.query.price_max ? Math.max(0, parseFloat(req.query.price_max)) : null;
        const quantityMin = req.query.quantity_min ? Math.max(0, parseInt(req.query.quantity_min)) : null;
        const quantityMax = req.query.quantity_max ? Math.max(0, parseInt(req.query.quantity_max)) : null;
        const sortBy = req.query.sort_by ? String(req.query.sort_by).toLowerCase().trim() : 'created_at';
        const sortOrder = req.query.sort_order ? String(req.query.sort_order).toUpperCase().trim() : 'DESC';
        
        const validSortFields = ['id', 'name', 'sku', 'quantity', 'cost_price', 'category', 'created_at', 'updated_at'];
        const validSortOrders = ['ASC', 'DESC'];
        const finalSortBy = validSortFields.includes(sortBy) ? `i.${sortBy}` : 'i.created_at';
        const finalSortOrder = validSortOrders.includes(sortOrder) ? sortOrder : 'DESC';
        
        const validStatuses = ['low', 'ok', 'out-of-stock', 'in-stock'];
        const finalStatus = validStatuses.includes(status) ? status : null;
        
        if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid price range: min price cannot exceed max price' 
            });
        }

        let whereClauses = [];
        let params = [];

        // Use is_deleted filter if column exists (migration may not have run yet)
        let isDeletedFilter = 'i.is_deleted = 0';
        try {
            // Test if column exists
            await pool.query('SELECT is_deleted FROM sarga_inventory LIMIT 0');
        } catch (_) {
            isDeletedFilter = '1=1';
        }
        whereClauses.push(isDeletedFilter);
        let joinClauses = [];
        let selectExtra = '';

        // Branch stock join and select
        if (filterBranchId) {
            joinClauses.push(`LEFT JOIN sarga_branch_stock bs ON bs.inventory_item_id = i.id AND bs.branch_id = ?`);
            params.push(filterBranchId);
            selectExtra = `, COALESCE(bs.quantity, 0) AS branch_stock`;
        } else {
            selectExtra = `, (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id) AS total_branch_stock`;
        }

        if (search) {
            whereClauses.push(`(i.name LIKE ? OR i.sku LIKE ?)`);
            params.push(search, search);
        }

        if (itemType) {
            whereClauses.push(`LOWER(i.item_type) = LOWER(?)`);
            params.push(itemType);
        }

        if (category) {
            whereClauses.push(`(LOWER(i.category) = LOWER(?) OR LOWER(ps.name) = LOWER(?))`);
            params.push(category, category);
        }

        const vendorName = req.query.vendor_name ? String(req.query.vendor_name).trim() : null;
        if (vendorName) {
            const v = vendorName.substring(0, 100);
            whereClauses.push(`(i.vendor_name LIKE ? OR p.company_name LIKE ?)`);
            params.push(`%${v}%`, `%${v}%`);
        }

        // Status filter — use branch stock when branch is specified
        const stockExpr = filterBranchId ? 'COALESCE(bs.quantity, 0)' : 'i.quantity';
        if (finalStatus === 'low') {
            whereClauses.push(`${stockExpr} <= COALESCE(i.reorder_level, 10)`);
        } else if (finalStatus === 'ok') {
            whereClauses.push(`${stockExpr} > COALESCE(i.reorder_level, 10)`);
        } else if (finalStatus === 'out-of-stock') {
            whereClauses.push(`${stockExpr} <= 0`);
        } else if (finalStatus === 'in-stock') {
            whereClauses.push(`${stockExpr} > 0`);
        }

        if (priceMin !== null) {
            whereClauses.push(`i.cost_price >= ?`);
            params.push(priceMin);
        }
        if (priceMax !== null) {
            whereClauses.push(`i.cost_price <= ?`);
            params.push(priceMax);
        }

        if (quantityMin !== null) {
            whereClauses.push(`${stockExpr} >= ?`);
            params.push(quantityMin);
        }
        if (quantityMax !== null) {
            whereClauses.push(`${stockExpr} <= ?`);
            params.push(quantityMax);
        }

        const joinSection = joinClauses.length > 0 ? ' ' + joinClauses.join(' ') : '';
        const whereSection = whereClauses.length > 0 ? ` WHERE ` + whereClauses.join(' AND ') : '';

        const countQuery = `SELECT COUNT(DISTINCT i.id) as total 
                         FROM sarga_inventory i 
                         LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
                         LEFT JOIN sarga_product_subcategories ps ON p.subcategory_id = ps.id
                         ${joinSection}
                         ${whereSection}`;
        
        const dataQuery = `SELECT DISTINCT i.*, p.id as linked_product_id, p.image_url as product_image_url, ps.name as product_subcategory_name, pc.name as product_category_name, spi.image_url as cached_image_url, spi.source as image_source, spi.confidence as image_confidence, spi.is_locked as image_locked ${selectExtra}
                        FROM sarga_inventory i 
                        LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
                        LEFT JOIN sarga_product_subcategories ps ON p.subcategory_id = ps.id
                        LEFT JOIN sarga_product_categories pc ON ps.category_id = pc.id
                        LEFT JOIN sarga_product_images spi ON i.id = spi.inventory_item_id
                        ${joinSection}
                        ${whereSection}
                        ORDER BY ${finalSortBy} ${finalSortOrder}, i.id ASC
                        LIMIT ? OFFSET ?`;
        
        const [[{ total }]] = await pool.query(countQuery, params);
        const [rows] = await pool.query(dataQuery, [...params, limit, offset]);

        const itemIds = rows.map(r => r.id);
        if (itemIds.length > 0) {
            const [stocks] = await pool.query(
                `SELECT bs.inventory_item_id, bs.branch_id, bs.quantity, b.name as branch_name, b.short_name as branch_short_name
                 FROM sarga_branch_stock bs
                 JOIN sarga_branches b ON bs.branch_id = b.id
                 WHERE bs.inventory_item_id IN (?)`,
                [itemIds]
            );

            const stocksMap = stocks.reduce((acc, s) => {
                if (!acc[s.inventory_item_id]) acc[s.inventory_item_id] = [];
                acc[s.inventory_item_id].push({
                    branch_id: s.branch_id,
                    branch_name: s.branch_name,
                    short_name: s.branch_short_name,
                    quantity: s.quantity
                });
                return acc;
            }, {});

            rows.forEach(r => {
                r.branch_stocks = stocksMap[r.id] || [];
            });
        } else {
            rows.forEach(r => {
                r.branch_stocks = [];
            });
        }
        
        res.json(response(rows, total));
    } catch (err) {
        console.error('Inventory fetch error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch inventory'
        });
    }
});

// Low stock items per branch (uses sarga_branch_stock when branch is specified)
router.get('/inventory/low-stock', authenticateToken, async (req, res) => {
    try {
        const { branchId: filterBranchId } = await branchFilter(req, { column: 'bs.branch_id', allowPrivilegedQuery: true, queryKey: 'branch_id' });

        let where = '';
        let params = [];
        if (filterBranchId) {
            where = 'WHERE bs.branch_id = ? AND bs.quantity <= COALESCE(i.reorder_level, 10)';
            params.push(filterBranchId);
        } else {
            where = 'WHERE i.quantity <= COALESCE(i.reorder_level, 10)';
        }

        const [rows] = await pool.query(
            `SELECT i.id, i.name, i.sku, i.quantity AS global_stock, i.reorder_level, i.category, i.unit,
                    COALESCE(bs.quantity, 0) AS branch_stock, b.id AS branch_id, b.name AS branch_name, b.short_name AS branch_short_name
             FROM sarga_inventory i
             LEFT JOIN sarga_branch_stock bs ON bs.inventory_item_id = i.id${filterBranchId ? ' AND bs.branch_id = ?' : ''}
             LEFT JOIN sarga_branches b ON b.id = bs.branch_id
             ${where}
             ORDER BY ${filterBranchId ? 'bs.quantity' : 'i.quantity'} ASC
             LIMIT 200`,
            filterBranchId ? [...params, filterBranchId] : params
        );

        res.json(rows);
    } catch (err) {
        console.error('Low stock fetch error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Get movement log for an inventory item
router.get('/inventory/:id/movements', authenticateToken, async (req, res) => {
    try {
        const itemId = parseInt(req.params.id);
        if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });

        const { branchId: filterBranchId } = await branchFilter(req, { column: 'ml.branch_id', allowPrivilegedQuery: true, queryKey: 'branch_id' });
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        let where = 'WHERE ml.inventory_item_id = ?';
        let params = [itemId];
        if (filterBranchId) {
            where += ' AND ml.branch_id = ?';
            params.push(filterBranchId);
        }

        const [rows] = await pool.query(
            `SELECT ml.*, s.name AS created_by_name, b.name AS branch_name
             FROM sarga_inventory_movement_log ml
             LEFT JOIN sarga_staff s ON ml.created_by = s.id
             LEFT JOIN sarga_branches b ON ml.branch_id = b.id
             ${where}
             ORDER BY ml.created_at DESC LIMIT ?`,
            [...params, limit]
        );

        res.json(rows);
    } catch (err) {
        console.error('Movement log fetch error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Get single inventory item detail with full product info, branch stock, and movement log
router.get('/inventory/:id', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT i.*, 
                    p.id as linked_product_id, p.image_url as product_image_url, p.description as product_description,
                    ps.name as product_subcategory_name, ps.id as subcategory_id,
                    pc.name as product_category_name, pc.id as category_id,
                    spi.image_url as cached_image_url, spi.source as image_source, spi.confidence as image_confidence, spi.is_locked as image_locked
             FROM sarga_inventory i 
             LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
             LEFT JOIN sarga_product_subcategories ps ON p.subcategory_id = ps.id
             LEFT JOIN sarga_product_categories pc ON ps.category_id = pc.id
             LEFT JOIN sarga_product_images spi ON i.id = spi.inventory_item_id
             WHERE i.id = ? LIMIT 1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Item not found' });

        const item = rows[0];

        // Get restock history (last 10)
        const [restocks] = await pool.query(
            `SELECT quantity_received, cost_price, days_since_last_reorder, created_at 
             FROM sarga_inventory_reorders WHERE inventory_item_id = ? ORDER BY created_at DESC LIMIT 10`,
            [item.id]
        );

        // Get consumption history for consumables (last 10)
        let consumptions = [];
        if (item.item_type === 'Consumable') {
            const [cRows] = await pool.query(
                `SELECT c.quantity_consumed, c.notes, c.created_at, s.name as consumed_by 
                 FROM sarga_inventory_consumption c
                 LEFT JOIN sarga_staff s ON c.consumed_by_user_id = s.id
                 WHERE c.inventory_item_id = ? ORDER BY c.created_at DESC LIMIT 10`,
                [item.id]
            );
            consumptions = cRows;
        }

        // Get branch stock for all branches
        const [branchStocks] = await pool.query(
            `SELECT b.id AS branch_id, b.name AS branch_name, b.short_name AS branch_short_name, COALESCE(bs.quantity, 0) AS quantity
             FROM sarga_branches b
             LEFT JOIN sarga_branch_stock bs ON bs.branch_id = b.id AND bs.inventory_item_id = ?
             ORDER BY b.name`,
            [item.id]
        );

        // Get movement log (last 20)
        const [movements] = await pool.query(
            `SELECT ml.*, s.name AS created_by_name
             FROM sarga_inventory_movement_log ml
             LEFT JOIN sarga_staff s ON ml.created_by = s.id
             WHERE ml.inventory_item_id = ?
             ORDER BY ml.created_at DESC LIMIT 20`,
            [item.id]
        );

        // Calculate derived values
        const costPrice = Number(item.cost_price) || 0;
        const gstRate = Number(item.gst_rate) || 0;
        const gstAmount = (costPrice * gstRate) / 100;
        const sellPrice = Number(item.sell_price) || 0;
        const stockValue = costPrice * (Number(item.quantity) || 0);
        const margin = sellPrice > 0 ? (((sellPrice - costPrice - gstAmount) / sellPrice) * 100) : 0;

        res.json({
            ...item,
            gst_amount: gstAmount.toFixed(2),
            stock_value: stockValue.toFixed(2),
            margin: margin.toFixed(1),
            restocks,
            consumptions,
            branch_stocks: branchStocks,
            movements
        });
    } catch (err) {
        console.error('Inventory detail error:', err);
        res.status(500).json({ message: 'Failed to fetch item details' });
    }
});

// Branch availability for stock requests — returns other branches with per-branch stock
router.get('/inventory/:id/branch-availability', authenticateToken, async (req, res) => {
    try {
        const itemId = parseInt(req.params.id);
        if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });

        const userBranchId = await getUserBranchId(req.user.id);

        const [items] = await pool.query(
            'SELECT id, name, sku, quantity, unit FROM sarga_inventory WHERE id = ?', [itemId]
        );
        if (!items.length) return res.status(404).json({ message: 'Item not found' });

        let branches;
        if (userBranchId) {
            [branches] = await pool.query(
                `SELECT b.id, b.name, b.short_name, COALESCE(bs.quantity, 0) AS available_stock
                 FROM sarga_branches b
                 LEFT JOIN sarga_branch_stock bs ON bs.branch_id = b.id AND bs.inventory_item_id = ?
                 WHERE b.id != ?
                 ORDER BY b.name`,
                [itemId, userBranchId]
            );
        } else {
            [branches] = await pool.query(
                `SELECT b.id, b.name, b.short_name, COALESCE(bs.quantity, 0) AS available_stock
                 FROM sarga_branches b
                 LEFT JOIN sarga_branch_stock bs ON bs.branch_id = b.id AND bs.inventory_item_id = ?
                 ORDER BY b.name`,
                [itemId]
            );
        }

        res.json({
            item: items[0],
            user_branch_id: userBranchId,
            branches: branches.map(b => ({
                id: b.id,
                name: b.name,
                short_name: b.short_name,
                available_stock: b.available_stock,
                unit: items[0].unit
            }))
        });
    } catch (err) {
        console.error('Branch availability error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

    // --- Paper cut mappings (parent sheet -> child size mapping) ---
    router.get('/inventory/paper-cut-maps', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            const parentId = req.query.parent_id ? Number(req.query.parent_id) : null;
            const categoryFilter = req.query.category ? String(req.query.category).trim() : null;
            let rows;

            if (parentId) {
                [rows] = await pool.query('SELECT * FROM sarga_paper_cut_map WHERE parent_inventory_item_id = ? ORDER BY created_at DESC', [parentId]);
            } else if (categoryFilter) {
                // Return mappings where the parent inventory item belongs to the requested category
                [rows] = await pool.query(
                    `SELECT pcm.*, i.name as parent_name, i.category as parent_category
                     FROM sarga_paper_cut_map pcm
                     LEFT JOIN sarga_inventory i ON i.id = pcm.parent_inventory_item_id
                     WHERE LOWER(COALESCE(i.category, '')) = LOWER(?)
                     ORDER BY pcm.created_at DESC`,
                    [categoryFilter]
                );
            } else {
                [rows] = await pool.query('SELECT pcm.*, i.name as parent_name, i.category as parent_category FROM sarga_paper_cut_map pcm LEFT JOIN sarga_inventory i ON i.id = pcm.parent_inventory_item_id ORDER BY pcm.created_at DESC');
            }
            res.json(rows);
        } catch (err) {
            console.error('Cut map fetch error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    router.post('/inventory/paper-cut-maps', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        try {
            const { parent_inventory_item_id, child_size_code, pieces_per_parent, loss_pct, min_waste, notes } = req.body;
            if (!parent_inventory_item_id || !child_size_code || !pieces_per_parent) {
                return res.status(400).json({ message: 'Missing required fields' });
            }

            const [result] = await pool.query(
                `INSERT INTO sarga_paper_cut_map (parent_inventory_item_id, child_size_code, pieces_per_parent, loss_pct, min_waste, notes)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE pieces_per_parent = VALUES(pieces_per_parent), loss_pct = VALUES(loss_pct), min_waste = VALUES(min_waste), notes = VALUES(notes)`,
                [parent_inventory_item_id, String(child_size_code).trim(), Number(pieces_per_parent), Number(loss_pct) || 0, Number(min_waste) || 0, notes || null]
            );

            res.json({ id: result.insertId || null, message: 'Mapping saved' });
        } catch (err) {
            console.error('Cut map save error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    router.delete('/inventory/paper-cut-maps/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        try {
            await pool.query('DELETE FROM sarga_paper_cut_map WHERE id = ?', [req.params.id]);
            res.json({ message: 'Deleted' });
        } catch (err) {
            console.error('Cut map delete error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // --- Admin: paper types list and bulk mapping ---
    router.get('/inventory/paper-types', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            // Gather distinct categories from inventory and product subcategories
            const [invCats] = await pool.query("SELECT DISTINCT COALESCE(category, '') AS type FROM sarga_inventory WHERE category IS NOT NULL AND category != ''");
            const [subcats] = await pool.query("SELECT DISTINCT name AS type FROM sarga_product_subcategories WHERE name IS NOT NULL AND name != ''");

            const set = new Set();
            invCats.forEach(r => set.add(r.type));
            subcats.forEach(r => set.add(r.type));

            const types = Array.from(set).filter(Boolean).sort();
            res.json({ types });
        } catch (err) {
            console.error('Paper types fetch error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    router.post('/inventory/paper-map', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        try {
            const { inventory_ids, paper_type } = req.body;
            if (!Array.isArray(inventory_ids) || inventory_ids.length === 0) return res.status(400).json({ message: 'No inventory ids provided' });

            // Bulk update category on inventory items (serves as paper-type mapping)
            await pool.query('UPDATE sarga_inventory SET category = ? WHERE id IN (?)', [paper_type || null, inventory_ids]);

            try { auditLog(req.user.id, 'INVENTORY_PAPER_MAP', `Mapped ${inventory_ids.length} item(s) to ${paper_type}`, { entity_type: 'inventory', entity_ids: inventory_ids }); } catch (_e) { /* ignored */ }

            res.json({ message: 'Mapped successfully' });
        } catch (err) {
            console.error('Paper map error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

// Lookup inventory item by SKU — used by billing QR scan and sidebar scanner
router.get('/inventory/by-sku/:sku', authenticateToken, async (req, res) => {
    try {
        const rawSku = req.params.sku || '';
        const { normalized, item } = await findInventoryByScannedCode(rawSku);
        if (!item) return res.status(404).json({ message: `No item found for code: ${rawSku}` });

        // MRP priority: stored → sell_price → formula (Cost + GST) * 2
        const costPrice = Number(item.cost_price) || 0;
        const sellPrice = Number(item.sell_price) || 0;
        const gstRate = Number(item.gst_rate) || 0;
        const gstAmount = (costPrice * gstRate) / 100;
        const calculatedMrp = (costPrice + gstAmount) * 2;
        const finalMrp = (item.mrp != null ? Number(item.mrp) : sellPrice) || calculatedMrp || 0;

        res.json({ ...item, scanned_code: normalized, mrp: finalMrp % 1 === 0 ? finalMrp.toFixed(0) : finalMrp.toFixed(2) });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Quick verification endpoint for scanner diagnostics
router.get('/inventory/qr-diagnostic/:code', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'), async (req, res) => {
    try {
        const rawCode = req.params.code || '';
        const { normalized, item, matchType } = await findInventoryByScannedCode(rawCode);

        if (!normalized) {
            return res.status(400).json({
                found: false,
                input: rawCode,
                normalized: '',
                message: 'Empty/invalid code'
            });
        }

        if (!item) {
            return res.status(404).json({
                found: false,
                input: rawCode,
                normalized,
                message: 'No inventory item matches this code'
            });
        }

        res.json({
            found: true,
            input: rawCode,
            normalized,
            match_type: matchType,
            item: {
                id: item.id,
                sku: item.sku,
                name: item.name,
                category: item.category,
                quantity: item.quantity,
                reorder_level: item.reorder_level,
                image_url: item.image_url
            }
        });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Extract data from uploaded bill
router.post('/inventory/extract-bill', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('bill_file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const mimeType = req.file.mimetype;

        // Ensure supported type
        if (!['image/jpeg', 'image/png', 'application/pdf'].includes(mimeType)) {
            await fs.promises.unlink(filePath).catch(() => { });
            return res.status(400).json({ message: 'Unsupported file type. Please upload a JPG, PNG, or PDF.' });
        }

        const extractedData = await extractBillData(filePath, mimeType);

        // Clean up uploaded file
        await fs.promises.unlink(filePath).catch(console.error);

        res.json(extractedData);
    } catch (err) {
        console.error('OCR Extraction error:', err);
        if (req.file) {
            await fs.promises.unlink(req.file.path).catch(() => { });
        }
        res.status(500).json({ message: 'Failed to extract data from bill' });
    }
});

// Auto-create a product in the Product Library when an inventory item is added
async function autoCreateProductFromInventory(inventoryId, name, inventoryCategory, sku, sellPrice) {
    // Check if already linked
    const [existing] = await pool.query('SELECT id FROM sarga_products WHERE inventory_item_id = ?', [inventoryId]);
    if (existing.length > 0) return;

    const normalizeName = (v) => String(v || '').trim().toLowerCase();
    const normalizedInvCat = normalizeName(inventoryCategory);

    // Try to find matching subcategory by name (exact, contains, or parent category contains)
    const [allSubcats] = await pool.query(
        `SELECT s.id as sub_id, s.name as sub_name, c.id as cat_id, c.name as cat_name
         FROM sarga_product_subcategories s
         JOIN sarga_product_categories c ON s.category_id = c.id
         ORDER BY s.name`
    );

    let matchedSubcategoryId = null;

    // 1. Exact match on subcategory name
    for (const row of allSubcats) {
        if (normalizeName(row.sub_name) === normalizedInvCat) {
            matchedSubcategoryId = row.sub_id;
            break;
        }
    }

    // 2. Fuzzy: inventory category contains subcategory name or vice versa
    if (!matchedSubcategoryId) {
        for (const row of allSubcats) {
            const normalizedSub = normalizeName(row.sub_name);
            if (normalizedInvCat.includes(normalizedSub) || normalizedSub.includes(normalizedInvCat)) {
                matchedSubcategoryId = row.sub_id;
                break;
            }
        }
    }

    // 3. Fuzzy: inventory category matches parent category name
    if (!matchedSubcategoryId) {
        for (const row of allSubcats) {
            const normalizedCat = normalizeName(row.cat_name);
            if (normalizedInvCat.includes(normalizedCat) || normalizedCat.includes(normalizedInvCat)) {
                matchedSubcategoryId = row.sub_id;
                break;
            }
        }
    }

    if (!matchedSubcategoryId) {
        console.log(`[AutoProduct] No matching subcategory found for inventory category "${inventoryCategory}". Skipping auto-create.`);
        return;
    }

    // Get next position
    const [[posRow]] = await pool.query(
        'SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_products WHERE subcategory_id = ?',
        [matchedSubcategoryId]
    );

    const unitRate = Number(sellPrice) || 0;

    // Create product entry
    const [insertResult] = await pool.query(
        `INSERT INTO sarga_products (subcategory_id, name, product_code, calculation_type, description, has_paper_rate, paper_rate, has_double_side_rate, position, inventory_item_id, is_physical_product)
         VALUES (?, ?, ?, 'Normal', ?, 0, 0, 0, ?, ?, 1)`,
        [matchedSubcategoryId, String(name).trim(), sku || null, `Auto-created from inventory`, posRow.nextPos, inventoryId]
    );

    // Add a default slab with sell_price as unit_rate
    if (unitRate > 0) {
        await pool.query(
            'INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate) VALUES (?, 1, NULL, ?, ?)',
            [insertResult.insertId, unitRate, unitRate]
        );
    }

    invalidateHierarchyCache();
    console.log(`[AutoProduct] Created product #${insertResult.insertId} linked to inventory #${inventoryId} in subcategory #${matchedSubcategoryId}`);
}

// Add Inventory Item
// Auto-generate SKU: Company first 3 letters + Product name + Size
function generateAutoSku(category, itemId, sourceCode, modelName, sizeCode, itemName) {
    // If source_code/model_name/size_code are provided, build SKU from them
    const company = String(sourceCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const product = String(modelName || itemName || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, '');
    const size = String(sizeCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (company || product) {
        const companyPart = company.substring(0, 3) || (category || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'INV';
        const parts = [companyPart];
        if (product) parts.push(product);
        if (size) parts.push(size);
        return parts.join('-');
    }

    // Fallback: category prefix + item ID
    const prefix = (category || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
    return `${prefix || 'INV'}-${String(itemId).padStart(4, '0')}`;
}

router.post('/inventory', authenticateToken, authorizeRoles('Admin', 'Accountant'), validate(addInventorySchema), async (req, res) => {
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, product_id, source_code, model_name, size_code, item_type, vendor_name, vendor_contact, purchase_link, branch_stocks } = req.body;
    const normalizedSku = normalizeSkuInput(sku);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if an item with the same SKU already exists (excluding soft-deleted rows)
        let existingItem = null;
        if (normalizedSku) {
            const [skuMatches] = await connection.query("SELECT id, quantity FROM sarga_inventory WHERE REPLACE(UPPER(sku), ' ', '') = ? AND (is_deleted = 0 OR is_deleted IS NULL)", [normalizedSku]);
            if (skuMatches.length > 0) existingItem = skuMatches[0];
        }

        // 2. If no SKU match, check if an item with the same Name and Category already exists
        if (!existingItem) {
            const [nameMatches] = await connection.query(
                "SELECT id, quantity FROM sarga_inventory WHERE name = ? AND (category = ? OR (category IS NULL AND ? IS NULL))",
                [name, category || null, category || null]
            );
            if (nameMatches.length > 0) existingItem = nameMatches[0];
        }

        if (existingItem) {
            // Update existing item: increment quantity and update other details to latest
            let qtyToAdd = Number(quantity) || 0;
            if (branch_stocks && branch_stocks.length > 0) {
                qtyToAdd = branch_stocks.reduce((sum, bs) => sum + bs.quantity, 0);
            }
            const oldQty = Number(existingItem.quantity);
            const newQuantity = oldQty + qtyToAdd;
            await connection.query(
                `UPDATE sarga_inventory 
                 SET quantity = ?, sku = COALESCE(?, sku), category = ?, unit = ?, reorder_level = ?, cost_price = ?, sell_price = ?, hsn = ?, discount = ?, gst_rate = ?,
                     source_code = ?, model_name = ?, size_code = ?, item_type = ?, vendor_name = ?, vendor_contact = ?, purchase_link = ?
                 WHERE id = ?`,
                [
                    newQuantity,
                    normalizedSku,
                    category || null,
                    unit || 'pcs',
                    Number(reorder_level) || 0,
                    Number(cost_price) || 0,
                    Number(sell_price) || 0,
                    hsn || null,
                    Number(discount) || 0,
                    Number(gst_rate) || 0,
                    source_code || null,
                    model_name || null,
                    size_code || null,
                    item_type || 'Retail',
                    vendor_name || null,
                    vendor_contact || null,
                    purchase_link || null,
                    existingItem.id
                ]
            );

            const inventoryId = existingItem.id;

            // Update branch stock and log movement
            if (branch_stocks && branch_stocks.length > 0) {
                for (const bs of branch_stocks) {
                    if (bs.quantity > 0) {
                        const [bsBefore] = await connection.query(
                            'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
                            [inventoryId, bs.branch_id]
                        );
                        const qtyBefore = Number(bsBefore[0]?.quantity || 0);
                        await connection.query(
                            `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity) 
                             VALUES (?, ?, ?) 
                             ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                            [inventoryId, bs.branch_id, bs.quantity, bs.quantity]
                        );
                        const qtyAfter = qtyBefore + bs.quantity;
                        await logInventoryMovement(connection, inventoryId, bs.branch_id, 'Purchase', bs.quantity, qtyBefore, qtyAfter, 'inventory_add', null, null, req.user.id);
                    }
                }
            } else if (qtyToAdd > 0) {
                const branchId = req.body.branch_id || (await getUserBranchId(req.user.id));
                if (branchId) {
                    await connection.query(
                        `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity) 
                         VALUES (?, ?, ?) 
                         ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                        [inventoryId, branchId, qtyToAdd, qtyToAdd]
                    );
                    const [bsRow] = await connection.query(
                        'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
                        [inventoryId, branchId]
                    );
                    const qtyBefore = oldQty;
                    const qtyAfter = Number(bsRow[0]?.quantity || qtyToAdd);
                    await logInventoryMovement(connection, inventoryId, branchId, 'Purchase', qtyToAdd, qtyBefore, qtyAfter, 'inventory_add', null, null, req.user.id);
                }
            }

            if (product_id) {
                await connection.query(
                    "UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?",
                    [inventoryId, product_id]
                );
            }

            // Auto-create product in Product Library if not already linked
            if (!product_id) {
                try {
                    await autoCreateProductFromInventory(inventoryId, name, category, sku, sell_price);
                } catch (autoErr) {
                    console.error('Auto-create product on merge failed (non-blocking):', autoErr.message);
                }
            }

            await connection.commit();
            auditLog(req.user.id, 'INVENTORY_UPDATE_MERGE', `Merged ${qtyToAdd} unit(s) into item ${name} (ID: ${inventoryId})`);
            return res.json({ id: inventoryId, message: 'Item quantity updated and merged' });
        }

        // 3. Normal Insert if no existing item found
        let initialQty = Number(quantity) || 0;
        if (branch_stocks && branch_stocks.length > 0) {
            initialQty = branch_stocks.reduce((sum, bs) => sum + bs.quantity, 0);
        }

        const [result] = await connection.query(
            `INSERT INTO sarga_inventory (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, source_code, model_name, size_code, item_type, vendor_name, vendor_contact, purchase_link)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            , [
                name,
                normalizedSku,
                category || null,
                unit || 'pcs',
                initialQty,
                Number(reorder_level) || 0,
                Number(cost_price) || 0,
                Number(sell_price) || 0,
                hsn || null,
                Number(discount) || 0,
                Number(gst_rate) || 0,
                source_code || null,
                model_name || null,
                size_code || null,
                item_type || 'Retail',
                vendor_name || null,
                vendor_contact || null,
                purchase_link || null
            ]
        );

        const inventoryId = result.insertId;

        // Auto-generate SKU if none was provided
        let finalSku = normalizedSku;
        if (!finalSku) {
            finalSku = generateAutoSku(category, inventoryId, source_code, model_name, size_code, name);
            await connection.query("UPDATE sarga_inventory SET sku = ? WHERE id = ? AND sku IS NULL", [finalSku, inventoryId]);
        }

        // If a product_id was provided, link it to this inventory item
        if (product_id) {
            await connection.query(
                "UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?",
                [inventoryId, product_id]
            );
        }

        // Auto-create product in Product Library if not already linked
        if (!product_id) {
            try {
                await autoCreateProductFromInventory(inventoryId, name, category, finalSku, sell_price);
            } catch (autoErr) {
                console.error('Auto-create product from inventory failed (non-blocking):', autoErr.message);
            }
        }

        // Add branch stock entry and movement log if quantity > 0
        if (branch_stocks && branch_stocks.length > 0) {
            for (const bs of branch_stocks) {
                if (bs.quantity > 0) {
                    await connection.query(
                        `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity) VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                        [inventoryId, bs.branch_id, bs.quantity, bs.quantity]
                    );
                    await logInventoryMovement(connection, inventoryId, bs.branch_id, 'Purchase', bs.quantity, 0, bs.quantity, 'inventory_add', null, null, req.user.id);
                }
            }
        } else if (initialQty > 0) {
            const branchId = req.body.branch_id || (await getUserBranchId(req.user.id));
            if (branchId) {
                await connection.query(
                    `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                    [inventoryId, branchId, initialQty, initialQty]
                );
                await logInventoryMovement(connection, inventoryId, branchId, 'Purchase', initialQty, 0, initialQty, 'inventory_add', null, null, req.user.id);
            }
        }

        await connection.commit();
        auditLog(req.user.id, 'INVENTORY_ADD', `Added new item ${name} (${finalSku || 'no-sku'})`);
        res.status(201).json({ id: inventoryId, sku: finalSku, message: 'Inventory item added' });
    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Update Inventory Item
router.put('/inventory/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), validate(addInventorySchema), async (req, res) => {
    const { id } = req.params;
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, product_id, source_code, model_name, size_code, item_type, vendor_name, vendor_contact, purchase_link, branch_stocks } = req.body;
    const normalizedSku = normalizeSkuInput(sku);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. If branch_stocks is passed, compute total quantity
        let finalQuantity = Number(quantity) || 0;
        if (branch_stocks && branch_stocks.length > 0) {
            finalQuantity = branch_stocks.reduce((sum, bs) => sum + bs.quantity, 0);
        }

        // 2. Update sarga_inventory metadata and final quantity
        await connection.query(
            `UPDATE sarga_inventory
             SET name = ?, sku = ?, category = ?, unit = ?, quantity = ?, reorder_level = ?, cost_price = ?, sell_price = ?, hsn = ?, discount = ?, gst_rate = ?,
                 source_code = ?, model_name = ?, size_code = ?, item_type = ?, vendor_name = ?, vendor_contact = ?, purchase_link = ?
             WHERE id = ?`
            , [
                name,
                normalizedSku,
                category || null,
                unit || 'pcs',
                finalQuantity,
                Number(reorder_level) || 0,
                Number(cost_price) || 0,
                Number(sell_price) || 0,
                hsn || null,
                Number(discount) || 0,
                Number(gst_rate) || 0,
                source_code || null,
                model_name || null,
                size_code || null,
                item_type || 'Retail',
                vendor_name || null,
                vendor_contact || null,
                purchase_link || null,
                id
            ]
        );

        // 3. If branch_stocks is provided, update sarga_branch_stock
        if (branch_stocks && branch_stocks.length > 0) {
            for (const bs of branch_stocks) {
                const [bsBefore] = await connection.query(
                    'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
                    [id, bs.branch_id]
                );
                const qtyBefore = Number(bsBefore[0]?.quantity || 0);
                const qtyAfter = bs.quantity;

                if (qtyBefore !== qtyAfter) {
                    await connection.query(
                        `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity) 
                         VALUES (?, ?, ?) 
                         ON DUPLICATE KEY UPDATE quantity = ?`,
                        [id, bs.branch_id, qtyAfter, qtyAfter]
                    );
                    const qtyChange = qtyAfter - qtyBefore;
                    await logInventoryMovement(connection, id, bs.branch_id, 'Adjustment', qtyChange, qtyBefore, qtyAfter, 'inventory_edit', null, 'Stock adjusted during edit', req.user.id);
                }
            }
        }

        // 4. Management of product link
        if (product_id) {
            await connection.query(
                "UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?",
                [id, product_id]
            );
        }

        // Propagate updates to any linked products in sarga_products
        await connection.query(
            `UPDATE sarga_products
             SET name = ?, product_code = ?
             WHERE inventory_item_id = ?`,
            [name, normalizedSku, id]
        );

        await connection.commit();
        invalidateHierarchyCache();
        auditLog(req.user.id, 'INVENTORY_UPDATE', `Updated item ${id} (${name})`);
        res.json({ message: 'Inventory item updated' });
    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Consume Inventory Item — updates sarga_branch_stock and logs movement
router.post('/inventory/:id/consume', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'), async (req, res) => {
    const { id } = req.params;
    const { quantity_consumed, notes } = req.body;

    if (!quantity_consumed || Number(quantity_consumed) <= 0) {
        return res.status(400).json({ message: 'Invalid consume quantity' });
    }

    try {
        const [rows] = await pool.query('SELECT name, quantity FROM sarga_inventory WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ message: 'Inventory item not found' });

        const currentQty = Number(rows[0].quantity);
        const qtyToConsume = Number(quantity_consumed);

        if (qtyToConsume > currentQty) {
            return res.status(400).json({ message: `Insufficient stock. Available: ${currentQty}, Requested: ${qtyToConsume}` });
        }

        await pool.query('UPDATE sarga_inventory SET quantity = quantity - ? WHERE id = ?', [qtyToConsume, id]);

        await pool.query(
            'INSERT INTO sarga_inventory_consumption (inventory_item_id, quantity_consumed, consumed_by_user_id, notes) VALUES (?, ?, ?, ?)',
            [id, qtyToConsume, req.user.id, notes || null]
        );

        // Update branch stock and log movement
        const branchId = req.body.branch_id || (await getUserBranchId(req.user.id));
        if (branchId) {
            const [bsBefore] = await pool.query(
                'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
                [id, branchId]
            );
            const qtyBefore = Number(bsBefore[0]?.quantity || 0);
            await pool.query(
                'UPDATE sarga_branch_stock SET quantity = GREATEST(quantity - ?, 0) WHERE inventory_item_id = ? AND branch_id = ?',
                [qtyToConsume, id, branchId]
            );
            const qtyAfter = Math.max(0, qtyBefore - qtyToConsume);
            await logInventoryMovement(pool, id, branchId, 'Consumption', -qtyToConsume, qtyBefore, qtyAfter, 'consume', null, notes || null, req.user.id);
        }

        auditLog(req.user.id, 'INVENTORY_CONSUME', `Consumed ${qtyToConsume} of item ${id} (${rows[0].name})`);
        res.json({ message: 'Stock consumed successfully' });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Restock Inventory Item — updates sarga_branch_stock and logs movement
router.post('/inventory/:id/restock', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { id } = req.params;
    const { quantity_received, cost_price, notes: _notes } = req.body;

    if (!quantity_received || Number(quantity_received) <= 0) {
        return res.status(400).json({ message: 'Invalid restock quantity' });
    }

    try {
        const [lastReorderRows] = await pool.query(
            'SELECT created_at FROM sarga_inventory_reorders WHERE inventory_item_id = ? ORDER BY created_at DESC LIMIT 1',
            [id]
        );
        let daysSince = null;
        if (lastReorderRows.length > 0) {
            const lastDate = new Date(lastReorderRows[0].created_at);
            const now = new Date();
            const diffTime = Math.abs(now - lastDate);
            daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        }

        const [itemRows] = await pool.query('SELECT name, cost_price, quantity FROM sarga_inventory WHERE id = ?', [id]);
        if (!itemRows.length) return res.status(404).json({ message: 'Inventory item not found' });

        const item = itemRows[0];
        const received = Number(quantity_received);
        const newCost = cost_price ? Number(cost_price) : Number(item.cost_price);

        // Update main inventory stock
        await pool.query('UPDATE sarga_inventory SET quantity = quantity + ?, cost_price = ? WHERE id = ?', [received, newCost, id]);

        // Log the reorder
        await pool.query(
            'INSERT INTO sarga_inventory_reorders (inventory_item_id, quantity_received, cost_price, days_since_last_reorder) VALUES (?, ?, ?, ?)',
            [id, received, newCost, daysSince]
        );

        // Update branch stock and log movement
        const branchId = req.body.branch_id || (await getUserBranchId(req.user.id));
        if (branchId) {
            const [bsBefore] = await pool.query(
                'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
                [id, branchId]
            );
            const qtyBefore = Number(bsBefore[0]?.quantity || 0);
            await pool.query(
                `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                [id, branchId, received, received]
            );
            const qtyAfter = qtyBefore + received;
            await logInventoryMovement(pool, id, branchId, 'Purchase', received, qtyBefore, qtyAfter, 'restock', null, _notes || null, req.user.id);
        }

        auditLog(req.user.id, 'INVENTORY_RESTOCK', `Restocked ${received} of item ${id} (${item.name}). Days gap: ${daysSince}`);
        res.json({ message: 'Restocked successfully', days_since_last_reorder: daysSince });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});


// Generate Labels PDF
router.post('/inventory/generate-labels', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'), async (req, res) => {
    const { items } = req.body; // Array of { id, quantity_to_print }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'No items selected' });
    }

    try {
        // Fetch full data for selected items
        const itemIds = items.map(i => i.id);
        const [dbItems] = await pool.query("SELECT * FROM sarga_inventory WHERE id IN (?)", [itemIds]);

        // Map db items for easy lookup
        const itemMap = dbItems.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
        }, {});

        // Identify paper inventory items (explicit categories + paper cut mappings)
        const paperCategoryAliases = ['offset papers', 'laser papers', 'other papers', 'offset paper', 'laser paper', 'other paper'];
        const isPaperCategory = (cat) => {
            if (!cat) return false;
            const c = String(cat).toLowerCase().trim();
            if (c.includes('paper')) return true;
            for (const alias of paperCategoryAliases) {
                if (c.includes(alias)) return true;
            }
            return false;
        };

        try {
            const [paperParentRows] = await pool.query(
                'SELECT parent_inventory_item_id AS id FROM sarga_paper_cut_map WHERE parent_inventory_item_id IN (?)',
                [itemIds]
            );
            const paperParentSet = new Set((paperParentRows || []).map(r => Number(r.id)).filter(Boolean));

            const invalidPaperIds = dbItems
                .filter(it => isPaperCategory(it.category) || paperParentSet.has(Number(it.id)))
                .map(it => it.id);

            if (invalidPaperIds.length > 0) {
                return res.status(400).json({ message: 'Label printing is disabled for paper inventory items', invalid_item_ids: invalidPaperIds });
            }
        } catch (_e) {
            // If paper-mapping table doesn't exist or query fails, fall back to category-only detection
            const invalidPaperIds = dbItems
                .filter(it => isPaperCategory(it.category))
                .map(it => it.id);
            if (invalidPaperIds.length > 0) {
                return res.status(400).json({ message: 'Label printing is disabled for paper inventory items', invalid_item_ids: invalidPaperIds });
            }
        }

        // Prepare label data based on user requested quantities
        const labelData = [];
        for (const reqItem of items) {
            const dbItem = itemMap[reqItem.id];
            if (dbItem) {
                const qty = Math.min(Number(reqItem.quantity_to_print) || 1, 5000); // Cap at 5000 per item to prevent extreme memory overload
                if (Number(reqItem.quantity_to_print) > 5000) {
                    console.warn(`[LabelGen] quantity_to_print ${reqItem.quantity_to_print} capped to 5000 for item ${reqItem.id}`);
                }
                for (let i = 0; i < qty; i++) {
                    labelData.push(dbItem);
                }
            }
        }

        if (labelData.length === 0) {
            return res.status(400).json({ message: 'Invalid item selection' });
        }

        // PDF Generation Parameters (4x12 layout)
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const _pageWidth = 595.28; // A4 point width (approx 210mm)
        const _pageHeight = 841.89; // A4 point height (approx 297mm)

        // Converts mm to points (1mm = 2.83465 points)
        const mmToPt = (mm) => mm * 2.83465;

        const margin = mmToPt(5);
        const colGap = mmToPt(3);
        const rowGap = mmToPt(3);
        const labelWidth = mmToPt(48);
        const labelHeight = mmToPt(24);
        const cols = 4;
        const rows = Math.floor((_pageHeight - margin * 2 + rowGap) / (labelHeight + rowGap));
        const labelsPerPage = cols * rows;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=labels.pdf');
        doc.pipe(res);

        for (let i = 0; i < labelData.length; i++) {
            const item = labelData[i];
            const pageIndex = i % labelsPerPage;
            const col = pageIndex % cols;
            const row = Math.floor(pageIndex / cols);

            if (i > 0 && pageIndex === 0) {
                doc.addPage({ size: 'A4', margin: 0 });
            }

            const x = margin + col * (labelWidth + colGap);
            const y = margin + row * (labelHeight + rowGap);

            // Reset color state for each label
            doc.fillColor('#000000');

            // QR Code generation
            // MRP priority: stored → sell_price → formula (Cost + GST) * 2
            const costPrice = Number(item.cost_price) || 0;
            const sellPrice = Number(item.sell_price) || 0;
            const gstRate = Number(item.gst_rate) || 0;
            const gstAmount = (costPrice * gstRate) / 100;
            const calculatedMrp = (costPrice + gstAmount) * 2;
            const mrp = (item.mrp != null ? Number(item.mrp) : sellPrice) || calculatedMrp || 0;

            // QR encodes just the unique product SKU (or fallback ID) for direct scanning in billing
            const qrData = normalizeScannedCode(item.sku) || `ITEM-${item.id}`;

            const qrCodeBuffer = await QRCode.toBuffer(qrData, {
                margin: 2, // Slightly larger quiet zone improves decode reliability on printed labels
                errorCorrectionLevel: 'H', // High error correction helps Google Lens read it easily
                width: 256 // Higher source resolution helps with cleaner downscaling in PDF
            });

            // Layout Content — Category / Name / MRP + QR with 2mm internal padding
            const padding = mmToPt(2);
            const textAreaW = labelWidth - mmToPt(20);

            // Category name 
            const categoryLabel = (item.category || 'Inventory').toUpperCase();
            const catFontSize = categoryLabel.length > 18 ? 5.5 : 7;
            doc.fontSize(catFontSize).font('Helvetica-Bold').fillColor('#000000');
            doc.text(categoryLabel, x + padding, y + padding, { width: textAreaW, lineBreak: false });

            // Product model name (or name if model missing)
            const modelNameText = (item.model_name || item.name).toUpperCase();
            const shortName = modelNameText.length > 50 ? modelNameText.substring(0, 49) + '…' : modelNameText;
            doc.fontSize(6).font('Helvetica').fillColor('#000000');
            doc.text(shortName, x + padding, y + mmToPt(6), { width: textAreaW, lineBreak: true, height: mmToPt(4) });

            // MRP
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000000');
            doc.text(`MRP: Rs. ${mrp % 1 === 0 ? mrp.toFixed(0) : mrp.toFixed(2)}`, x + padding, y + mmToPt(11), { width: textAreaW, lineBreak: false });

            // Place QR Code (right side)
            doc.image(qrCodeBuffer, x + labelWidth - mmToPt(18), y + padding, {
                width: mmToPt(16)
            });

            // Unique code text below QR
            const uniqueCode = qrData;
            doc.fontSize(5).font('Helvetica').fillColor('#000000');
            doc.text(uniqueCode, x + labelWidth - mmToPt(18), y + mmToPt(18), { width: mmToPt(16), align: 'center', lineBreak: false });

            // "Sarga, Mob: 9497559257" directly below MRP
            doc.fontSize(4).font('Helvetica').fillColor('#000000');
            doc.text("Sarga,", x + padding, y + mmToPt(14.5), { width: textAreaW, lineBreak: false });
            doc.text("Mob: 9497559257", x + padding, y + mmToPt(16.5), { width: textAreaW, lineBreak: false });
        }

        doc.end();

    } catch (err) {
        console.error('Label gen error:', err);
        res.status(500).json({ message: 'Error generating PDF' });
    }
});

// Clear All Inventory (Admin Only)
router.delete('/inventory/all', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [countRows] = await connection.query('SELECT COUNT(*) as total FROM sarga_inventory WHERE is_deleted = 0');
        const total = countRows[0].total;

        if (total === 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'Inventory is already empty.' });
        }

        // Soft-delete all active inventory items (rename SKU to allow reuse and avoid collision by appending unique id)
        await connection.query("UPDATE sarga_inventory SET sku = CONCAT(sku, '_deleted_', UNIX_TIMESTAMP(), '_', id), is_deleted = 1 WHERE is_deleted = 0");

        // Clear operational/current-state data
        await connection.query('DELETE FROM sarga_branch_stock');
        await connection.query('DELETE FROM sarga_stock_requests');

        // Soft-delete linked products that have sync_enabled
        await connection.query(
            'UPDATE sarga_products SET is_deleted = 1 WHERE inventory_item_id IS NOT NULL AND is_deleted = 0 AND sync_enabled = 1'
        );

        await connection.commit();
        auditLog(req.user.id, 'INVENTORY_CLEAR_ALL', `Soft-deleted all inventory (${total} items)`);
        res.json({ message: `Inventory cleared successfully (${total} items).` });
    } catch (err) {
        await connection.rollback();
        console.error('Bulk inventory delete error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Delete Inventory Item
router.delete('/inventory/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await pool.query('SELECT id, name, quantity FROM sarga_inventory WHERE id = ? AND is_deleted = 0', [id]);
        if (!rows.length) return res.status(404).json({ message: 'Inventory item not found' });

        // Find linked products that have sync_enabled
        const [linkedProducts] = await pool.query('SELECT id, name, sync_enabled FROM sarga_products WHERE inventory_item_id = ? AND is_deleted = 0', [id]);

        // Soft-delete the inventory item (keep historical references intact, rename SKU to allow reuse)
        await pool.query("UPDATE sarga_inventory SET sku = CONCAT(sku, '_deleted_', UNIX_TIMESTAMP()), is_deleted = 1 WHERE id = ?", [id]);

        // Clear operational/current-state data (not historical data)
        await pool.query('DELETE FROM sarga_branch_stock WHERE inventory_item_id = ?', [id]);
        await pool.query('DELETE FROM sarga_stock_requests WHERE inventory_item_id = ?', [id]);

        // Soft-delete linked products that have sync_enabled = TRUE (linked mode)
        const syncLinkedProducts = linkedProducts.filter(p => p.sync_enabled);
        if (syncLinkedProducts.length > 0) {
            const syncIds = syncLinkedProducts.map(p => p.id);
            await pool.query('DELETE FROM sarga_product_update_requests WHERE product_id IN (?)', [syncIds]);
            await pool.query('UPDATE sarga_products SET is_deleted = 1 WHERE id IN (?)', [syncIds]);
            const names = syncLinkedProducts.map(p => p.name).join(', ');
            auditLog(req.user.id, 'PRODUCTS_SOFT_DELETED', `Soft-deleted ${syncLinkedProducts.length} linked product(s) after inventory #${id} (${rows[0].name}) was deleted: ${names}`);
        }

        auditLog(req.user.id, 'INVENTORY_SOFT_DELETE', `Soft-deleted item #${id} (${rows[0].name}), had qty=${rows[0].quantity}`);

        // Notify connected clients in real-time
        try {
            const { emitProductEvent } = require('../services/socketManager');
            emitProductEvent('productDeleted', { inventoryId: id, linkedProductIds: syncLinkedProducts.map(p => p.id) });
        } catch (_) { /* socket not available */ }

        res.json({ message: 'Inventory item deleted' });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Instant Stock Transfer (Branch to Branch)
router.post('/inventory/transfer', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { inventory_item_id, from_branch_id, to_branch_id, quantity, notes } = req.body;

    if (!inventory_item_id || !from_branch_id || !to_branch_id || !quantity) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ message: 'Invalid quantity' });
    }

    if (String(from_branch_id) === String(to_branch_id)) {
        return res.status(400).json({ message: 'Source and destination branches must be different' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // 1. Check source stock
        const [sourceStock] = await connection.query(
            'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ? FOR UPDATE',
            [inventory_item_id, from_branch_id]
        );

        const available = sourceStock.length ? Number(sourceStock[0].quantity) : 0;
        if (available < qty) {
            await connection.rollback();
            return res.status(400).json({ message: `Insufficient stock at source branch. Available: ${available}` });
        }

        // 2. Deduct from source
        await connection.query(
            'UPDATE sarga_branch_stock SET quantity = quantity - ? WHERE inventory_item_id = ? AND branch_id = ?',
            [qty, inventory_item_id, from_branch_id]
        );

        // 2b. Log source branch movement (Transfer Out)
        const [srcBefore] = await connection.query(
            'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
            [inventory_item_id, from_branch_id]
        );
        const srcQtyBefore = Number(srcBefore[0]?.quantity || 0) + qty;
        await logInventoryMovement(connection, inventory_item_id, from_branch_id, 'Transfer Out', -qty, srcQtyBefore, srcQtyBefore - qty, 'transfer', null, notes || null, req.user.id);

        // 3. Add to destination
        await connection.query(
            `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity) 
             VALUES (?, ?, ?) 
             ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
            [inventory_item_id, to_branch_id, qty, qty]
        );

        // 3b. Log destination branch movement (Transfer In)
        const [dstBefore] = await connection.query(
            'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
            [inventory_item_id, to_branch_id]
        );
        const dstQtyBefore = Number(dstBefore[0]?.quantity || 0);
        await logInventoryMovement(connection, inventory_item_id, to_branch_id, 'Transfer In', qty, dstQtyBefore, dstQtyBefore + qty, 'transfer', null, notes || null, req.user.id);

        // 4. Log transfer (inserting into sarga_stock_requests as a 'Completed' transfer for unified reporting)
        await connection.query(
            `INSERT INTO sarga_stock_requests (inventory_item_id, from_branch_id, to_branch_id, quantity, status, notes, created_by, resolved_by, resolved_at, sent_by, sent_at, received_by, received_at)
             VALUES (?, ?, ?, ?, 'Received', ?, ?, ?, NOW(), ?, NOW(), ?, NOW())`,
            [inventory_item_id, to_branch_id, from_branch_id, qty, notes || 'Instant Transfer', req.user.id, req.user.id, req.user.id, req.user.id]
        );

        await connection.commit();
        
        const [item] = await pool.query('SELECT name FROM sarga_inventory WHERE id = ?', [inventory_item_id]);
        auditLog(req.user.id, 'STOCK_TRANSFER_INSTANT', `Instant transfer of ${qty}x ${item[0]?.name || '#' + inventory_item_id} from branch #${from_branch_id} to branch #${to_branch_id}`);
        
        res.json({ success: true, message: 'Stock transferred successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Stock transfer error:', err);
        res.status(500).json({ message: 'Internal server error during transfer' });
    } finally {
        connection.release();
    }
});

// --- Image Management Routes ---

router.get('/inventory/settings/image', authenticateToken, async (req, res) => {
    try {
        const settings = await getInventoryImageSettings();
        res.json(settings);
    } catch (_err) {
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
});

router.put('/inventory/settings/image', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const { auto_assign_images, cache_images, generate_missing, category_placeholders, ask_before_saving, image_quality } = req.body;
        await pool.query(
            `UPDATE sarga_inventory_settings 
             SET auto_assign_images = ?, cache_images = ?, generate_missing = ?, category_placeholders = ?, ask_before_saving = ?, image_quality = ?
             WHERE id = 1`,
            [auto_assign_images ? 1 : 0, cache_images ? 1 : 0, generate_missing ? 1 : 0, category_placeholders ? 1 : 0, ask_before_saving ? 1 : 0, image_quality || 'Medium']
        );
        res.json({ message: 'Settings updated' });
    } catch (_err) {
        res.status(500).json({ message: 'Failed to update settings' });
    }
});

router.post('/inventory/:id/image', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
    try {
        const id = req.params.id;
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        // For this demo, we save locally or use cloudinary. If cloudinary is setup, we'd upload there. 
        // We'll simulate a local upload by keeping the file in /uploads and returning a local path.
        const ext = path.extname(req.file.originalname) || '.jpg';
        const filename = `inv_${id}_${Date.now()}${ext}`;
        const targetPath = path.join(__dirname, '../uploads', filename);
        
        // Ensure uploads directory exists
        if (!fs.existsSync(path.join(__dirname, '../uploads'))) {
            fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });
        }
        
        fs.renameSync(req.file.path, targetPath);
        const imageUrl = `/uploads/${filename}`;

        await pool.query(
            `INSERT INTO sarga_product_images (inventory_item_id, image_url, source, confidence, is_locked)
             VALUES (?, ?, 'Uploaded', 100, 1)
             ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), source = VALUES(source), confidence = VALUES(confidence), is_locked = VALUES(is_locked)`,
            [id, imageUrl]
        );

        res.json({ message: 'Image uploaded successfully', image_url: imageUrl, source: 'Uploaded' });
    } catch (err) {
        console.error('Image upload error:', err);
        res.status(500).json({ message: 'Failed to upload image' });
    }
});

router.delete('/inventory/:id/image', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query('DELETE FROM sarga_product_images WHERE inventory_item_id = ?', [id]);
        res.json({ message: 'Image removed successfully' });
    } catch (_err) {
        res.status(500).json({ message: 'Failed to remove image' });
    }
});

router.post('/inventory/:id/regenerate-image', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const id = req.params.id;
        
        // Fetch inventory details
        const [rows] = await pool.query(
            `SELECT i.*, ps.name as product_subcategory_name 
             FROM sarga_inventory i 
             LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
             LEFT JOIN sarga_product_subcategories ps ON p.subcategory_id = ps.id
             WHERE i.id = ? LIMIT 1`, [id]
        );
        
        if (!rows.length) return res.status(404).json({ message: 'Item not found' });
        
        const item = rows[0];
        const { findImageMatch } = require('../services/imageService');
        
        const match = await findImageMatch(item.name, item.product_subcategory_name, item.category);
        
        if (match && match.url) {
            await pool.query(
                `INSERT INTO sarga_product_images (inventory_item_id, image_url, source, confidence, is_locked)
                 VALUES (?, ?, 'Generated', ?, 0)
                 ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), source = VALUES(source), confidence = VALUES(confidence), is_locked = 0`,
                [id, match.url, match.confidence]
            );
            return res.json({ message: 'Image regenerated', image_url: match.url, source: 'Generated' });
        }
        
        res.status(404).json({ message: 'No match found' });
    } catch (_err) {
        res.status(500).json({ message: 'Regeneration failed' });
    }
});

router.post('/inventory/bulk-generate-images', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    // In a real system, queue this. For now, we process asynchronously in background.
    try {
        const { force: _force } = req.body;
        
        const [items] = await pool.query(
            `SELECT i.id, i.name, i.category, ps.name as product_subcategory_name 
             FROM sarga_inventory i
             LEFT JOIN sarga_product_images spi ON i.id = spi.inventory_item_id
             LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
             LEFT JOIN sarga_product_subcategories ps ON p.subcategory_id = ps.id
             WHERE spi.id IS NULL OR spi.source = 'Default'`
        );
        
        res.json({ message: `Queued ${items.length} items for image generation`, queued_count: items.length });
        
        // Async processing (simulate background job)
        const { findImageMatch } = require('../services/imageService');
        
        setTimeout(async () => {
            console.log(`Starting bulk generation for ${items.length} items...`);
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                try {
                    const match = await findImageMatch(item.name, item.product_subcategory_name, item.category);
                    if (match && match.url && match.confidence >= 70) {
                        await pool.query(
                            `INSERT INTO sarga_product_images (inventory_item_id, image_url, source, confidence, is_locked)
                             VALUES (?, ?, 'Generated', ?, 0)
                             ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), source = VALUES(source), confidence = VALUES(confidence)`,
                            [item.id, match.url, match.confidence]
                        );
                    }
                } catch(e) {
                    console.error('Bulk generation error for item', item.id, e.message);
                }
            }
            console.log('Bulk generation complete');
        }, 1000);
        
    } catch (_err) {
        res.status(500).json({ message: 'Failed to start bulk generation' });
    }
});

module.exports = router;

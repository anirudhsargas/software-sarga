const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog, asyncHandler } = require('../helpers');
const { invalidateHierarchyCache } = require('./jobs');
const { paginate } = require('../helpers/pagination');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../helpers/cloudinaryUpload');

module.exports = (upload, removeUploadFile) => {
    const router = require('express').Router();


    // Auto-create an inventory entry when a product is added to the Product Library
    async function autoCreateInventoryFromProduct(productId, productName, productCode, subcategoryId, slabs, companyName, companyCode, size, extraInv = {}, userId = null) {
        // Check if already linked + get subcategory name in one query
        const [[prodRow]] = await pool.query(
            `SELECT p.inventory_item_id, s.name AS sub_name
             FROM sarga_products p
             LEFT JOIN sarga_product_subcategories s ON p.subcategory_id = s.id
             WHERE p.id = ?`,
            [productId]
        );
        if (!prodRow || prodRow.inventory_item_id) return;

        const inventoryCategory = prodRow.sub_name || null;

        // Extract cost and sell price from first slab and extraInv
        let slabSellPrice = 0;
        if (slabs && slabs.length > 0) {
            slabSellPrice = Number(slabs[0].unit_rate) || Number(slabs[0].base_value) || 0;
        }

        const isSet = (v) => v != null && v !== '';
        const parsedCostPrice = isSet(extraInv.cost_price) ? Number(extraInv.cost_price) : 0;
        const parsedSellPrice = slabSellPrice;

        // Use product_code as SKU if unique, otherwise append productId
        let sku = productCode || null;
        if (sku) {
            const [dup] = await pool.query('SELECT id FROM sarga_inventory WHERE sku = ?', [sku]);
            if (dup.length > 0) sku = `${sku}-${productId}`;
        }
        if (!sku) {
            const c = String(companyCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const p = String(productName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const s = String(size || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const parts = [c, p, s].filter(Boolean);
            if (parts.length > 0) sku = `${parts.join('-')}-${productId}`;
        }

        const sourceCode = String(companyCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
        const sizeCode = String(size || '').trim().toUpperCase() || null;

        const [invResult] = await pool.query(
            `INSERT INTO sarga_inventory (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, item_type, source_code, model_name, size_code, hsn, gst_rate, vendor_name)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Retail', ?, ?, ?, ?, ?, ?)`,
            [
                productName, sku, inventoryCategory, 
                extraInv.unit || 'pcs', 
                Number(extraInv.quantity) || 0, 
                parsedCostPrice, 
                parsedSellPrice, 
                sourceCode, productName, sizeCode,
                extraInv.hsn || null,
                Number(extraInv.gst_rate) || 0,
                extraInv.vendor_name || companyName || null
            ]
        );
        const inventoryId = invResult.insertId;

        // Auto-generate fallback SKU using the new inventory ID if still none
        if (!sku) {
            const catPart = (inventoryCategory || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'INV';
            const autoSku = `${catPart}-${String(inventoryId).padStart(4, '0')}`;
            await pool.query('UPDATE sarga_inventory SET sku = ? WHERE id = ? AND sku IS NULL', [autoSku, inventoryId]);
        }

        // Link product to the new inventory item
        await pool.query(
            'UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?',
            [inventoryId, productId]
        );

        // Create branch stock entry if initial quantity > 0
        const initQty = Number(extraInv.quantity) || 0;
        if (initQty > 0 && userId) {
            try {
                const { getUserBranchId } = require('../helpers');
                const branchId = await getUserBranchId(userId);
                if (branchId) {
                    await pool.query(
                        `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                        [inventoryId, branchId, initQty, initQty]
                    );
                    await pool.query(
                        `INSERT INTO sarga_inventory_movement_log
                         (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                         VALUES (?, ?, 'Purchase', ?, 0, ?, 'product_create', ?, ?, ?)`,
                        [inventoryId, branchId, initQty, initQty, productId, 'Auto-created from product', userId]
                    );
                }
            } catch (branchErr) {
                console.warn('[AutoInventory] Failed to create branch stock (non-blocking):', branchErr.message);
            }
        }

        console.log(`[AutoInventory] Created fresh inventory #${inventoryId} for product #${productId} (${productName})`);
    }

    // Sync an existing linked inventory item from the updated product library data
    async function syncInventoryFromProduct(connection, productId, productName, productCode, subcategoryId, slabs, companyName, companyCode, size, extraInv = {}) {
        // Find if this product is linked to an inventory item + get subcategory name in one query
        const [[prodRow]] = await connection.query(
            `SELECT p.inventory_item_id, s.name AS sub_name
             FROM sarga_products p
             LEFT JOIN sarga_product_subcategories s ON p.subcategory_id = s.id
             WHERE p.id = ?`,
            [productId]
        );
        if (!prodRow) return;
        const inventoryId = prodRow.inventory_item_id;
        if (!inventoryId) return;

        const inventoryCategory = prodRow.sub_name || null;

        // Extract cost and sell price from first slab and extraInv
        let slabSellPrice = 0;
        if (slabs && slabs.length > 0) {
            slabSellPrice = Number(slabs[0].unit_rate) || Number(slabs[0].base_value) || 0;
        }

        const isSet = (v) => v != null && v !== '';
        const parsedCostPrice = isSet(extraInv.cost_price) ? Number(extraInv.cost_price) : 0;
        const parsedSellPrice = slabSellPrice;

        // Use product_code as SKU with unique suffix, or auto-generate
        let sku = productCode || null;
        if (sku) {
            const [dup] = await connection.query('SELECT id FROM sarga_inventory WHERE sku = ? AND id != ?', [sku, inventoryId]);
            if (dup.length > 0) sku = `${sku}-${productId}`;
        }
        if (!sku) {
            const c = String(companyCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const p = String(productName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const s = String(size || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const parts = [c, p, s].filter(Boolean);
            if (parts.length > 0) sku = `${parts.join('-')}-${productId}`;
        }
        if (!sku) {
            const catPart = (inventoryCategory || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'INV';
            sku = `${catPart}-${String(inventoryId).padStart(4, '0')}`;
        }

        const sourceCode = String(companyCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
        const sizeCode = String(size || '').trim().toUpperCase() || null;

        // Update the inventory item
        await connection.query(
            `UPDATE sarga_inventory 
             SET name = ?, sku = ?, category = ?, unit = ?, cost_price = ?, sell_price = ?, source_code = ?, model_name = ?, size_code = ?, hsn = ?, gst_rate = ?, vendor_name = ?
             WHERE id = ?`,
            [
                productName, sku, inventoryCategory,
                extraInv.unit || 'pcs',
                parsedCostPrice,
                parsedSellPrice,
                sourceCode, productName, sizeCode,
                extraInv.hsn || null,
                Number(extraInv.gst_rate) || 0,
                extraInv.vendor_name || companyName || null,
                inventoryId
            ]
        );
        console.log(`[SyncInventory] Synced inventory #${inventoryId} for product #${productId} (${productName})`);
    }

    // --- PRODUCT HIERARCHY & PRICING ROUTES ---

    // List Categories
    router.get('/product-categories', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT * FROM sarga_product_categories ORDER BY name ASC");
            res.json(rows);
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Get Single Category
    router.get('/product-categories/:id', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT * FROM sarga_product_categories WHERE id = ?", [req.params.id]);
            if (!rows[0]) return res.status(404).json({ message: 'Category not found' });
            res.json(rows[0]);
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List All Products (paginated for sync/search)
    router.get('/products', authenticateToken, async (req, res) => {
        try {
            const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);
            const search = req.query.search ? `%${req.query.search}%` : null;

            const buildQuery = (isDeletedFilter) => {
                let where = isDeletedFilter
                    ? 'WHERE p.is_active = 1 AND p.is_deleted = 0 AND (p.inventory_item_id IS NULL OR i.is_deleted = 0)'
                    : 'WHERE p.is_active = 1 AND (p.inventory_item_id IS NULL OR i.is_deleted = 0)';
                const params = [];
                if (search) {
                    where += ' AND (p.name LIKE ? OR p.product_code LIKE ?)';
                    params.push(search, search);
                }
                return { where, params };
            };

            let { where, params } = buildQuery(true);
            const tryQuery = async (w, p) => {
                const baseFrom = `
                    FROM sarga_products p
                    LEFT JOIN sarga_product_subcategories s ON p.subcategory_id = s.id
                    LEFT JOIN sarga_product_categories c ON s.category_id = c.id
                    LEFT JOIN sarga_inventory i ON p.inventory_item_id = i.id
                    ${w}`;
                const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, p);
                const [rows] = await pool.query(`
                    SELECT p.*, s.name AS subcategory_name, c.name AS category_name
                    ${baseFrom}
                    ORDER BY p.name ASC
                    LIMIT ? OFFSET ?
                `, [...p, limit, offset]);
                return { rows, total };
            };

            try {
                const result = await tryQuery(where, params);
                return res.json(response(result.rows, result.total));
            } catch (_) {
                // Fallback if is_deleted column doesn't exist yet (migration pending)
                const fallback = buildQuery(false);
                const result = await tryQuery(fallback.where, fallback.params);
                return res.json(response(result.rows, result.total));
            }
        } catch (err) {
            console.error('Get products error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Get all products for catalogue generation with comprehensive filters
    router.get('/products/catalogue', authenticateToken, async (req, res) => {
        try {
            const {
                category_id, subcategory_id, brand, vendor,
                active_only, search, product_code,
                price_min, price_max, ids
            } = req.query;

            let where = 'WHERE p.is_deleted = 0';
            const params = [];

            if (active_only !== 'false') {
                where += ' AND p.is_active = 1';
            }

            if (category_id) {
                where += ' AND c.id = ?';
                params.push(category_id);
            }

            if (subcategory_id) {
                where += ' AND p.subcategory_id = ?';
                params.push(subcategory_id);
            }

            if (brand) {
                where += ' AND p.company_name = ?';
                params.push(brand);
            }

            if (search) {
                where += ' AND (p.name LIKE ? OR p.product_code LIKE ?)';
                const s = `%${search}%`;
                params.push(s, s);
            }

            if (product_code) {
                where += ' AND p.product_code LIKE ?';
                params.push(`%${product_code}%`);
            }

            if (ids) {
                const idArr = ids.split(',').map(Number).filter(Boolean);
                if (idArr.length > 0) {
                    where += ` AND p.id IN (${idArr.map(() => '?').join(',')})`;
                    params.push(...idArr);
                }
            }

            if (price_min || price_max) {
                const [slabRows] = await pool.query(
                    `SELECT product_id, MIN(unit_rate) as min_rate FROM sarga_product_slabs GROUP BY product_id`
                );
                const validIds = slabRows
                    .filter(s => {
                        if (price_min && s.min_rate < Number(price_min)) return false;
                        if (price_max && s.min_rate > Number(price_max)) return false;
                        return true;
                    })
                    .map(s => s.product_id);
                if (validIds.length === 0) return res.json([]);
                where += ` AND p.id IN (${validIds.map(() => '?').join(',')})`;
                params.push(...validIds);
            }

            const [rows] = await pool.query(`
                SELECT p.*,
                       s.name AS subcategory_name,
                       c.name AS category_name,
                       c.id AS category_id,
                       i.quantity AS stock_quantity,
                       i.unit AS stock_unit
                FROM sarga_products p
                LEFT JOIN sarga_product_subcategories s ON p.subcategory_id = s.id
                LEFT JOIN sarga_product_categories c ON s.category_id = c.id
                LEFT JOIN sarga_inventory i ON p.inventory_item_id = i.id
                ${where}
                ORDER BY c.name ASC, s.name ASC, p.name ASC
            `, params);

            // Attach pricing slabs for each product
            if (rows.length > 0) {
                const productIds = rows.map(r => r.id);
                const [slabs] = await pool.query(
                    `SELECT * FROM sarga_product_slabs WHERE product_id IN (${productIds.map(() => '?').join(',')}) ORDER BY product_id, min_qty ASC`,
                    productIds
                );
                const slabsByProduct = {};
                slabs.forEach(s => {
                    if (!slabsByProduct[s.product_id]) slabsByProduct[s.product_id] = [];
                    slabsByProduct[s.product_id].push(s);
                });
                rows.forEach(p => {
                    p.slabs = slabsByProduct[p.id] || [];
                });
            }

            res.json(rows);
        } catch (err) {
            console.error('Get catalogue products error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Generate a unique company code (3-5 letters) that doesn't collide with existing ones
    router.get('/unique-company-code', authenticateToken, asyncHandler(async (req, res) => {
        const rawName = (req.query.name || '').trim();
        if (!rawName) return res.json({ code: '' });

        const name = rawName.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!name) return res.json({ code: '' });

        try {
            const [rows] = await pool.query(`SELECT DISTINCT source_code FROM sarga_inventory WHERE source_code IS NOT NULL AND source_code != ''`);
            const usedCodes = new Set(rows.map(r => r.source_code.toUpperCase()));

            // Strategy 1: first 3 letters
            const base3 = name.substring(0, 3);
            if (base3.length >= 2 && !usedCodes.has(base3)) return res.json({ code: base3 });

            // Strategy 2: try combinations — 1st+2nd+Nth letter
            for (let i = 3; i < name.length; i++) {
                const candidate = name[0] + name[1] + name[i];
                if (!usedCodes.has(candidate)) return res.json({ code: candidate });
            }

            // Strategy 3: try 1st+Nth+last
            for (let i = 2; i < name.length - 1; i++) {
                const candidate = name[0] + name[i] + name[name.length - 1];
                if (!usedCodes.has(candidate)) return res.json({ code: candidate });
            }

            // Strategy 4: base 2 letters + digit
            for (let d = 1; d <= 9; d++) {
                const candidate = name.substring(0, 2) + d;
                if (!usedCodes.has(candidate)) return res.json({ code: candidate });
            }

            // Strategy 5: first letter + 2 digits
            for (let d = 10; d <= 99; d++) {
                const candidate = name[0] + d;
                if (!usedCodes.has(candidate)) return res.json({ code: candidate });
            }

            return res.json({ code: base3 });
        } catch (err) {
            console.error('[unique-company-code] Error:', err.message);
            const words = rawName.split(/\s+/).filter(Boolean);
            const fallback = words.map(w => w[0].toUpperCase()).join('').slice(0, 3);
            return res.json({ code: fallback });
        }
    }));

    // Add Category
    router.post('/product-categories', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
        const { name } = req.body;
        let imageUrl = null;
        if (req.file) {
            try {
                const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'product-categories');
                imageUrl = cloudinaryResult.secure_url;
            } catch (err) {
                console.error('Upload category image error:', err);
                return res.status(500).json({ message: 'Failed to upload image' });
            }
        }
        if (!name || !String(name).trim()) {
            return res.status(400).json({ message: 'Category name is required' });
        }
        try {
            const [rows] = await pool.query("SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_product_categories");
            const nextPos = rows[0]?.nextPos || 1;
            await pool.query(
                "INSERT INTO sarga_product_categories (name, position, image_url) VALUES (?, ?, ?)",
                [String(name).trim(), nextPos, imageUrl]
            );
            invalidateHierarchyCache();
            auditLog(req.user.id, 'CATEGORY_ADD', `Added product category: ${name}`, { entity_type: 'product_category' });
            res.status(201).json({ message: 'Category added' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ message: 'Category already exists' });
            }
            console.error('Add category error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update Category
    router.put('/product-categories/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
        const { name, image_url: existingImageUrl } = req.body;
        const { id } = req.params;
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
        try {
            let imageUrl;
            if (req.file) {
                const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'product-categories');
                imageUrl = cloudinaryResult.secure_url;
                const [old] = await pool.query("SELECT image_url FROM sarga_product_categories WHERE id = ?", [id]);
                if (old[0]?.image_url && old[0].image_url.includes('cloudinary.com')) {
                    const publicId = old[0].image_url.split('/').slice(-1)[0].split('.')[0];
                    await deleteFromCloudinary(`product-categories/${publicId}`).catch(() => {});
                } else if (old[0]?.image_url) {
                    await removeUploadFile(old[0].image_url).catch(() => {});
                }
            } else {
                imageUrl = existingImageUrl !== undefined ? (existingImageUrl || null) : undefined;
            }
            if (imageUrl !== undefined) {
                await pool.query("UPDATE sarga_product_categories SET name = ?, image_url = ? WHERE id = ?", [String(name).trim(), imageUrl, id]);
            } else {
                await pool.query("UPDATE sarga_product_categories SET name = ? WHERE id = ?", [String(name).trim(), id]);
            }
            invalidateHierarchyCache();
            auditLog(req.user.id, 'CATEGORY_UPDATE', `Updated category #${id}: ${name}`, { entity_type: 'product_category', entity_id: id });
            res.json({ message: 'Category updated' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Name already exists' });
            console.error('Update category error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Delete Category
    router.delete('/product-categories/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            // Check if category has subcategories with products
            const [subRows] = await pool.query(
                `SELECT COUNT(*) AS cnt FROM sarga_product_subcategories WHERE category_id = ?`, [req.params.id]
            );
            if (subRows[0]?.cnt > 0) {
                const [prodRows] = await pool.query(
                    `SELECT COUNT(*) AS cnt FROM sarga_products p JOIN sarga_product_subcategories s ON p.subcategory_id = s.id WHERE s.category_id = ?`,
                    [req.params.id]
                );
                if (prodRows[0]?.cnt > 0) {
                    return res.status(400).json({ message: 'This category contains products. Move or delete products first.' });
                }
                return res.status(400).json({ message: 'This category contains subcategories. Delete them first.' });
            }
            const [rows] = await pool.query("SELECT image_url FROM sarga_product_categories WHERE id = ?", [req.params.id]);
            if (rows[0]?.image_url) await removeUploadFile(rows[0].image_url).catch(() => {});
            await pool.query("DELETE FROM sarga_product_categories WHERE id = ?", [req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, 'CATEGORY_DELETE', `Deleted product category #${req.params.id}`, { entity_type: 'product_category', entity_id: req.params.id });
            res.json({ message: 'Category deleted' });
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Toggle Category Active/Inactive
    router.patch('/product-categories/:id/toggle-active', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT is_active FROM sarga_product_categories WHERE id = ?", [req.params.id]);
            if (!rows[0]) return res.status(404).json({ message: 'Category not found' });
            const newState = rows[0].is_active ? 0 : 1;
            await pool.query("UPDATE sarga_product_categories SET is_active = ? WHERE id = ?", [newState, req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, newState ? 'CATEGORY_ENABLE' : 'CATEGORY_DISABLE', `${newState ? 'Enabled' : 'Disabled'} category #${req.params.id}`, { entity_type: 'product_category', entity_id: req.params.id });
            res.json({ message: newState ? 'Category enabled' : 'Category disabled', is_active: newState });
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List Subcategories for a Category
    router.get('/product-categories/:id/subcategories', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT * FROM sarga_product_subcategories WHERE category_id = ? ORDER BY name ASC", [req.params.id]);
            res.json(rows);
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Add Subcategory
    router.post('/product-subcategories', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
        const { category_id, name } = req.body;
        let imageUrl = null;
        if (req.file) {
            try {
                const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'product-subcategories');
                imageUrl = cloudinaryResult.secure_url;
            } catch (err) {
                console.error('Upload subcategory image error:', err);
                return res.status(500).json({ message: 'Failed to upload image' });
            }
        }
        if (!category_id) {
            return res.status(400).json({ message: 'Category is required' });
        }
        if (!name || !String(name).trim()) {
            return res.status(400).json({ message: 'Subcategory name is required' });
        }
        try {
            const [rows] = await pool.query(
                "SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_product_subcategories WHERE category_id = ?",
                [category_id]
            );
            const nextPos = rows[0]?.nextPos || 1;
            await pool.query(
                "INSERT INTO sarga_product_subcategories (category_id, name, position, image_url) VALUES (?, ?, ?, ?)",
                [category_id, String(name).trim(), nextPos, imageUrl]
            );
            invalidateHierarchyCache();
            auditLog(req.user.id, 'SUBCATEGORY_ADD', `Added subcategory: ${name}`, { entity_type: 'product_subcategory' });
            res.status(201).json({ message: 'Subcategory added' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ message: 'Subcategory already exists' });
            }
            console.error('Add subcategory error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update Subcategory
    router.put('/product-subcategories/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
        // Handle virtual subcategories (inv-sub-{id} format) - these don't exist in database
        if (typeof req.params.id === 'string' && req.params.id.startsWith('inv-sub-')) {
            return res.status(400).json({ message: 'Virtual subcategories cannot be edited. Edit individual inventory items instead.' });
        }

        const { name, category_id, image_url: existingImageUrl } = req.body;
        const { id } = req.params;
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
        try {
            let imageUrl;
            if (req.file) {
                const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'product-subcategories');
                imageUrl = cloudinaryResult.secure_url;
                const [old] = await pool.query("SELECT image_url FROM sarga_product_subcategories WHERE id = ?", [id]);
                if (old[0]?.image_url && old[0].image_url.includes('cloudinary.com')) {
                    const publicId = old[0].image_url.split('/').slice(-1)[0].split('.')[0];
                    await deleteFromCloudinary(`product-subcategories/${publicId}`).catch(() => {});
                } else if (old[0]?.image_url) {
                    await removeUploadFile(old[0].image_url).catch(() => {});
                }
            } else {
                imageUrl = existingImageUrl !== undefined ? (existingImageUrl || null) : undefined;
            }
            if (imageUrl !== undefined) {
                await pool.query("UPDATE sarga_product_subcategories SET name = ?, category_id = ?, image_url = ? WHERE id = ?", [String(name).trim(), category_id, imageUrl, id]);
            } else {
                await pool.query("UPDATE sarga_product_subcategories SET name = ?, category_id = ? WHERE id = ?", [String(name).trim(), category_id, id]);
            }
            invalidateHierarchyCache();
            auditLog(req.user.id, 'SUBCATEGORY_UPDATE', `Updated subcategory #${id}: ${name}`, { entity_type: 'product_subcategory', entity_id: id });
            res.json({ message: 'Subcategory updated' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Subcategory already exists' });
            console.error('Update subcategory error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Delete Subcategory
    router.delete('/product-subcategories/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        // Handle virtual subcategories (inv-sub-{id} format) - these don't exist in database
        if (typeof req.params.id === 'string' && req.params.id.startsWith('inv-sub-')) {
            return res.status(400).json({ message: 'Virtual subcategories cannot be deleted. Delete individual inventory items instead.' });
        }

        try {
            // Check if subcategory exists
            const [rows] = await pool.query("SELECT image_url FROM sarga_product_subcategories WHERE id = ?", [req.params.id]);
            if (!rows || rows.length === 0) {
                return res.status(404).json({ message: 'Subcategory not found' });
            }

            // Check if subcategory has products
            const [prodRows] = await pool.query(
                "SELECT COUNT(*) AS cnt FROM sarga_products WHERE subcategory_id = ?", [req.params.id]
            );
            if (prodRows[0]?.cnt > 0) {
                return res.status(400).json({ message: 'This subcategory contains products. Move or delete products first.' });
            }
            
            // Delete image file if exists
            if (rows[0]?.image_url) {
                await removeUploadFile(rows[0].image_url).catch(() => {});
            }
            
            // Delete subcategory
            await pool.query("DELETE FROM sarga_product_subcategories WHERE id = ?", [req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, 'SUBCATEGORY_DELETE', `Deleted subcategory #${req.params.id}`, { entity_type: 'product_subcategory', entity_id: req.params.id });
            res.json({ message: 'Subcategory deleted' });
        } catch (err) {
            console.error('Delete subcategory error:', err);
            if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_NO_REFERENCED_ROW_2') {
                return res.status(400).json({ message: 'Cannot delete subcategory due to database constraints' });
            }
            res.status(500).json({ message: err.message || 'Database error' });
        }
    });

    // Toggle Subcategory Active/Inactive
    router.patch('/product-subcategories/:id/toggle-active', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        // Handle virtual subcategories (inv-sub-{id} format) - these don't exist in database
        if (typeof req.params.id === 'string' && req.params.id.startsWith('inv-sub-')) {
            return res.status(400).json({ message: 'Virtual subcategories cannot be toggled. They are always active.' });
        }

        try {
            const [rows] = await pool.query("SELECT is_active FROM sarga_product_subcategories WHERE id = ?", [req.params.id]);
            if (!rows[0]) return res.status(404).json({ message: 'Subcategory not found' });
            const newState = rows[0].is_active ? 0 : 1;
            await pool.query("UPDATE sarga_product_subcategories SET is_active = ? WHERE id = ?", [newState, req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, newState ? 'SUBCATEGORY_ENABLE' : 'SUBCATEGORY_DISABLE', `${newState ? 'Enabled' : 'Disabled'} subcategory #${req.params.id}`, { entity_type: 'product_subcategory', entity_id: req.params.id });
            res.json({ message: newState ? 'Subcategory enabled' : 'Subcategory disabled', is_active: newState });
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List Products for a Subcategory
    router.get('/product-subcategories/:id/products', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT p.* FROM sarga_products p
                 LEFT JOIN sarga_inventory i ON p.inventory_item_id = i.id
                 WHERE p.subcategory_id = ? AND p.is_active = 1 AND p.is_deleted = 0 AND (p.inventory_item_id IS NULL OR i.is_deleted = 0)
                 ORDER BY p.name ASC`,
                [req.params.id]
            );
            res.json(rows);
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Add Product with Slabs and Extras
    router.post('/products', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Designer', 'Front Office'), upload.single('image'), async (req, res) => {
        const { subcategory_id, name, product_code, calculation_type, description, inventory_item_id, isPhysicalProduct, company_name, company_code, size, extraInv } = req.body;
        const slabs = typeof req.body.slabs === 'string' ? JSON.parse(req.body.slabs) : req.body.slabs;
        const extras = typeof req.body.extras === 'string' ? JSON.parse(req.body.extras) : req.body.extras;
        const parsedExtraInv = typeof extraInv === 'string' ? JSON.parse(extraInv) : (extraInv || {});

        if (!subcategory_id) {
            return res.status(400).json({ message: 'Subcategory is required' });
        }
        if (!name || !String(name).trim()) {
            return res.status(400).json({ message: 'Product name is required' });
        }

        // Check for duplicate product in the same company
        const checkName = String(name || '').trim();
        const checkCompName = String(company_name || '').trim();
        const checkCompCode = String(company_code || '').trim();

        if (checkName) {
            let dupQuery = "SELECT id FROM sarga_products WHERE LOWER(TRIM(name)) = LOWER(?) AND is_deleted = 0";
            let dupParams = [checkName];

            if (checkCompName || checkCompCode) {
                dupQuery += " AND (";
                const conditions = [];
                if (checkCompName) {
                    conditions.push("LOWER(TRIM(company_name)) = LOWER(?)");
                    dupParams.push(checkCompName);
                }
                if (checkCompCode) {
                    conditions.push("LOWER(TRIM(company_code)) = LOWER(?)");
                    dupParams.push(checkCompCode);
                }
                dupQuery += conditions.join(" OR ") + ")";
            } else {
                dupQuery += " AND (company_name IS NULL OR TRIM(company_name) = '') AND (company_code IS NULL OR TRIM(company_code) = '')";
            }

            try {
                const [dupRows] = await pool.query(dupQuery, dupParams);
                if (dupRows.length > 0) {
                    return res.status(400).json({ message: 'A product with this name already exists for the specified company.' });
                }
            } catch (dbErr) {
                console.error('Check duplicate product error:', dbErr);
                return res.status(500).json({ message: 'Database error' });
            }
        }

        let imageUrl = null;
        if (req.file) {
            let cloudinaryResult;
            try {
                cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'products');
            } catch (err) {
                console.error('Upload product image error:', err);
                return res.status(500).json({ message: 'Failed to upload image' });
            }
            imageUrl = cloudinaryResult.secure_url;
        }

        // Product creation no longer requires admin approval. Added products are inserted directly.

        const connection = await pool.getConnection();
        try {
            if (!name || !String(name).trim()) {
                return res.status(400).json({ message: 'Product name is required' });
            }
            await connection.beginTransaction();

            const [posRows] = await connection.query(
                "SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_products WHERE subcategory_id = ?",
                [subcategory_id]
            );
            const nextPos = posRows[0]?.nextPos || 1;

            const { has_paper_rate, paper_rate, has_double_side_rate } = req.body;
            const [prodResult] = await connection.query(
                "INSERT INTO sarga_products (subcategory_id, name, product_code, company_name, company_code, size, calculation_type, description, image_url, has_paper_rate, paper_rate, has_double_side_rate, position, inventory_item_id, is_physical_product) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [subcategory_id, String(name).trim(), product_code || null, company_name || null, company_code || null, size || null, calculation_type, description, imageUrl, has_paper_rate === 'true' || has_paper_rate === 1 || has_paper_rate === '1' ? 1 : 0, Number(paper_rate) || 0, has_double_side_rate === 'true' || has_double_side_rate === 1 || has_double_side_rate === '1' ? 1 : 0, nextPos, inventory_item_id || null, isPhysicalProduct === 'true' || isPhysicalProduct === 1 || isPhysicalProduct === '1' ? 1 : 0]
            );
            const productId = prodResult.insertId;

            if (slabs && slabs.length > 0) {
                for (const slab of slabs) {
                    const minQty = Number(slab.min_qty) || 0;
                    const maxQty = slab.max_qty === '' || slab.max_qty === null || slab.max_qty === undefined
                        ? null
                        : Number(slab.max_qty);
                    const baseValue = Number(slab.base_value) || 0;
                    const unitRate = Number(slab.unit_rate) || 0;
                    const offsetRate = Number(slab.offset_unit_rate) || 0;
                    const doubleSideRate = Number(slab.double_side_unit_rate) || 0;

                    await connection.query(
                        "INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate, offset_unit_rate, double_side_unit_rate) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [productId, minQty, maxQty, baseValue, unitRate, offsetRate, doubleSideRate]
                    );
                }
            }

            if (extras && extras.length > 0) {
                for (const extra of extras) {
                    await connection.query(
                        "INSERT INTO sarga_product_extras_template (product_id, purpose, amount) VALUES (?, ?, ?)",
                        [productId, extra.purpose, extra.amount]
                    );
                }
            }

            const links = typeof req.body.links === 'string' ? JSON.parse(req.body.links) : (req.body.links || []);
            if (links && links.length > 0) {
                for (const link of links) {
                    const linkName = String(link.name || '').trim();
                    const linkUrl = String(link.url || '').trim();
                    if (linkName && linkUrl) {
                        await connection.query(
                            "INSERT INTO sarga_product_links (product_id, name, url) VALUES (?, ?, ?)",
                            [productId, linkName, linkUrl]
                        );
                    }
                }
            }

            await connection.commit();
            invalidateHierarchyCache();

            // Auto-create inventory entry if not already linked to one
            if (!inventory_item_id) {
                try {
                    await autoCreateInventoryFromProduct(productId, String(name).trim(), product_code, subcategory_id, slabs, company_name, company_code, size, parsedExtraInv, req.user.id);
                } catch (autoErr) {
                    console.error('Auto-create inventory from product failed (non-blocking):', autoErr.message);
                }
            }

            auditLog(req.user.id, 'PRODUCT_ADD', `Added product: ${name} (${calculation_type})`, { entity_type: 'product', entity_id: productId });
            res.status(201).json({ id: productId, message: 'Product added with slabs and extras' });
        } catch (err) {
            await connection.rollback();
            console.error('Add product error:', err);
            const isProd = process.env.NODE_ENV === 'production';
            const friendlyMessage = err?.sqlMessage || err?.message || 'Database error';
            res.status(500).json({ message: isProd ? 'Database error' : friendlyMessage });
        } finally {
            connection.release();
        }
    });

    // Update Product
    router.put('/products/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Designer', 'Front Office'), upload.single('image'), async (req, res) => {
        const { id } = req.params;

        // Handle inventory-only items (inv-{id} format) - redirect to inventory update
        if (typeof id === 'string' && id.startsWith('inv-')) {
            const inventoryId = parseInt(id.replace('inv-', ''), 10);
            if (isNaN(inventoryId)) {
                return res.status(400).json({ message: 'Invalid inventory ID' });
            }

            if (req.user.role !== 'Admin') {
                return res.status(403).json({ message: 'Only Admin can update inventory-only items.' });
            }

            const { name, product_code, extraInv } = req.body;
            const invData = typeof extraInv === 'string' ? JSON.parse(extraInv) : extraInv;

            try {
                await pool.query(
                    `UPDATE sarga_inventory
                     SET name = ?, sku = ?, hsn = ?, quantity = ?, unit = ?, gst_rate = ?, cost_price = ?, sell_price = ?, vendor_name = ?
                     WHERE id = ?`,
                    [
                        name || invData?.name,
                        product_code || invData?.sku,
                        invData?.hsn || '',
                        invData?.quantity || 0,
                        invData?.unit || 'pcs',
                        invData?.gst_rate || '0',
                        invData?.cost_price || 0,
                        invData?.sell_price || 0,
                        invData?.vendor_name || '',
                        inventoryId
                    ]
                );
                invalidateHierarchyCache();
                auditLog(req.user.id, 'INVENTORY_UPDATE', `Updated inventory item #${inventoryId} via Product Library`, { entity_type: 'inventory', entity_id: inventoryId });
                return res.json({ message: 'Inventory item updated successfully' });
            } catch (err) {
                console.error('Update inventory error:', err);
                return res.status(500).json({ message: 'Database error' });
            }
        }

        const { subcategory_id, name, product_code, company_name, company_code, size, calculation_type, description, has_paper_rate, paper_rate, has_double_side_rate, inventory_item_id, isPhysicalProduct, extraInv } = req.body;
        const slabs = typeof req.body.slabs === 'string' ? JSON.parse(req.body.slabs) : req.body.slabs;
        const extras = typeof req.body.extras === 'string' ? JSON.parse(req.body.extras) : req.body.extras;
        const parsedExtraInv = typeof extraInv === 'string' ? JSON.parse(extraInv) : (extraInv || {});

        let product;
        try {
            const [productRows] = await pool.query('SELECT * FROM sarga_products WHERE id = ? LIMIT 1', [id]);
            product = productRows[0];
        } catch (dbErr) {
            console.error('Fetch product for update validation error:', dbErr);
            return res.status(500).json({ message: 'Database error' });
        }
        if (!product) return res.status(404).json({ message: 'Product not found' });

        // Check for duplicate product in the same company (excluding current product)
        const checkName = String(name !== undefined ? name : product.name).trim();
        const checkCompName = String(company_name !== undefined ? company_name : product.company_name || '').trim();
        const checkCompCode = String(company_code !== undefined ? company_code : product.company_code || '').trim();

        if (checkName) {
            let dupQuery = "SELECT id FROM sarga_products WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ? AND is_deleted = 0";
            let dupParams = [checkName, id];

            if (checkCompName || checkCompCode) {
                dupQuery += " AND (";
                const conditions = [];
                if (checkCompName) {
                    conditions.push("LOWER(TRIM(company_name)) = LOWER(?)");
                    dupParams.push(checkCompName);
                }
                if (checkCompCode) {
                    conditions.push("LOWER(TRIM(company_code)) = LOWER(?)");
                    dupParams.push(checkCompCode);
                }
                dupQuery += conditions.join(" OR ") + ")";
            } else {
                dupQuery += " AND (company_name IS NULL OR TRIM(company_name) = '') AND (company_code IS NULL OR TRIM(company_code) = '')";
            }

            try {
                const [dupRows] = await pool.query(dupQuery, dupParams);
                if (dupRows.length > 0) {
                    return res.status(400).json({ message: 'A product with this name already exists for the specified company.' });
                }
            } catch (dbErr) {
                console.error('Check duplicate product for update error:', dbErr);
                return res.status(500).json({ message: 'Database error' });
            }
        }

        let imageUrl = req.body.image_url;
        if (req.file) {
            let cloudinaryResult;
            try {
                cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'products');
            } catch (err) {
                console.error('Upload product image error:', err);
                return res.status(500).json({ message: 'Failed to upload image' });
            }
            imageUrl = cloudinaryResult.secure_url;
        }

        // Intercept Designer, Front Office - create request instead of direct update
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            try {

                // Check pending request
                const [pendingRows] = await pool.query(`SELECT id FROM sarga_product_update_requests WHERE product_id = ? AND status = 'pending' LIMIT 1`, [id]);
                if (pendingRows.length > 0) return res.status(409).json({ message: 'An update request is already pending for this product.' });

                // Fetch slabs, extras, links in parallel
                const [[currSlabs], [currExtras], [currLinks]] = await Promise.all([
                    pool.query('SELECT * FROM sarga_product_slabs WHERE product_id = ? ORDER BY min_qty ASC', [id]),
                    pool.query('SELECT * FROM sarga_product_extras_template WHERE product_id = ?', [id]),
                    pool.query('SELECT id, name, url FROM sarga_product_links WHERE product_id = ? ORDER BY id ASC', [id])
                ]);

                // company_code is immutable after creation
                if (product.company_code && company_code !== undefined && product.company_code !== company_code) {
                    return res.status(400).json({ message: 'Company code cannot be changed after creation' });
                }

                const currentData = Object.assign({}, product, { slabs: currSlabs, extras: currExtras, links: currLinks });

                const proposedData = {
                    subcategory_id: subcategory_id ? Number(subcategory_id) : product.subcategory_id,
                    name: name ? String(name).trim() : product.name,
                    product_code: product_code !== undefined ? product_code : product.product_code,
                    company_name: company_name !== undefined ? company_name : product.company_name,
                    company_code: company_code !== undefined ? company_code : product.company_code,
                    size: size !== undefined ? size : product.size,
                    calculation_type: calculation_type !== undefined ? calculation_type : product.calculation_type,
                    description: description !== undefined ? description : product.description,
                    has_paper_rate: has_paper_rate !== undefined ? (has_paper_rate === 'true' || has_paper_rate === 1 || has_paper_rate === '1') : product.has_paper_rate,
                    paper_rate: paper_rate !== undefined ? Number(paper_rate) : product.paper_rate,
                    has_double_side_rate: has_double_side_rate !== undefined ? (has_double_side_rate === 'true' || has_double_side_rate === 1 || has_double_side_rate === '1') : product.has_double_side_rate,
                    inventory_item_id: inventory_item_id !== undefined ? inventory_item_id : product.inventory_item_id,
                    is_physical_product: isPhysicalProduct !== undefined ? (isPhysicalProduct === 'true' || isPhysicalProduct === 1 || isPhysicalProduct === '1') : product.is_physical_product,
                    slabs: slabs !== undefined ? slabs : currSlabs,
                    extras: extras !== undefined ? extras : currExtras,
                    links: typeof req.body.links === 'string' ? JSON.parse(req.body.links) : (req.body.links || currLinks),
                    extraInv: parsedExtraInv,
                    image_url: imageUrl || product.image_url
                };

                const [insertResult] = await pool.query(
                    `INSERT INTO sarga_product_update_requests (product_id, current_data, proposed_data, requested_by, status, request_type)
                     VALUES (?, ?, ?, ?, 'pending', 'edit')`,
                    [id, JSON.stringify(currentData), JSON.stringify(proposedData), req.user.id]
                );

                return res.status(202).json({ message: 'Product update request submitted for Admin approval.', request_id: insertResult.insertId, status: 'pending' });
            } catch (err) {
                console.error('Submit product update request error:', err);
                return res.status(500).json({ message: 'Failed to submit product update request.' });
            }
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // company_code is immutable after creation
            const [[existingProduct]] = await connection.query('SELECT company_code FROM sarga_products WHERE id = ?', [id]);
            if (existingProduct && existingProduct.company_code && company_code && existingProduct.company_code !== company_code) {
                await connection.rollback();
                return res.status(400).json({ message: 'Company code cannot be changed after creation' });
            }

            await connection.query(
                "UPDATE sarga_products SET subcategory_id = ?, name = ?, product_code = ?, company_name = ?, company_code = ?, size = ?, calculation_type = ?, description = ?, image_url = ?, has_paper_rate = ?, paper_rate = ?, has_double_side_rate = ?, inventory_item_id = ?, is_physical_product = ? WHERE id = ?",
                [subcategory_id, String(name).trim(), product_code || null, company_name || null, company_code || null, size || null, calculation_type, description, imageUrl, has_paper_rate === 'true' || has_paper_rate === 1 || has_paper_rate === '1' ? 1 : 0, Number(paper_rate) || 0, has_double_side_rate === 'true' || has_double_side_rate === 1 || has_double_side_rate === '1' ? 1 : 0, inventory_item_id || null, isPhysicalProduct === 'true' || isPhysicalProduct === 1 || isPhysicalProduct === '1' ? 1 : 0, id]
            );

            // Update Slabs: DELETE and bulk INSERT
            await connection.query("DELETE FROM sarga_product_slabs WHERE product_id = ?", [id]);
            if (slabs && slabs.length > 0) {
                const slabValues = slabs.map(slab => [
                    id, Number(slab.min_qty) || 0, (slab.max_qty === '' || slab.max_qty === null) ? null : Number(slab.max_qty),
                    Number(slab.base_value) || 0, Number(slab.unit_rate) || 0, Number(slab.offset_unit_rate) || 0, Number(slab.double_side_unit_rate) || 0
                ]);
                await connection.query(
                    "INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate, offset_unit_rate, double_side_unit_rate) VALUES ?",
                    [slabValues]
                );
            }

            // Update Extras: DELETE and bulk INSERT
            await connection.query("DELETE FROM sarga_product_extras_template WHERE product_id = ?", [id]);
            if (extras && extras.length > 0) {
                const extraValues = extras.map(extra => [id, extra.purpose, extra.amount]);
                await connection.query(
                    "INSERT INTO sarga_product_extras_template (product_id, purpose, amount) VALUES ?",
                    [extraValues]
                );
            }

            // Update Links: DELETE and bulk INSERT
            const links = typeof req.body.links === 'string' ? JSON.parse(req.body.links) : (req.body.links || []);
            await connection.query("DELETE FROM sarga_product_links WHERE product_id = ?", [id]);
            if (links && links.length > 0) {
                const linkValues = links
                    .filter(l => String(l.name || '').trim() && String(l.url || '').trim())
                    .map(l => [id, String(l.name).trim(), String(l.url).trim()]);
                if (linkValues.length > 0) {
                    await connection.query(
                        "INSERT INTO sarga_product_links (product_id, name, url) VALUES ?",
                        [linkValues]
                    );
                }
            }

            // Sync existing inventory linked item
            await syncInventoryFromProduct(connection, id, String(name).trim(), product_code, subcategory_id, slabs, company_name, company_code, size, parsedExtraInv);

            await connection.commit();
            invalidateHierarchyCache();

            // Auto-create inventory entry if not already linked and is marked physical product
            if (isPhysicalProduct === 'true' || isPhysicalProduct === 1 || isPhysicalProduct === '1') {
                try {
                    await autoCreateInventoryFromProduct(id, String(name).trim(), product_code, subcategory_id, slabs, company_name, company_code, size, parsedExtraInv, req.user.id);
                } catch (autoErr) {
                    console.error('Auto-create inventory in PUT failed (non-blocking):', autoErr.message);
                }
            }

            auditLog(req.user.id, 'PRODUCT_UPDATE', `Updated product #${id}: ${name}`, { entity_type: 'product', entity_id: id });
            res.json({ message: 'Product updated successfully' });
        } catch (err) {
            await connection.rollback();
            console.error('Update product error:', err);
            console.error('Error details:', err.message, err.sqlMessage);
            const isProd = process.env.NODE_ENV === 'production';
            const friendlyMessage = err?.sqlMessage || err?.message || 'Database error';
            res.status(500).json({ message: isProd ? 'Database error' : friendlyMessage });
        } finally {
            connection.release();
        }
    });

    // Delete Product
    router.delete('/products/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Designer', 'Front Office'), async (req, res) => {
        // Handle inventory-only items (inv-{id} format) - redirect to inventory delete
        if (typeof req.params.id === 'string' && req.params.id.startsWith('inv-')) {
            const inventoryId = parseInt(req.params.id.replace('inv-', ''), 10);
            if (isNaN(inventoryId)) {
                return res.status(400).json({ message: 'Invalid inventory ID' });
            }

            if (req.user.role !== 'Admin') {
                return res.status(403).json({ message: 'Only Admin can delete inventory-only items.' });
            }

            try {
                const [invRows] = await pool.query("SELECT id, quantity FROM sarga_inventory WHERE id = ? AND is_deleted = 0", [inventoryId]);
                if (!invRows[0]) return res.status(404).json({ message: 'Inventory item not found' });

                await pool.query("UPDATE sarga_inventory SET sku = CONCAT(sku, '_deleted_', UNIX_TIMESTAMP()), is_deleted = 1 WHERE id = ?", [inventoryId]);
                await pool.query('DELETE FROM sarga_branch_stock WHERE inventory_item_id = ?', [inventoryId]);
                await pool.query('DELETE FROM sarga_stock_requests WHERE inventory_item_id = ?', [inventoryId]);
                invalidateHierarchyCache();
                auditLog(req.user.id, 'INVENTORY_SOFT_DELETE', `Soft-deleted inventory item #${inventoryId} via Product Library`, { entity_type: 'inventory', entity_id: inventoryId });
                return res.json({ message: 'Inventory item deleted successfully' });
            } catch (err) {
                console.error('Delete inventory error:', err);
                return res.status(500).json({ message: 'Database error' });
            }
        }

        const productId = Number(req.params.id);

        if (req.user.role !== 'Admin') {
            try {
                // Fetch product details
                const [productRows] = await pool.query('SELECT * FROM sarga_products WHERE id = ? LIMIT 1', [productId]);
                const product = productRows[0];
                if (!product) return res.status(404).json({ message: 'Product not found' });

                // Check pending request
                const [pendingRows] = await pool.query(`SELECT id FROM sarga_product_update_requests WHERE product_id = ? AND status = 'pending' LIMIT 1`, [productId]);
                if (pendingRows.length > 0) return res.status(409).json({ message: 'A request is already pending for this product.' });

                // Fetch slabs, extras, links
                const [currSlabs] = await pool.query('SELECT * FROM sarga_product_slabs WHERE product_id = ? ORDER BY min_qty ASC', [productId]);
                const [currExtras] = await pool.query('SELECT * FROM sarga_product_extras_template WHERE product_id = ?', [productId]);
                const [currLinks] = await pool.query('SELECT id, name, url FROM sarga_product_links WHERE product_id = ? ORDER BY id ASC', [productId]);

                const currentData = Object.assign({}, product, { slabs: currSlabs, extras: currExtras, links: currLinks });

                const [insertResult] = await pool.query(
                    `INSERT INTO sarga_product_update_requests (product_id, current_data, proposed_data, requested_by, status, request_type)
                     VALUES (?, ?, ?, ?, 'pending', 'delete')`,
                    [productId, JSON.stringify(currentData), JSON.stringify({}), req.user.id]
                );

                return res.status(202).json({ message: 'Product deletion request submitted for Admin approval.', request_id: insertResult.insertId, status: 'pending' });
            } catch (err) {
                console.error('Submit product deletion request error:', err);
                return res.status(500).json({ message: 'Failed to submit product deletion request.' });
            }
        }

        try {
            const [prodRows] = await pool.query("SELECT id, inventory_item_id, sync_enabled FROM sarga_products WHERE id = ? AND is_deleted = 0", [productId]);
            if (!prodRows.length) return res.status(404).json({ message: 'Product not found or already deleted' });
            const prod = prodRows[0];

            // Soft-delete the product
            await pool.query("UPDATE sarga_products SET is_deleted = 1 WHERE id = ?", [productId]);

            // If sync_enabled and linked to inventory, soft-delete inventory too (linked mode)
            if (prod.sync_enabled && prod.inventory_item_id) {
                await pool.query("UPDATE sarga_inventory SET sku = CONCAT(sku, '_deleted_', UNIX_TIMESTAMP()), is_deleted = 1 WHERE id = ? AND is_deleted = 0", [prod.inventory_item_id]);
                // Clear operational data for the linked inventory
                await pool.query('DELETE FROM sarga_branch_stock WHERE inventory_item_id = ?', [prod.inventory_item_id]);
                await pool.query('DELETE FROM sarga_stock_requests WHERE inventory_item_id = ?', [prod.inventory_item_id]);
                auditLog(req.user.id, 'INVENTORY_SOFT_DELETE', `Cascade soft-deleted inventory #${prod.inventory_item_id} after product #${productId} deletion (linked mode)`);
            }

            invalidateHierarchyCache();
            auditLog(req.user.id, 'PRODUCT_SOFT_DELETE', `Soft-deleted product #${productId}`, { entity_type: 'product', entity_id: productId });

            // Notify connected clients in real-time
            try {
                const { emitProductEvent } = require('../services/socketManager');
                emitProductEvent('productDeleted', { productId, inventoryId: prod.inventory_item_id });
            } catch (_) { /* socket not available */ }

            res.json({ message: 'Product deleted successfully' });
        } catch (err) {
            console.error('Delete product error:', err);
            res.status(500).json({ message: err.message || 'Database error' });
        }
    });

    // Toggle Product Active/Inactive
    router.patch('/products/:id/toggle-active', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        // Handle inventory-only items (inv-{id} format) - inventory items don't have is_active
        if (typeof req.params.id === 'string' && req.params.id.startsWith('inv-')) {
            return res.status(400).json({ message: 'Inventory items cannot be toggled. They are always active.' });
        }

        try {
            const [rows] = await pool.query("SELECT is_active FROM sarga_products WHERE id = ?", [req.params.id]);
            if (!rows[0]) return res.status(404).json({ message: 'Product not found' });
            const newState = rows[0].is_active ? 0 : 1;
            await pool.query("UPDATE sarga_products SET is_active = ? WHERE id = ?", [newState, req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, newState ? 'PRODUCT_ENABLE' : 'PRODUCT_DISABLE', `${newState ? 'Enabled' : 'Disabled'} product #${req.params.id}`, { entity_type: 'product', entity_id: req.params.id });
            res.json({ message: newState ? 'Product enabled' : 'Product disabled', is_active: newState });
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Delete Product Image
    router.delete('/products/:id/image', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT image_url FROM sarga_products WHERE id = ?", [req.params.id]);
            if (!rows[0]) return res.status(404).json({ message: 'Product not found' });

            const imageUrl = rows[0].image_url;
            if (imageUrl) await removeUploadFile(imageUrl);

            await pool.query("UPDATE sarga_products SET image_url = NULL WHERE id = ?", [req.params.id]);
            auditLog(req.user.id, 'PRODUCT_IMAGE_DELETE', `Removed image from product #${req.params.id}`, { entity_type: 'product', entity_id: req.params.id });
            res.json({ message: 'Product image removed', image_url: null });
        } catch (err) {
            console.error('Remove product image error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update positions for categories/subcategories/products
    router.put('/product-positions', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        const { type, updates } = req.body;
        const tableMap = {
            category: 'sarga_product_categories',
            subcategory: 'sarga_product_subcategories',
            product: 'sarga_products'
        };

        if (!tableMap[type]) {
            return res.status(400).json({ message: 'Invalid type' });
        }
        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ message: 'Updates are required' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const update of updates) {
                if (!update?.id || update.position === undefined) continue;
                await connection.query(
                    `UPDATE ${tableMap[type]} SET position = ? WHERE id = ?`,
                    [Number(update.position) || 0, update.id]
                );
            }
            await connection.commit();
            invalidateHierarchyCache();
            auditLog(req.user.id, 'PRODUCT_POSITION_UPDATE', `Updated ${type} positions`);
            res.json({ message: 'Positions updated' });
        } catch (err) {
            await connection.rollback();
            console.error('Position update error:', err);
            res.status(500).json({ message: 'Database error' });
        } finally {
            connection.release();
        }
    });

    // Reset usage-based ordering to default
    router.post('/product-usage/reset', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        const { user_id_internal } = req.body || {};
        try {
            if (user_id_internal) {
                await pool.query("DELETE FROM sarga_product_usage WHERE user_id_internal = ?", [user_id_internal]);
                auditLog(req.user.id, 'PRODUCT_USAGE_RESET', `Reset usage for user ${user_id_internal}`);
            } else {
                await pool.query("DELETE FROM sarga_product_usage");
                auditLog(req.user.id, 'PRODUCT_USAGE_RESET', 'Reset usage for all users');
            }
            res.json({ message: 'Usage reset to default' });
        } catch (err) {
            console.error('Usage reset error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Designer submits a product image update request for admin approval
    router.post('/products/:id/image-update-requests', authenticateToken, authorizeRoles('Designer'), upload.single('image'), async (req, res) => {
        const productId = Number(req.params.id);
        const requestedBy = req.user?.id;

        if (!req.file) {
            return res.status(400).json({ message: 'Image file is required' });
        }
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ message: 'Invalid product id' });
        }

        let proposedImageUrl;
        try {
            const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'product-image-requests');
            proposedImageUrl = cloudinaryResult.secure_url;
        } catch (uploadError) {
            console.error('Cloudinary upload error for image request:', uploadError);
            return res.status(500).json({ message: 'Failed to upload image' });
        }

        try {
            const [productRows] = await pool.query(
                'SELECT id, name, image_url FROM sarga_products WHERE id = ? LIMIT 1',
                [productId]
            );
            const product = productRows[0];
            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            const [pendingRows] = await pool.query(
                `SELECT id, proposed_image_url
                 FROM sarga_product_image_requests
                 WHERE product_id = ? AND status = 'pending'
                 ORDER BY id DESC LIMIT 1`,
                [productId]
            );

            if (pendingRows.length > 0) {
                return res.status(409).json({
                    message: 'An image update request is already pending for this product.'
                });
            }

            const [insertResult] = await pool.query(
                `INSERT INTO sarga_product_image_requests
                 (product_id, current_image_url, proposed_image_url, requested_by, status)
                 VALUES (?, ?, ?, ?, 'pending')`,
                [productId, product.image_url || null, proposedImageUrl, requestedBy]
            );

            auditLog(req.user.id, 'PRODUCT_IMAGE_REQUEST_CREATE', `Designer submitted image update request for product #${productId}`, {
                entity_type: 'product',
                entity_id: productId,
                request_id: insertResult.insertId
            });

            return res.status(201).json({
                message: 'Image update request submitted for admin approval.',
                request_id: insertResult.insertId,
                product_id: productId,
                status: 'pending'
            });
        } catch (err) {
            console.error('Create product image request error:', err);
            return res.status(500).json({ message: 'Database error' });
        }
    });

    // Admin list of image update requests
    router.get('/products/image-update-requests', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            const status = String(req.query.status || 'pending').toLowerCase();
            const allowedStatuses = ['pending', 'approved', 'rejected', 'all'];
            const normalizedStatus = allowedStatuses.includes(status) ? status : 'pending';

            const params = [];
            let whereSql = '';
            if (normalizedStatus !== 'all') {
                whereSql = 'WHERE r.status = ?';
                params.push(normalizedStatus);
            }

            const [rows] = await pool.query(
                `SELECT
                    r.id,
                    r.product_id,
                    r.current_image_url,
                    r.proposed_image_url,
                    r.requested_by,
                    r.status,
                    r.admin_note,
                    r.requested_at,
                    r.reviewed_by,
                    r.reviewed_at,
                    p.name AS product_name,
                    p.product_code,
                    req_staff.name AS requested_by_name,
                    rev_staff.name AS reviewed_by_name
                 FROM sarga_product_image_requests r
                 JOIN sarga_products p ON p.id = r.product_id
                 LEFT JOIN sarga_staff req_staff ON req_staff.id = r.requested_by
                 LEFT JOIN sarga_staff rev_staff ON rev_staff.id = r.reviewed_by
                 ${whereSql}
                 ORDER BY r.requested_at DESC, r.id DESC`,
                params
            );

            return res.json(rows);
        } catch (err) {
            console.error('List product image requests error:', err);
            return res.status(500).json({ message: 'Database error' });
        }
    });

    // Admin approves/rejects image update request
    router.patch('/products/image-update-requests/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        const requestId = Number(req.params.id);
        const action = String(req.body?.action || '').toLowerCase();
        const adminNote = req.body?.note || null;

        if (!Number.isFinite(requestId) || requestId <= 0) {
            return res.status(400).json({ message: 'Invalid request id' });
        }
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ message: 'Action must be approve or reject' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [reqRows] = await connection.query(
                `SELECT id, product_id, current_image_url, proposed_image_url, status
                 FROM sarga_product_image_requests
                 WHERE id = ?
                 LIMIT 1`,
                [requestId]
            );

            const requestRow = reqRows[0];
            if (!requestRow) {
                await connection.rollback();
                return res.status(404).json({ message: 'Image update request not found' });
            }
            if (requestRow.status !== 'pending') {
                await connection.rollback();
                return res.status(400).json({ message: 'This request has already been reviewed' });
            }

            if (action === 'approve') {
                await connection.query(
                    'UPDATE sarga_products SET image_url = ? WHERE id = ?',
                    [requestRow.proposed_image_url, requestRow.product_id]
                );
            }

            await connection.query(
                `UPDATE sarga_product_image_requests
                 SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
                 WHERE id = ?`,
                [action === 'approve' ? 'approved' : 'rejected', adminNote, req.user.id, requestId]
            );

            await connection.commit();

            if (action === 'approve') {
                if (requestRow.current_image_url && requestRow.current_image_url !== requestRow.proposed_image_url) {
                    await removeUploadFile(requestRow.current_image_url).catch(() => {});
                }
            } else {
                if (requestRow.proposed_image_url) {
                    await removeUploadFile(requestRow.proposed_image_url).catch(() => {});
                }
            }

            auditLog(req.user.id, 'PRODUCT_IMAGE_REQUEST_REVIEW', `${action}d product image request #${requestId}`, {
                entity_type: 'product',
                entity_id: requestRow.product_id,
                request_id: requestId,
                action
            });

            invalidateHierarchyCache();
            return res.json({
                message: action === 'approve' ? 'Image request approved and live now.' : 'Image request rejected.',
                status: action === 'approve' ? 'approved' : 'rejected'
            });
        } catch (err) {
            await connection.rollback();
            console.error('Review product image request error:', err);
            return res.status(500).json({ message: 'Database error' });
        } finally {
            connection.release();
        }
    });

        // Staff submits a product update request (with product_id in body, used by ProductRequests.jsx)
        router.post('/products/update-requests', authenticateToken, authorizeRoles('Designer', 'Front Office', 'Accountant'), async (req, res) => {
            const productId = Number(req.body.product_id);
            const requestedBy = req.user?.id;
            const priority = ['Low', 'Medium', 'High', 'Urgent'].includes(req.body.priority) ? req.body.priority : 'Medium';
            const notes = req.body.notes || null;
            const status = String(req.body.status || 'Pending').toLowerCase() === 'draft' ? 'draft' : 'pending';

            if (!Number.isFinite(productId) || productId <= 0) {
                return res.status(400).json({ message: 'Invalid or missing product_id' });
            }

            let proposedData = req.body.proposed_data || {};
            if (typeof proposedData === 'string') proposedData = JSON.parse(proposedData);

            try {
                const [productRows] = await pool.query('SELECT * FROM sarga_products WHERE id = ? LIMIT 1', [productId]);
                const product = productRows[0];
                if (!product) return res.status(404).json({ message: 'Product not found' });

                if (status === 'pending') {
                    const [pendingRows] = await pool.query(`SELECT id FROM sarga_product_update_requests WHERE product_id = ? AND status = 'pending' LIMIT 1`, [productId]);
                    if (pendingRows.length > 0) return res.status(409).json({ message: 'An update request is already pending for this product.' });
                }

                const currentData = {
                    name: product.name,
                    product_code: product.product_code,
                    company_name: product.company_name,
                    size: product.size,
                    calculation_type: product.calculation_type,
                    description: product.description,
                    sell_price: product.sell_price,
                    cost_price: product.cost_price,
                };

                const [insertResult] = await pool.query(
                    `INSERT INTO sarga_product_update_requests (product_id, current_data, proposed_data, requested_by, status, request_type, priority, notes)
                     VALUES (?, ?, ?, ?, ?, 'edit', ?, ?)`,
                    [productId, JSON.stringify(currentData), JSON.stringify(proposedData), requestedBy, status, priority, notes]
                );

                auditLog(req.user.id, 'PRODUCT_UPDATE_REQUEST_CREATE', `Submitted product update request for product #${productId}`, {
                    entity_type: 'product', entity_id: productId, request_id: insertResult.insertId
                });

                return res.status(201).json({ message: 'Product update request submitted for admin approval.', request_id: insertResult.insertId, product_id: productId, status });
            } catch (err) {
                console.error('Create product update request error:', err);
                return res.status(500).json({ message: 'Database error' });
            }
        });

        // Staff submits a full product update request for admin approval
        router.post('/products/:id/update-requests', authenticateToken, authorizeRoles('Designer', 'Front Office', 'Accountant'), upload.single('image'), async (req, res) => {
            const productId = Number(req.params.id);
            const requestedBy = req.user?.id;
            const priority = ['Low', 'Medium', 'High', 'Urgent'].includes(req.body.priority) ? req.body.priority : 'Medium';
            const notes = req.body.notes || null;
            const status = String(req.body.status || 'Pending').toLowerCase() === 'draft' ? 'draft' : 'pending';

            if (!Number.isFinite(productId) || productId <= 0) {
                return res.status(400).json({ message: 'Invalid product id' });
            }

            let proposedData = {};
            try {
                if (req.file) {
                    const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'product-update-requests');
                    proposedData.image_url = cloudinaryResult.secure_url;
                }

                // Allow passing a full JSON payload in `proposed_data` or individual fields
                if (req.body.proposed_data) {
                    proposedData = Object.assign(proposedData, typeof req.body.proposed_data === 'string' ? JSON.parse(req.body.proposed_data) : req.body.proposed_data);
                } else {
                    // Copy common fields
                    const fields = ['subcategory_id','name','product_code','company_name','company_code','size','calculation_type','description','has_paper_rate','paper_rate','has_double_side_rate','inventory_item_id','is_physical_product','slabs','extras','links','extraInv'];
                    for (const f of fields) {
                        if (req.body[f] !== undefined) {
                            proposedData[f] = (f === 'slabs' || f === 'extras' || f === 'links' || f === 'extraInv') && typeof req.body[f] === 'string' ? JSON.parse(req.body[f]) : req.body[f];
                        }
                    }
                }
            } catch (err) {
                console.error('Parse proposed data error:', err);
                return res.status(400).json({ message: 'Invalid proposed_data' });
            }

            try {
                const [productRows] = await pool.query('SELECT * FROM sarga_products WHERE id = ? LIMIT 1', [productId]);
                const product = productRows[0];
                if (!product) return res.status(404).json({ message: 'Product not found' });

                // Check for duplicate product in the same company (excluding current product)
                const checkName = String(proposedData.name !== undefined ? proposedData.name : product.name).trim();
                const checkCompName = String(proposedData.company_name !== undefined ? proposedData.company_name : product.company_name || '').trim();
                const checkCompCode = String(proposedData.company_code !== undefined ? proposedData.company_code : product.company_code || '').trim();

                if (checkName) {
                    let dupQuery = "SELECT id FROM sarga_products WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ? AND is_deleted = 0";
                    let dupParams = [checkName, productId];

                    if (checkCompName || checkCompCode) {
                        dupQuery += " AND (";
                        const conditions = [];
                        if (checkCompName) {
                            conditions.push("LOWER(TRIM(company_name)) = LOWER(?)");
                            dupParams.push(checkCompName);
                        }
                        if (checkCompCode) {
                            conditions.push("LOWER(TRIM(company_code)) = LOWER(?)");
                            dupParams.push(checkCompCode);
                        }
                        dupQuery += conditions.join(" OR ") + ")";
                    } else {
                        dupQuery += " AND (company_name IS NULL OR TRIM(company_name) = '') AND (company_code IS NULL OR TRIM(company_code) = '')";
                    }

                    const [dupRows] = await pool.query(dupQuery, dupParams);
                    if (dupRows.length > 0) {
                        return res.status(400).json({ message: 'A product with this name already exists for the specified company.' });
                    }
                }

                if (status === 'pending') {
                    const [pendingRows] = await pool.query(`SELECT id FROM sarga_product_update_requests WHERE product_id = ? AND status = 'pending' LIMIT 1`, [productId]);
                    if (pendingRows.length > 0) return res.status(409).json({ message: 'An update request is already pending for this product.' });
                }

                // Fetch current slabs/extras/links in parallel
                const [[slabs], [extras], [links]] = await Promise.all([
                    pool.query('SELECT * FROM sarga_product_slabs WHERE product_id = ? ORDER BY min_qty ASC', [productId]),
                    pool.query('SELECT * FROM sarga_product_extras_template WHERE product_id = ?', [productId]),
                    pool.query('SELECT id, name, url FROM sarga_product_links WHERE product_id = ? ORDER BY id ASC', [productId])
                ]);

                const currentData = Object.assign({}, product, { slabs, extras, links });

                const [insertResult] = await pool.query(
                    `INSERT INTO sarga_product_update_requests (product_id, current_data, proposed_data, requested_by, status, request_type, priority, notes)
                     VALUES (?, ?, ?, ?, ?, 'edit', ?, ?)`,
                    [productId, JSON.stringify(currentData), JSON.stringify(proposedData), requestedBy, status, priority, notes]
                );

                auditLog(req.user.id, 'PRODUCT_UPDATE_REQUEST_CREATE', `Submitted product update request for product #${productId}`, {
                    entity_type: 'product', entity_id: productId, request_id: insertResult.insertId
                });

                return res.status(201).json({ message: 'Product update request submitted for admin approval.', request_id: insertResult.insertId, product_id: productId, status });
            } catch (err) {
                console.error('Create product update request error:', err);
                return res.status(500).json({ message: 'Database error' });
            }
        });

        // Admin list of product update requests
        router.get('/products/update-requests', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
            try {
                const status = String(req.query.status || 'pending').toLowerCase();
                const allowedStatuses = ['pending', 'approved', 'rejected', 'all'];
                const normalizedStatus = allowedStatuses.includes(status) ? status : 'pending';

                const params = [];
                let whereSql = '';
                if (normalizedStatus !== 'all') {
                    whereSql = 'WHERE LOWER(r.status) = ?';
                    params.push(normalizedStatus);
                }

                let rows = [];
                try {
                    [rows] = await pool.query(
                        `SELECT
                            r.id,
                            r.product_id,
                            r.current_data,
                            r.proposed_data,
                            r.requested_by,
                            r.status,
                            r.request_type,
                            r.priority,
                            r.notes,
                            r.admin_note,
                            r.requested_at,
                            r.reviewed_by,
                            r.reviewed_at,
                            p.name AS product_name,
                            p.product_code,
                            req_staff.name AS requested_by_name,
                            rev_staff.name AS reviewed_by_name
                         FROM sarga_product_update_requests r
                         LEFT JOIN sarga_products p ON p.id = r.product_id
                         LEFT JOIN sarga_staff req_staff ON req_staff.id = r.requested_by
                         LEFT JOIN sarga_staff rev_staff ON rev_staff.id = r.reviewed_by
                         ${whereSql}
                         ORDER BY r.requested_at DESC, r.id DESC`,
                        params
                    );
                } catch (err) {
                    if (err.code === 'ER_BAD_FIELD_ERROR') {
                        [rows] = await pool.query(
                            `SELECT
                                r.id,
                                r.product_id,
                                r.current_data,
                                r.proposed_data,
                                r.requested_by,
                                r.status,
                                r.request_type,
                                NULL AS priority,
                                NULL AS notes,
                                r.admin_note,
                                r.requested_at,
                                r.reviewed_by,
                                r.reviewed_at,
                                p.name AS product_name,
                                p.product_code,
                                req_staff.name AS requested_by_name,
                                rev_staff.name AS reviewed_by_name
                             FROM sarga_product_update_requests r
                             LEFT JOIN sarga_products p ON p.id = r.product_id
                             LEFT JOIN sarga_staff req_staff ON req_staff.id = r.requested_by
                             LEFT JOIN sarga_staff rev_staff ON rev_staff.id = r.reviewed_by
                             ${whereSql}
                             ORDER BY r.requested_at DESC, r.id DESC`,
                            params
                        );
                    } else {
                        throw err;
                    }
                }

                const safeJsonParse = (val) => {
                    if (!val) return null;
                    if (typeof val === 'object') return val;
                    try { return JSON.parse(val); } catch { return null; }
                };

                return res.json(rows.map(r => ({
                    id: r.id,
                    product_id: r.product_id,
                    product_name: r.product_name,
                    product_code: r.product_code,
                    requested_by: r.requested_by,
                    requested_by_name: r.requested_by_name,
                    status: r.status,
                    request_type: r.request_type,
                    priority: r.priority,
                    notes: r.notes,
                    requested_at: r.requested_at,
                    reviewed_by: r.reviewed_by,
                    reviewed_by_name: r.reviewed_by_name,
                    admin_note: r.admin_note,
                    current_data: safeJsonParse(r.current_data),
                    proposed_data: safeJsonParse(r.proposed_data)
                })));
            } catch (err) {
                console.error('List product update requests error:', err);
                return res.status(500).json({ message: err?.message || 'Database error' });
            }
        });

        // Admin approves/rejects a product update request
        router.patch('/products/update-requests/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
            const requestId = Number(req.params.id);
            const action = String(req.body?.action || '').toLowerCase();
            const adminNote = req.body?.note || null;

            if (!Number.isFinite(requestId) || requestId <= 0) {
                return res.status(400).json({ message: 'Invalid request id' });
            }
            if (!['approve', 'reject'].includes(action)) {
                return res.status(400).json({ message: 'Action must be approve or reject' });
            }

            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();

                const [reqRows] = await connection.query(
                    `SELECT id, product_id, current_data, proposed_data, status, request_type
                     FROM sarga_product_update_requests
                     WHERE id = ?
                     LIMIT 1`,
                    [requestId]
                );

                const requestRow = reqRows[0];
                if (!requestRow) {
                    await connection.rollback();
                    return res.status(404).json({ message: 'Update request not found' });
                }
                if (requestRow.status !== 'pending') {
                    await connection.rollback();
                    return res.status(400).json({ message: 'This request has already been reviewed' });
                }

                const proposed = requestRow.proposed_data ? JSON.parse(requestRow.proposed_data) : {};
                const current = requestRow.current_data ? JSON.parse(requestRow.current_data) : {};
                const requestType = requestRow.request_type || 'edit';

                if (action === 'approve') {
                    if (requestType === 'add') {
                        // Check for duplicate before insertion
                        const checkName = String(proposed.name || '').trim();
                        const checkCompName = String(proposed.company_name || '').trim();
                        const checkCompCode = String(proposed.company_code || '').trim();

                        if (checkName) {
                            let dupQuery = "SELECT id FROM sarga_products WHERE LOWER(TRIM(name)) = LOWER(?) AND is_deleted = 0";
                            let dupParams = [checkName];

                            if (checkCompName || checkCompCode) {
                                dupQuery += " AND (";
                                const conditions = [];
                                if (checkCompName) {
                                    conditions.push("LOWER(TRIM(company_name)) = LOWER(?)");
                                    dupParams.push(checkCompName);
                                }
                                if (checkCompCode) {
                                    conditions.push("LOWER(TRIM(company_code)) = LOWER(?)");
                                    dupParams.push(checkCompCode);
                                }
                                dupQuery += conditions.join(" OR ") + ")";
                            } else {
                                dupQuery += " AND (company_name IS NULL OR TRIM(company_name) = '') AND (company_code IS NULL OR TRIM(company_code) = '')";
                            }

                            const [dupRows] = await connection.query(dupQuery, dupParams);
                            if (dupRows.length > 0) {
                                await connection.rollback();
                                return res.status(400).json({ message: 'A product with this name already exists for the specified company.' });
                            }
                        }
                        // 1. Get next position
                        const [posRows] = await connection.query(
                            "SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_products WHERE subcategory_id = ?",
                            [proposed.subcategory_id]
                        );
                        const nextPos = posRows[0]?.nextPos || 1;

                        // 2. Insert into sarga_products
                        const [prodResult] = await connection.query(
                            "INSERT INTO sarga_products (subcategory_id, name, product_code, company_name, company_code, size, calculation_type, description, image_url, has_paper_rate, paper_rate, has_double_side_rate, position, inventory_item_id, is_physical_product) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            [
                                proposed.subcategory_id,
                                String(proposed.name).trim(),
                                proposed.product_code || null,
                                proposed.company_name || null,
                                proposed.company_code || null,
                                proposed.size || null,
                                proposed.calculation_type,
                                proposed.description || null,
                                proposed.image_url || null,
                                proposed.has_paper_rate === true || proposed.has_paper_rate === 'true' || proposed.has_paper_rate === 1 || proposed.has_paper_rate === '1' ? 1 : 0,
                                Number(proposed.paper_rate) || 0,
                                proposed.has_double_side_rate === true || proposed.has_double_side_rate === 'true' || proposed.has_double_side_rate === 1 || proposed.has_double_side_rate === '1' ? 1 : 0,
                                nextPos,
                                proposed.inventory_item_id || null,
                                proposed.is_physical_product === true || proposed.is_physical_product === 'true' || proposed.is_physical_product === 1 || proposed.is_physical_product === '1' ? 1 : 0
                            ]
                        );
                        const newProdId = prodResult.insertId;

                        // 3. Bulk insert slabs
                        if (Array.isArray(proposed.slabs) && proposed.slabs.length > 0) {
                            const slabValues = proposed.slabs.map(slab => [
                                newProdId, Number(slab.min_qty) || 0, (slab.max_qty === '' || slab.max_qty === null) ? null : Number(slab.max_qty),
                                Number(slab.base_value) || 0, Number(slab.unit_rate) || 0, Number(slab.offset_unit_rate) || 0, Number(slab.double_side_unit_rate) || 0
                            ]);
                            await connection.query(
                                "INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate, offset_unit_rate, double_side_unit_rate) VALUES ?",
                                [slabValues]
                            );
                        }

                        // 4. Bulk insert extras
                        if (Array.isArray(proposed.extras) && proposed.extras.length > 0) {
                            const extraValues = proposed.extras.map(extra => [newProdId, extra.purpose, extra.amount]);
                            await connection.query(
                                "INSERT INTO sarga_product_extras_template (product_id, purpose, amount) VALUES ?",
                                [extraValues]
                            );
                        }

                        // 5. Bulk insert links
                        if (Array.isArray(proposed.links) && proposed.links.length > 0) {
                            const linkValues = proposed.links
                                .filter(l => String(l.name || '').trim() && String(l.url || '').trim())
                                .map(l => [newProdId, String(l.name).trim(), String(l.url).trim()]);
                            if (linkValues.length > 0) {
                                await connection.query(
                                    "INSERT INTO sarga_product_links (product_id, name, url) VALUES ?",
                                    [linkValues]
                                );
                            }
                        }

                        // 6. Update request row to reference the new product
                        await connection.query(
                            `UPDATE sarga_product_update_requests SET product_id = ? WHERE id = ?`,
                            [newProdId, requestId]
                        );

                        // Store newProdId on requestRow for post-commit actions
                        requestRow.product_id = newProdId;

                    } else if (requestType === 'delete') {
                        const prodId = requestRow.product_id;
                        await connection.query("DELETE FROM sarga_products WHERE id = ?", [prodId]);

                    } else {
                        // edit
                        // Apply proposed changes to product row
                        const prodId = requestRow.product_id;

                        // Check for duplicate before update
                        const checkName = String(proposed.name !== undefined ? proposed.name : current.name || '').trim();
                        const checkCompName = String(proposed.company_name !== undefined ? proposed.company_name : current.company_name || '').trim();
                        const checkCompCode = String(proposed.company_code !== undefined ? proposed.company_code : current.company_code || '').trim();

                        if (checkName) {
                            let dupQuery = "SELECT id FROM sarga_products WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ? AND is_deleted = 0";
                            let dupParams = [checkName, prodId];

                            if (checkCompName || checkCompCode) {
                                dupQuery += " AND (";
                                const conditions = [];
                                if (checkCompName) {
                                    conditions.push("LOWER(TRIM(company_name)) = LOWER(?)");
                                    dupParams.push(checkCompName);
                                }
                                if (checkCompCode) {
                                    conditions.push("LOWER(TRIM(company_code)) = LOWER(?)");
                                    dupParams.push(checkCompCode);
                                }
                                dupQuery += conditions.join(" OR ") + ")";
                            } else {
                                dupQuery += " AND (company_name IS NULL OR TRIM(company_name) = '') AND (company_code IS NULL OR TRIM(company_code) = '')";
                            }

                            const [dupRows] = await connection.query(dupQuery, dupParams);
                            if (dupRows.length > 0) {
                                await connection.rollback();
                                return res.status(400).json({ message: 'A product with this name already exists for the specified company.' });
                            }
                        }

                        // Map fields to update
                        const upFields = ['subcategory_id','name','product_code','company_name','company_code','size','calculation_type','description','image_url','has_paper_rate','paper_rate','has_double_side_rate','inventory_item_id','is_physical_product'];
                        const updateValues = [];
                        const setParts = [];
                        for (const f of upFields) {
                            if (proposed[f] !== undefined) {
                                setParts.push(`${f} = ?`);
                                // Normalize booleans
                                if (f === 'has_paper_rate' || f === 'has_double_side_rate' || f === 'is_physical_product') {
                                    updateValues.push(proposed[f] === true || proposed[f] === 'true' || Number(proposed[f]) === 1 ? 1 : 0);
                                } else if (f === 'paper_rate') {
                                    updateValues.push(Number(proposed[f]) || 0);
                                } else {
                                    updateValues.push(proposed[f] === '' ? null : proposed[f]);
                                }
                            }
                        }

                        if (setParts.length > 0) {
                            const sql = `UPDATE sarga_products SET ${setParts.join(', ')} WHERE id = ?`;
                            await connection.query(sql, [...updateValues, prodId]);
                        }

                        // Replace slabs if provided — bulk insert
                        if (Array.isArray(proposed.slabs)) {
                            await connection.query('DELETE FROM sarga_product_slabs WHERE product_id = ?', [prodId]);
                            if (proposed.slabs.length > 0) {
                                const slabValues = proposed.slabs.map(slab => [
                                    prodId, Number(slab.min_qty) || 0, (slab.max_qty === '' || slab.max_qty === null) ? null : Number(slab.max_qty),
                                    Number(slab.base_value) || 0, Number(slab.unit_rate) || 0, Number(slab.offset_unit_rate) || 0, Number(slab.double_side_unit_rate) || 0
                                ]);
                                await connection.query(
                                    'INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate, offset_unit_rate, double_side_unit_rate) VALUES ?',
                                    [slabValues]
                                );
                            }
                        }

                        // Replace extras if provided — bulk insert
                        if (Array.isArray(proposed.extras)) {
                            await connection.query('DELETE FROM sarga_product_extras_template WHERE product_id = ?', [prodId]);
                            if (proposed.extras.length > 0) {
                                const extraValues = proposed.extras.map(extra => [prodId, extra.purpose, extra.amount]);
                                await connection.query('INSERT INTO sarga_product_extras_template (product_id, purpose, amount) VALUES ?', [extraValues]);
                            }
                        }

                        // Replace links if provided — bulk insert
                        if (Array.isArray(proposed.links)) {
                            await connection.query('DELETE FROM sarga_product_links WHERE product_id = ?', [prodId]);
                            if (proposed.links.length > 0) {
                                const linkValues = proposed.links
                                    .filter(l => String(l.name || '').trim() && String(l.url || '').trim())
                                    .map(l => [prodId, String(l.name).trim(), String(l.url).trim()]);
                                if (linkValues.length > 0) {
                                    await connection.query('INSERT INTO sarga_product_links (product_id, name, url) VALUES ?', [linkValues]);
                                }
                            }
                        }

                        // Sync inventory if product is linked (use proposed data, skip re-fetch)
                        if (proposed.inventory_item_id || current.inventory_item_id) {
                            const effectiveProdId = prodId;
                            const slabsPayload = proposed.slabs || [];
                            const extraInvPayload = proposed.extraInv || {};
                            await syncInventoryFromProduct(
                                connection,
                                effectiveProdId,
                                proposed.name || current.name,
                                proposed.product_code || current.product_code,
                                proposed.subcategory_id || current.subcategory_id,
                                slabsPayload,
                                proposed.company_name || current.company_name,
                                proposed.company_code || current.company_code,
                                proposed.size || current.size,
                                extraInvPayload
                            );
                        }
                    }
                }

                // Update request status
                await connection.query(
                    `UPDATE sarga_product_update_requests
                     SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
                     WHERE id = ?`,
                    [action === 'approve' ? 'approved' : 'rejected', adminNote, req.user.id, requestId]
                );

                await connection.commit();

                // Auto-create inventory if physical but not yet linked to an inventory item
                if (action === 'approve' && requestType !== 'delete') {
                    const prodId = requestRow.product_id;
                    try {
                        const [updatedProd] = await pool.query('SELECT * FROM sarga_products WHERE id = ?', [prodId]);
                        const upProd = updatedProd[0];
                        if (upProd && (upProd.is_physical_product === 1 || upProd.is_physical_product === true) && !upProd.inventory_item_id) {
                            const slabsPayload = proposed.slabs || [];
                            const extraInvPayload = proposed.extraInv || {};
                            await autoCreateInventoryFromProduct(
                                prodId,
                                upProd.name,
                                upProd.product_code,
                                upProd.subcategory_id,
                                slabsPayload,
                                upProd.company_name,
                                upProd.company_code,
                                upProd.size,
                                extraInvPayload
                            );
                        }
                    } catch (autoErr) {
                        console.error('Auto-create inventory in approve failed (non-blocking):', autoErr.message);
                    }
                }

                // Post-commit cleanup: remove old/proposed image files accordingly
                try {
                    if (action === 'approve') {
                        const oldImage = current.image_url || null;
                        const newImage = proposed.image_url || null;
                        if (oldImage && oldImage !== newImage) {
                            await removeUploadFile(oldImage).catch(() => {});
                        }
                    } else {
                        // rejected
                        const proposedImage = proposed.image_url || null;
                        if (proposedImage) await removeUploadFile(proposedImage).catch(() => {});
                    }
                } catch (cleanupErr) {
                    console.error('Post-review cleanup error:', cleanupErr);
                }

                auditLog(req.user.id, 'PRODUCT_UPDATE_REQUEST_REVIEW', `${action}d product update request #${requestId}`, { entity_type: 'product', entity_id: requestRow.product_id, request_id: requestId, action });
                invalidateHierarchyCache();

                return res.json({ message: action === 'approve' ? 'Update request approved and applied.' : 'Update request rejected.', status: action === 'approve' ? 'approved' : 'rejected' });
            } catch (err) {
                await connection.rollback();
                console.error('Review product update request error:', err);
                return res.status(500).json({ message: 'Database error' });
            } finally {
                connection.release();
            }
        });



    // Get Full Product Details (including slabs and extras)
    router.get('/products/:id', authenticateToken, async (req, res) => {
        try {
            // Handle inventory-only items (inv-{id} format)
            if (typeof req.params.id === 'string' && req.params.id.startsWith('inv-')) {
                const inventoryId = parseInt(req.params.id.replace('inv-', ''), 10);
                if (isNaN(inventoryId)) {
                    return res.status(400).json({ message: 'Invalid inventory ID' });
                }

                const [invRows] = await pool.query(
                    `SELECT id, name, sku, sell_price, category, hsn, quantity, unit, gst_rate, cost_price, vendor_name
                     FROM sarga_inventory
                     WHERE id = ?
                     LIMIT 1`,
                    [inventoryId]
                );
                const invItem = invRows[0];
                if (!invItem) return res.status(404).json({ message: 'Inventory item not found' });

                // Return inventory item in product-like format
                return res.json({
                    id: `inv-${invItem.id}`,
                    inventory_id: invItem.id,
                    name: invItem.name,
                    product_code: invItem.sku,
                    company_name: invItem.vendor_name,
                    company_code: '',
                    size: '',
                    calculation_type: 'Normal',
                    description: '',
                    image_url: null,
                    has_paper_rate: false,
                    paper_rate: 0,
                    has_double_side_rate: false,
                    inventory_item_id: invItem.id,
                    is_physical_product: true,
                    is_active: true,
                    is_inventory_only: true,
                    slabs: [],
                    extras: [],
                    links: [],
                    extraInv: {
                        hsn: invItem.hsn || '',
                        quantity: invItem.quantity || '',
                        unit: invItem.unit || 'pcs',
                        gst_rate: invItem.gst_rate || '0',
                        cost_price: invItem.cost_price || '',
                        vendor_name: invItem.vendor_name || ''
                    }
                });
            }

            const [products] = await pool.query("SELECT * FROM sarga_products WHERE id = ?", [req.params.id]);
            const product = products[0];
            if (!product) return res.status(404).json({ message: 'Product not found' });

            let inventoryMeta = null;
            if (product.inventory_item_id) {
                const [invRows] = await pool.query(
                    `SELECT id, sku, source_code, model_name, size_code, vendor_name, name
                     FROM sarga_inventory
                     WHERE id = ?
                     LIMIT 1`,
                    [product.inventory_item_id]
                );
                inventoryMeta = invRows[0] || null;
            }

            // Derive from inventory as fallback for older products that don't have direct columns
            const skuFallback = String(product.product_code || inventoryMeta?.sku || '');
            const codeParts = skuFallback.split('-').map(p => String(p || '').trim()).filter(Boolean);
            const fallbackCompanyCode = String(codeParts[0] || inventoryMeta?.source_code || '').toUpperCase();
            const fallbackSize = String(inventoryMeta?.size_code || '').toUpperCase();
            const fallbackCompanyName = String(inventoryMeta?.vendor_name || '').trim();

            // Direct stored columns take priority; fall back to inventory-derived values
            const resolvedProductCode = String(product.product_code || inventoryMeta?.sku || '').trim();
            const resolvedCompanyName = String(product.company_name || '').trim() || fallbackCompanyName;
            const resolvedCompanyCode = String(product.company_code || '').trim() || fallbackCompanyCode;
            const resolvedSize = String(product.size || '').trim() || fallbackSize;

            const [[slabs], [extras], [links]] = await Promise.all([
                pool.query("SELECT * FROM sarga_product_slabs WHERE product_id = ? ORDER BY min_qty ASC", [product.id]),
                pool.query("SELECT * FROM sarga_product_extras_template WHERE product_id = ?", [product.id]),
                pool.query("SELECT id, name, url FROM sarga_product_links WHERE product_id = ? ORDER BY id ASC", [product.id])
            ]);

            // Backward compat: map old extra_inv.sell_price to first slab's unit_rate
            if (product.extra_inv && slabs.length > 0 && (!slabs[0].unit_rate || Number(slabs[0].unit_rate) === 0)) {
                const oldExtra = typeof product.extra_inv === 'string' ? JSON.parse(product.extra_inv) : product.extra_inv;
                if (oldExtra.sell_price) {
                    slabs[0].unit_rate = Number(oldExtra.sell_price);
                }
            }

            res.json({
                ...product,
                product_code: resolvedProductCode,
                company_name: resolvedCompanyName,
                company_code: resolvedCompanyCode,
                size: resolvedSize,
                slabs,
                extras,
                links
            });
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // Repair: scan all linked products and sync inventory prices
    // ────────────────────────────────────────────────────────────
    router.post('/admin/repair-inventory-prices', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        try {
            // Get all products that are linked to inventory items
            const [products] = await pool.query(
                `SELECT p.id, p.name, p.subcategory_id, p.product_code, p.company_name, p.company_code, p.size,
                        p.inventory_item_id, p.extra_inv
                 FROM sarga_products p
                 WHERE p.inventory_item_id IS NOT NULL`
            );

            if (products.length === 0) return res.json({ message: 'No products to repair.', repaired: [], skipped: [] });

            // Batch fetch slabs for all products in one query
            const productIds = products.map(p => p.id);
            const [allSlabs] = await pool.query(
                'SELECT product_id, unit_rate, base_value FROM sarga_product_slabs WHERE product_id IN (?) ORDER BY product_id, min_qty ASC',
                [productIds]
            );
            const slabMap = {};
            for (const s of allSlabs) {
                if (!slabMap[s.product_id]) slabMap[s.product_id] = s;
            }

            // Batch fetch inventory items for all linked products
            const invIds = products.map(p => p.inventory_item_id).filter(Boolean);
            const [allInv] = await pool.query(
                'SELECT id, cost_price, sell_price FROM sarga_inventory WHERE id IN (?)',
                [invIds]
            );
            const invMap = {};
            for (const i of allInv) invMap[i.id] = i;

            const repaired = [];
            const skipped = [];

            for (const prod of products) {
                const extraInv = prod.extra_inv ? (
                    typeof prod.extra_inv === 'string' ? JSON.parse(prod.extra_inv) : prod.extra_inv
                ) : {};

                const slab = slabMap[prod.id];
                const slabSellPrice = slab
                    ? Number(slab.unit_rate) || Number(slab.base_value) || 0
                    : 0;

                const isSet = (v) => v != null && v !== '';
                const parsedCostPrice = isSet(extraInv.cost_price) ? Number(extraInv.cost_price) : 0;
                const parsedSellPrice = slabSellPrice;

                const inv = invMap[prod.inventory_item_id];
                if (!inv) { skipped.push({ id: prod.id, reason: 'inventory_not_found' }); continue; }

                const currentCost = Number(inv.cost_price) || 0;
                const currentSell = Number(inv.sell_price) || 0;

                if (currentCost !== parsedCostPrice || currentSell !== parsedSellPrice) {
                    await pool.query(
                        `UPDATE sarga_inventory
                         SET cost_price = ?, sell_price = ?, size_code = ?
                         WHERE id = ?`,
                        [parsedCostPrice, parsedSellPrice, prod.size || null, prod.inventory_item_id]
                    );
                    repaired.push({
                        product_id: prod.id,
                        product_name: prod.name,
                        inventory_id: prod.inventory_item_id,
                        cost_price_was: currentCost,
                        cost_price_now: parsedCostPrice,
                        sell_price_was: currentSell,
                        sell_price_now: parsedSellPrice
                    });
                }
            }

            res.json({
                message: `Repair complete. ${repaired.length} items fixed, ${skipped.length} skipped.`,
                repaired,
                skipped
            });
        } catch (err) {
            console.error('[RepairInventoryPrices] Error:', err);
            res.status(500).json({ message: err.message || 'Repair failed' });
        }
    });

    return router;
};


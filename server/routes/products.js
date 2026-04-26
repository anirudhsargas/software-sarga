const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { invalidateHierarchyCache } = require('./jobs');
const { paginate } = require('../helpers/pagination');
const { fileToBase64 } = require('../utils/base64');

module.exports = (upload, removeUploadFile) => {
    const router = require('express').Router();

    // Auto-migrate: add company_name, company_code, size columns if they don't exist.
    (async () => {
        try {
            const [[dbRow]] = await pool.query('SELECT DATABASE() AS db');
            const dbName = dbRow?.db;
            const [cols] = await pool.query(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = ?
                   AND TABLE_NAME = 'sarga_products'
                   AND COLUMN_NAME IN ('company_name', 'company_code', 'size')`,
                [dbName]
            );
            const existing = cols.map((r) => r.COLUMN_NAME);

            if (!existing.includes('company_name')) {
                await pool.query('ALTER TABLE sarga_products ADD COLUMN company_name VARCHAR(100) DEFAULT NULL');
            }
            if (!existing.includes('company_code')) {
                await pool.query('ALTER TABLE sarga_products ADD COLUMN company_code VARCHAR(10) DEFAULT NULL');
            }
            if (!existing.includes('size')) {
                await pool.query('ALTER TABLE sarga_products ADD COLUMN size VARCHAR(30) DEFAULT NULL');
            }

            await pool.query(
                `CREATE TABLE IF NOT EXISTS sarga_product_image_requests (
                    id INT NOT NULL AUTO_INCREMENT,
                    product_id INT NOT NULL,
                    current_image_url VARCHAR(255) DEFAULT NULL,
                    proposed_image_url VARCHAR(255) NOT NULL,
                    requested_by INT NOT NULL,
                    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
                    admin_note TEXT NULL,
                    requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                    reviewed_by INT NULL,
                    reviewed_at TIMESTAMP NULL DEFAULT NULL,
                    PRIMARY KEY (id),
                    KEY idx_product_status (product_id, status),
                    KEY idx_status_requested_at (status, requested_at),
                    CONSTRAINT fk_product_image_requests_product
                        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
            );

            await pool.query(
                `CREATE TABLE IF NOT EXISTS sarga_product_links (
                    id INT NOT NULL AUTO_INCREMENT,
                    product_id INT NOT NULL,
                    name VARCHAR(150) NOT NULL,
                    url VARCHAR(1000) NOT NULL,
                    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_product_links_product (product_id),
                    CONSTRAINT fk_product_links_product
                        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
            );
        } catch (err) {
            console.warn('products migration warning:', err.message);
        }
    })();

    // Auto-create an inventory entry when a product is added to the Product Library
    async function autoCreateInventoryFromProduct(productId, productName, productCode, subcategoryId, slabs, companyName, companyCode, size, extraInv = {}) {
        // Check if already linked
        const [existing] = await pool.query('SELECT inventory_item_id FROM sarga_products WHERE id = ? AND inventory_item_id IS NOT NULL', [productId]);
        if (existing.length > 0) return;

        // Get category name from subcategory → category chain
        const [subRows] = await pool.query(
            `SELECT s.name AS sub_name, c.name AS cat_name
             FROM sarga_product_subcategories s
             JOIN sarga_product_categories c ON s.category_id = c.id
             WHERE s.id = ?`,
            [subcategoryId]
        );
        // Use subcategory name as inventory category (e.g., WOODEN MEMENTO)
        const inventoryCategory = subRows.length > 0 ? subRows[0].sub_name : null;

        // Extract sell_price from first slab unit_rate
        let sellPrice = 0;
        if (slabs && slabs.length > 0) {
            sellPrice = Number(slabs[0].unit_rate) || Number(slabs[0].base_value) || 0;
        }

        // Use product_code as SKU, or auto-generate from companyCode+name+size
        let sku = productCode || null;
        if (!sku) {
            const c = String(companyCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const p = String(productName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const s = String(size || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const parts = [c, p, s].filter(Boolean);
            if (parts.length > 0) sku = parts.join('-');
        }

        // Source code = company code (user-defined unique abbreviation)
        const sourceCode = String(companyCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
        const sizeCode = String(size || '').trim().toUpperCase() || null;

        // Check if inventory item with same name+category already exists
        const [existingInv] = await pool.query(
            'SELECT id FROM sarga_inventory WHERE name = ? AND (category = ? OR (category IS NULL AND ? IS NULL))',
            [productName, inventoryCategory, inventoryCategory]
        );

        let inventoryId;
        if (existingInv.length > 0) {
            inventoryId = existingInv[0].id;
        } else {
            const [invResult] = await pool.query(
                `INSERT INTO sarga_inventory (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, item_type, source_code, model_name, size_code, hsn, gst_rate, vendor_name)
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Retail', ?, ?, ?, ?, ?, ?)`,
                [
                    productName, sku, inventoryCategory, 
                    extraInv.unit || 'pcs', 
                    Number(extraInv.quantity) || 0, 
                    Number(extraInv.cost_price) || 0, 
                    Number(extraInv.sell_price) || sellPrice, 
                    sourceCode, productName, sizeCode,
                    extraInv.hsn || null,
                    Number(extraInv.gst_rate) || 0,
                    extraInv.vendor_name || null
                ]
            );
            inventoryId = invResult.insertId;

            // Auto-generate SKU if still none
            if (!sku) {
                const catPart = (inventoryCategory || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'INV';
                const autoSku = `${catPart}-${String(inventoryId).padStart(4, '0')}`;
                await pool.query('UPDATE sarga_inventory SET sku = ? WHERE id = ? AND sku IS NULL', [autoSku, inventoryId]);
            }
        }

        // Link product to inventory item
        await pool.query(
            'UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?',
            [inventoryId, productId]
        );

        console.log(`[AutoInventory] Created/linked inventory #${inventoryId} for product #${productId} (${productName})`);
    }

    // --- PRODUCT HIERARCHY & PRICING ROUTES ---

    // List Categories
    router.get('/product-categories', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT * FROM sarga_product_categories ORDER BY name ASC");
            res.json(rows);
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List All Products (paginated for sync/search)
    router.get('/products', authenticateToken, async (req, res) => {
        try {
            const { limit, offset, page, response } = paginate(req.query, req.query.page, req.query.limit);
            const search = req.query.search ? `%${req.query.search}%` : null;

            let where = 'WHERE p.is_active = 1';
            const params = [];
            
            if (search) {
                where += ' AND (p.name LIKE ? OR p.product_code LIKE ?)';
                params.push(search, search);
            }

            const baseFrom = `
                FROM sarga_products p
                LEFT JOIN sarga_product_subcategories s ON p.subcategory_id = s.id
                LEFT JOIN sarga_product_categories c ON s.category_id = c.id
                ${where}`;

            const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
            const [rows] = await pool.query(`
                SELECT p.*, s.name AS subcategory_name, c.name AS category_name
                ${baseFrom}
                ORDER BY p.name ASC
                LIMIT ? OFFSET ?
            `, [...params, limit, offset]);
            
            res.json(response(rows, total));
        } catch (err) {
            console.error('Get products error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Generate a unique company code (3-5 letters) that doesn't collide with existing ones
    router.get('/unique-company-code', authenticateToken, async (req, res) => {
        const name = String(req.query.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!name) return res.json({ code: '' });

        // Get all existing source_codes from inventory
        const [rows] = await pool.query('SELECT DISTINCT source_code FROM sarga_inventory WHERE source_code IS NOT NULL AND source_code != ""');
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

        // Fallback
        return res.json({ code: base3 });
    });

    // Add Category
    router.post('/product-categories', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
        const { name } = req.body;
        const imageUrl = req.file ? await fileToBase64(req.file.path) : null;
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
                imageUrl = await fileToBase64(req.file.path);
                const [old] = await pool.query("SELECT image_url FROM sarga_product_categories WHERE id = ?", [id]);
                if (old[0]?.image_url) await removeUploadFile(old[0].image_url).catch(() => {});
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
            const [rows] = await pool.query("SELECT image_url FROM sarga_product_categories WHERE id = ?", [req.params.id]);
            if (rows[0]?.image_url) await removeUploadFile(rows[0].image_url).catch(() => {});
            await pool.query("DELETE FROM sarga_product_categories WHERE id = ?", [req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, 'CATEGORY_DELETE', `Deleted product category #${req.params.id}`, { entity_type: 'product_category', entity_id: req.params.id });
            res.json({ message: 'Category deleted' });
        } catch (err) {
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
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List Subcategories for a Category
    router.get('/product-categories/:id/subcategories', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT * FROM sarga_product_subcategories WHERE category_id = ? ORDER BY name ASC", [req.params.id]);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Add Subcategory
    router.post('/product-subcategories', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
        const { category_id, name } = req.body;
        const imageUrl = req.file ? await fileToBase64(req.file.path) : null;
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
        const { name, category_id, image_url: existingImageUrl } = req.body;
        const { id } = req.params;
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
        try {
            let imageUrl;
            if (req.file) {
                imageUrl = await fileToBase64(req.file.path);
                const [old] = await pool.query("SELECT image_url FROM sarga_product_subcategories WHERE id = ?", [id]);
                if (old[0]?.image_url) await removeUploadFile(old[0].image_url).catch(() => {});
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
        try {
            const [rows] = await pool.query("SELECT image_url FROM sarga_product_subcategories WHERE id = ?", [req.params.id]);
            if (rows[0]?.image_url) await removeUploadFile(rows[0].image_url).catch(() => {});
            await pool.query("DELETE FROM sarga_product_subcategories WHERE id = ?", [req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, 'SUBCATEGORY_DELETE', `Deleted subcategory #${req.params.id}`, { entity_type: 'product_subcategory', entity_id: req.params.id });
            res.json({ message: 'Subcategory deleted' });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Toggle Subcategory Active/Inactive
    router.patch('/product-subcategories/:id/toggle-active', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT is_active FROM sarga_product_subcategories WHERE id = ?", [req.params.id]);
            if (!rows[0]) return res.status(404).json({ message: 'Subcategory not found' });
            const newState = rows[0].is_active ? 0 : 1;
            await pool.query("UPDATE sarga_product_subcategories SET is_active = ? WHERE id = ?", [newState, req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, newState ? 'SUBCATEGORY_ENABLE' : 'SUBCATEGORY_DISABLE', `${newState ? 'Enabled' : 'Disabled'} subcategory #${req.params.id}`, { entity_type: 'product_subcategory', entity_id: req.params.id });
            res.json({ message: newState ? 'Subcategory enabled' : 'Subcategory disabled', is_active: newState });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List Products for a Subcategory
    router.get('/product-subcategories/:id/products', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT * FROM sarga_products WHERE subcategory_id = ? ORDER BY name ASC", [req.params.id]);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Add Product with Slabs and Extras
    router.post('/products', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
        const { subcategory_id, name, product_code, calculation_type, description, inventory_item_id, isPhysicalProduct, company_name, company_code, size, extraInv } = req.body;
        const slabs = typeof req.body.slabs === 'string' ? JSON.parse(req.body.slabs) : req.body.slabs;
        const extras = typeof req.body.extras === 'string' ? JSON.parse(req.body.extras) : req.body.extras;
        const parsedExtraInv = typeof extraInv === 'string' ? JSON.parse(extraInv) : (extraInv || {});
        const imageUrl = req.file ? await fileToBase64(req.file.path) : null;
        const connection = await pool.getConnection();
        try {
            if (!subcategory_id) {
                return res.status(400).json({ message: 'Subcategory is required' });
            }
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
                [subcategory_id, String(name).trim(), product_code || null, company_name || null, company_code || null, size || null, calculation_type, description, imageUrl, has_paper_rate === 'true' || has_paper_rate === 1 ? 1 : 0, Number(paper_rate) || 0, has_double_side_rate === 'true' || has_double_side_rate === 1 ? 1 : 0, nextPos, inventory_item_id || null, isPhysicalProduct ? 1 : 0]
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
                    await autoCreateInventoryFromProduct(productId, String(name).trim(), product_code, subcategory_id, slabs, company_name, company_code, size, parsedExtraInv);
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
    router.put('/products/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('image'), async (req, res) => {
        const { id } = req.params;
        const { subcategory_id, name, product_code, company_name, company_code, size, calculation_type, description, has_paper_rate, paper_rate, has_double_side_rate, inventory_item_id, isPhysicalProduct } = req.body;
        const slabs = typeof req.body.slabs === 'string' ? JSON.parse(req.body.slabs) : req.body.slabs;
        const extras = typeof req.body.extras === 'string' ? JSON.parse(req.body.extras) : req.body.extras;
        const imageUrl = req.file ? await fileToBase64(req.file.path) : req.body.image_url;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            await connection.query(
                "UPDATE sarga_products SET subcategory_id = ?, name = ?, product_code = ?, company_name = ?, company_code = ?, size = ?, calculation_type = ?, description = ?, image_url = ?, has_paper_rate = ?, paper_rate = ?, has_double_side_rate = ?, inventory_item_id = ?, is_physical_product = ? WHERE id = ?",
                [subcategory_id, String(name).trim(), product_code || null, company_name || null, company_code || null, size || null, calculation_type, description, imageUrl, has_paper_rate === 'true' || has_paper_rate === 1 ? 1 : 0, Number(paper_rate) || 0, has_double_side_rate === 'true' || has_double_side_rate === 1 ? 1 : 0, inventory_item_id || null, isPhysicalProduct ? 1 : 0, id]
            );

            // Update Slabs: DELETE and INSERT is cleaner
            await connection.query("DELETE FROM sarga_product_slabs WHERE product_id = ?", [id]);
            if (slabs && slabs.length > 0) {
                for (const slab of slabs) {
                    await connection.query(
                        "INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate, offset_unit_rate, double_side_unit_rate) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [id, Number(slab.min_qty) || 0, (slab.max_qty === '' || slab.max_qty === null) ? null : Number(slab.max_qty), Number(slab.base_value) || 0, Number(slab.unit_rate) || 0, Number(slab.offset_unit_rate) || 0, Number(slab.double_side_unit_rate) || 0]
                    );
                }
            }

            // Update Extras: DELETE and INSERT
            await connection.query("DELETE FROM sarga_product_extras_template WHERE product_id = ?", [id]);
            if (extras && extras.length > 0) {
                for (const extra of extras) {
                    await connection.query(
                        "INSERT INTO sarga_product_extras_template (product_id, purpose, amount) VALUES (?, ?, ?)",
                        [id, extra.purpose, extra.amount]
                    );
                }
            }

            // Update Links: DELETE and INSERT
            const links = typeof req.body.links === 'string' ? JSON.parse(req.body.links) : (req.body.links || []);
            await connection.query("DELETE FROM sarga_product_links WHERE product_id = ?", [id]);
            if (links && links.length > 0) {
                for (const link of links) {
                    const linkName = String(link.name || '').trim();
                    const linkUrl = String(link.url || '').trim();
                    if (linkName && linkUrl) {
                        await connection.query(
                            "INSERT INTO sarga_product_links (product_id, name, url) VALUES (?, ?, ?)",
                            [id, linkName, linkUrl]
                        );
                    }
                }
            }

            await connection.commit();
            invalidateHierarchyCache();
            auditLog(req.user.id, 'PRODUCT_UPDATE', `Updated product #${id}: ${name}`, { entity_type: 'product', entity_id: id });
            res.json({ message: 'Product updated successfully' });
        } catch (err) {
            await connection.rollback();
            console.error('Update product error:', err);
            res.status(500).json({ message: 'Database error' });
        } finally {
            connection.release();
        }
    });

    // Delete Product
    router.delete('/products/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            // Check if the product has stock in inventory
            const [prodRows] = await pool.query("SELECT inventory_item_id FROM sarga_products WHERE id = ?", [req.params.id]);
            if (prodRows.length > 0 && prodRows[0].inventory_item_id) {
                const [invRows] = await pool.query("SELECT quantity FROM sarga_inventory WHERE id = ?", [prodRows[0].inventory_item_id]);
                if (invRows.length > 0 && Number(invRows[0].quantity) > 0) {
                    return res.status(400).json({ message: `Cannot delete product. It has ${invRows[0].quantity} unit(s) of stock remaining in inventory.` });
                }
            }

            await pool.query("DELETE FROM sarga_products WHERE id = ?", [req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, 'PRODUCT_DELETE', `Deleted product #${req.params.id}`, { entity_type: 'product', entity_id: req.params.id });
            res.json({ message: 'Product deleted successfully' });
        } catch (err) {
            console.error('Delete product error:', err);
            res.status(500).json({ message: err.message || 'Database error' });
        }
    });

    // Toggle Product Active/Inactive
    router.patch('/products/:id/toggle-active', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
        try {
            const [rows] = await pool.query("SELECT is_active FROM sarga_products WHERE id = ?", [req.params.id]);
            if (!rows[0]) return res.status(404).json({ message: 'Product not found' });
            const newState = rows[0].is_active ? 0 : 1;
            await pool.query("UPDATE sarga_products SET is_active = ? WHERE id = ?", [newState, req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, newState ? 'PRODUCT_ENABLE' : 'PRODUCT_DISABLE', `${newState ? 'Enabled' : 'Disabled'} product #${req.params.id}`, { entity_type: 'product', entity_id: req.params.id });
            res.json({ message: newState ? 'Product enabled' : 'Product disabled', is_active: newState });
        } catch (err) {
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

        const proposedImageUrl = `/uploads/${req.file.filename}`;

        try {
            const [productRows] = await pool.query(
                'SELECT id, name, image_url FROM sarga_products WHERE id = ? LIMIT 1',
                [productId]
            );
            const product = productRows[0];
            if (!product) {
                await removeUploadFile(proposedImageUrl).catch(() => {});
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
                await removeUploadFile(proposedImageUrl).catch(() => {});
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
            await removeUploadFile(proposedImageUrl).catch(() => {});
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

    // Get Full Product Details (including slabs and extras)
    router.get('/products/:id', authenticateToken, async (req, res) => {
        try {
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

            const [slabs] = await pool.query("SELECT * FROM sarga_product_slabs WHERE product_id = ? ORDER BY min_qty ASC", [product.id]);
            const [extras] = await pool.query("SELECT * FROM sarga_product_extras_template WHERE product_id = ?", [product.id]);
            const [links] = await pool.query("SELECT id, name, url FROM sarga_product_links WHERE product_id = ? ORDER BY id ASC", [product.id]);

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
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    return router;
};


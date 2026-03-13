const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { invalidateHierarchyCache } = require('./jobs');

module.exports = (upload, removeUploadFile) => {
    const router = require('express').Router();

    // Auto-create an inventory entry when a product is added to the Product Library
    async function autoCreateInventoryFromProduct(productId, productName, productCode, subcategoryId, slabs, companyName, size) {
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

        // Use product_code as SKU, or auto-generate from company+name+size
        let sku = productCode || null;
        if (!sku) {
            const c = String(companyName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 3);
            const p = String(productName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const s = String(size || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const parts = [c, p, s].filter(Boolean);
            if (parts.length > 0) sku = parts.join('-');
        }

        // Source code = company first 3 letters
        const sourceCode = String(companyName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 3) || null;
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
                `INSERT INTO sarga_inventory (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, item_type, source_code, model_name, size_code)
                 VALUES (?, ?, ?, 'pcs', 0, 0, 0, ?, 'Retail', ?, ?, ?)`,
                [productName, sku, inventoryCategory, sellPrice, sourceCode, productName, sizeCode]
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

    // Add Category
    router.post('/product-categories', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
        const { name } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
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
    router.put('/product-categories/:id', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
        const { name, image_url: existingImageUrl } = req.body;
        const { id } = req.params;
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
        try {
            let imageUrl;
            if (req.file) {
                imageUrl = `/uploads/${req.file.filename}`;
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
    router.delete('/product-categories/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
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
    router.patch('/product-categories/:id/toggle-active', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
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
    router.post('/product-subcategories', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
        const { category_id, name } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
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
    router.put('/product-subcategories/:id', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
        const { name, category_id, image_url: existingImageUrl } = req.body;
        const { id } = req.params;
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
        try {
            let imageUrl;
            if (req.file) {
                imageUrl = `/uploads/${req.file.filename}`;
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
    router.delete('/product-subcategories/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
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
    router.patch('/product-subcategories/:id/toggle-active', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
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
    router.post('/products', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
        const { subcategory_id, name, product_code, calculation_type, description, inventory_item_id, isPhysicalProduct, company_name, size } = req.body;
        const slabs = typeof req.body.slabs === 'string' ? JSON.parse(req.body.slabs) : req.body.slabs;
        const extras = typeof req.body.extras === 'string' ? JSON.parse(req.body.extras) : req.body.extras;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
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
                "INSERT INTO sarga_products (subcategory_id, name, product_code, calculation_type, description, image_url, has_paper_rate, paper_rate, has_double_side_rate, position, inventory_item_id, is_physical_product) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [subcategory_id, String(name).trim(), product_code || null, calculation_type, description, imageUrl, has_paper_rate === 'true' || has_paper_rate === 1 ? 1 : 0, Number(paper_rate) || 0, has_double_side_rate === 'true' || has_double_side_rate === 1 ? 1 : 0, nextPos, inventory_item_id || null, isPhysicalProduct ? 1 : 0]
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

            await connection.commit();
            invalidateHierarchyCache();

            // Auto-create inventory entry if not already linked to one
            if (!inventory_item_id) {
                try {
                    await autoCreateInventoryFromProduct(productId, String(name).trim(), product_code, subcategory_id, slabs, company_name, size);
                } catch (autoErr) {
                    console.error('Auto-create inventory from product failed (non-blocking):', autoErr.message);
                }
            }

            auditLog(req.user.id, 'PRODUCT_ADD', `Added product: ${name} (${calculation_type})`, { entity_type: 'product', entity_id: productId });
            res.status(201).json({ id: productId, message: 'Product added with slabs and extras' });
        } catch (err) {
            await connection.rollback();
            console.error('Add product error:', err);
            res.status(500).json({ message: 'Database error' });
        } finally {
            connection.release();
        }
    });

    // Update Product
    router.put('/products/:id', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
        const { id } = req.params;
        const { subcategory_id, name, product_code, calculation_type, description, has_paper_rate, paper_rate, has_double_side_rate, inventory_item_id, isPhysicalProduct } = req.body;
        const slabs = typeof req.body.slabs === 'string' ? JSON.parse(req.body.slabs) : req.body.slabs;
        const extras = typeof req.body.extras === 'string' ? JSON.parse(req.body.extras) : req.body.extras;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            await connection.query(
                "UPDATE sarga_products SET subcategory_id = ?, name = ?, product_code = ?, calculation_type = ?, description = ?, image_url = ?, has_paper_rate = ?, paper_rate = ?, has_double_side_rate = ?, inventory_item_id = ?, is_physical_product = ? WHERE id = ?",
                [subcategory_id, String(name).trim(), product_code || null, calculation_type, description, imageUrl, has_paper_rate === 'true' || has_paper_rate === 1 ? 1 : 0, Number(paper_rate) || 0, has_double_side_rate === 'true' || has_double_side_rate === 1 ? 1 : 0, inventory_item_id || null, isPhysicalProduct ? 1 : 0, id]
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
    router.delete('/products/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        try {
            await pool.query("DELETE FROM sarga_products WHERE id = ?", [req.params.id]);
            invalidateHierarchyCache();
            auditLog(req.user.id, 'PRODUCT_DELETE', `Deleted product #${req.params.id}`, { entity_type: 'product', entity_id: req.params.id });
            res.json({ message: 'Product deleted successfully' });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Toggle Product Active/Inactive
    router.patch('/products/:id/toggle-active', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
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
    router.delete('/products/:id/image', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
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
    router.put('/product-positions', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
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
    router.post('/product-usage/reset', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
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

    // Get Full Product Details (including slabs and extras)
    router.get('/products/:id', authenticateToken, async (req, res) => {
        try {
            const [products] = await pool.query("SELECT * FROM sarga_products WHERE id = ?", [req.params.id]);
            const product = products[0];
            if (!product) return res.status(404).json({ message: 'Product not found' });

            const [slabs] = await pool.query("SELECT * FROM sarga_product_slabs WHERE product_id = ? ORDER BY min_qty ASC", [product.id]);
            const [extras] = await pool.query("SELECT * FROM sarga_product_extras_template WHERE product_id = ?", [product.id]);

            res.json({ ...product, slabs, extras });
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    return router;
};


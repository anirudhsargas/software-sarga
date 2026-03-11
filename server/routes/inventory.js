const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, addInventorySchema } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { extractBillData } = require('../utils/ocrParser');

// Configure Multer for file uploads (temporary storage)
const upload = multer({ dest: os.tmpdir() });

const normalizeScannedCode = (value) => String(value || '').trim().replace(/\s+/g, '').toUpperCase();

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

// --- INVENTORY ROUTES (Admin Only) ---

// List Inventory
router.get('/inventory', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'), async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req);
        const usePagination = !!req.query.page;

        // Show all inventory items, joined with products if they exist
        const countQuery = `SELECT COUNT(*) as cnt FROM sarga_inventory`;
        const dataQuery = `SELECT i.*, p.id as linked_product_id FROM sarga_inventory i LEFT JOIN sarga_products p ON i.id = p.inventory_item_id ORDER BY i.created_at DESC`;

        if (usePagination) {
            const [[{ cnt }]] = await pool.query(countQuery);
            const [rows] = await pool.query(dataQuery + ' LIMIT ? OFFSET ?', [limit, offset]);
            return res.json(paginatedResponse(rows, cnt, page, limit));
        }

        const [rows] = await pool.query(dataQuery);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Lookup inventory item by SKU — used by billing QR scan and sidebar scanner
router.get('/inventory/by-sku/:sku', authenticateToken, async (req, res) => {
    try {
        const rawSku = req.params.sku || '';
        const { normalized, item } = await findInventoryByScannedCode(rawSku);
        if (!item) return res.status(404).json({ message: `No item found for code: ${rawSku}` });

        // Use stored mrp first; fall back to formula
        const costPrice = Number(item.cost_price) || 0;
        const gstRate = Number(item.gst_rate) || 0;
        const gstAmount = (costPrice * gstRate) / 100;
        const calculatedMrp = (costPrice + gstAmount) * 2;
        const finalMrp = Number(item.mrp) || calculatedMrp || 0;

        res.json({ ...item, scanned_code: normalized, mrp: finalMrp % 1 === 0 ? finalMrp.toFixed(0) : finalMrp.toFixed(2) });
    } catch (err) {
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
    } catch (err) {
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

// Add Inventory Item
// Auto-generate SKU from category prefix + item ID
function generateAutoSku(category, itemId) {
    const prefix = (category || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
    return `${prefix || 'INV'}-${String(itemId).padStart(4, '0')}`;
}

router.post('/inventory', authenticateToken, authorizeRoles('Admin', 'Accountant'), validate(addInventorySchema), async (req, res) => {
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, product_id, source_code, model_name, size_code, item_type, vendor_name, vendor_contact, purchase_link } = req.body;

    try {
        // 1. Check if an item with the same SKU already exists
        let existingItem = null;
        if (sku) {
            const [skuMatches] = await pool.query("SELECT id, quantity FROM sarga_inventory WHERE sku = ?", [sku]);
            if (skuMatches.length > 0) existingItem = skuMatches[0];
        }

        // 2. If no SKU match, check if an item with the same Name and Category already exists
        if (!existingItem) {
            const [nameMatches] = await pool.query(
                "SELECT id, quantity FROM sarga_inventory WHERE name = ? AND (category = ? OR (category IS NULL AND ? IS NULL))",
                [name, category || null, category || null]
            );
            if (nameMatches.length > 0) existingItem = nameMatches[0];
        }

        if (existingItem) {
            // Update existing item: increment quantity and update other details to latest
            const newQuantity = Number(existingItem.quantity) + (Number(quantity) || 0);
            await pool.query(
                `UPDATE sarga_inventory 
                 SET quantity = ?, sku = COALESCE(?, sku), category = ?, unit = ?, reorder_level = ?, cost_price = ?, sell_price = ?, hsn = ?, discount = ?, gst_rate = ?,
                     source_code = ?, model_name = ?, size_code = ?, item_type = ?, vendor_name = ?, vendor_contact = ?, purchase_link = ?
                 WHERE id = ?`,
                [
                    newQuantity,
                    sku || null,
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
            if (product_id) {
                await pool.query(
                    "UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?",
                    [inventoryId, product_id]
                );
            }

            auditLog(req.user.id, 'INVENTORY_UPDATE_MERGE', `Merged ${quantity} unit(s) into item ${name} (ID: ${inventoryId})`);
            return res.json({ id: inventoryId, message: 'Item quantity updated and merged' });
        }

        // 3. Normal Insert if no existing item found
        const [result] = await pool.query(
            `INSERT INTO sarga_inventory (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, source_code, model_name, size_code, item_type, vendor_name, vendor_contact, purchase_link)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            , [
                name,
                sku || null,
                category || null,
                unit || 'pcs',
                Number(quantity) || 0,
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
        let finalSku = sku || null;
        if (!finalSku) {
            finalSku = generateAutoSku(category, inventoryId);
            await pool.query("UPDATE sarga_inventory SET sku = ? WHERE id = ? AND sku IS NULL", [finalSku, inventoryId]);
        }

        // If a product_id was provided, link it to this inventory item
        if (product_id) {
            await pool.query(
                "UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?",
                [inventoryId, product_id]
            );
        }

        auditLog(req.user.id, 'INVENTORY_ADD', `Added new item ${name} (${finalSku || 'no-sku'})`);
        res.status(201).json({ id: inventoryId, sku: finalSku, message: 'Inventory item added' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Inventory Item
router.put('/inventory/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, product_id, source_code, model_name, size_code, item_type, vendor_name, vendor_contact, purchase_link } = req.body;

    try {
        await pool.query(
            `UPDATE sarga_inventory
             SET name = ?, sku = ?, category = ?, unit = ?, quantity = ?, reorder_level = ?, cost_price = ?, sell_price = ?, hsn = ?, discount = ?, gst_rate = ?,
                 source_code = ?, model_name = ?, size_code = ?, item_type = ?, vendor_name = ?, vendor_contact = ?, purchase_link = ?
             WHERE id = ?`
            , [
                name,
                sku || null,
                category || null,
                unit || 'pcs',
                Number(quantity) || 0,
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

        // Management of product link
        if (product_id) {
            await pool.query(
                "UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?",
                [id, product_id]
            );
        }

        auditLog(req.user.id, 'INVENTORY_UPDATE', `Updated item ${id} (${name})`);
        res.json({ message: 'Inventory item updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Consume Inventory Item
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

        auditLog(req.user.id, 'INVENTORY_CONSUME', `Consumed ${qtyToConsume} of item ${id} (${rows[0].name})`);
        res.json({ message: 'Stock consumed successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Restock Inventory Item
router.post('/inventory/:id/restock', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { id } = req.params;
    const { quantity_received, cost_price, notes } = req.body;

    if (!quantity_received || Number(quantity_received) <= 0) {
        return res.status(400).json({ message: 'Invalid restock quantity' });
    }

    try {
        // Calculate days since last reorder
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

        auditLog(req.user.id, 'INVENTORY_RESTOCK', `Restocked ${received} of item ${id} (${item.name}). Days gap: ${daysSince}`);
        res.json({ message: 'Restocked successfully', days_since_last_reorder: daysSince });
    } catch (err) {
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

        // Prepare label data based on user requested quantities
        const labelData = [];
        for (const reqItem of items) {
            const dbItem = itemMap[reqItem.id];
            if (dbItem) {
                const qty = Math.min(Number(reqItem.quantity_to_print) || 1, 5000); // Cap at 5000 per item to prevent extreme memory overload
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
        const pageWidth = 595.28; // A4 point width (approx 210mm)
        const pageHeight = 841.89; // A4 point height (approx 297mm)

        // Converts mm to points (1mm = 2.83465 points)
        const mmToPt = (mm) => mm * 2.83465;

        const margin = mmToPt(4);
        const colGap = mmToPt(3);
        const rowGap = 0;
        const labelWidth = mmToPt(48);
        const labelHeight = mmToPt(24);
        const cols = 4;
        const rows = 12;
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
            // Use stored MRP first; fallback to formula: (Cost + GST) * 2
            const costPrice = Number(item.cost_price) || 0;
            const gstRate = Number(item.gst_rate) || 0;
            const gstAmount = (costPrice * gstRate) / 100;
            const calculatedMrp = (costPrice + gstAmount) * 2;
            const mrp = Number(item.mrp) || calculatedMrp || 0;

            // QR encodes just the unique product SKU (or fallback ID) for direct scanning in billing
            const qrData = normalizeScannedCode(item.sku) || `ITEM-${item.id}`;

            const qrCodeBuffer = await QRCode.toBuffer(qrData, {
                margin: 2, // Slightly larger quiet zone improves decode reliability on printed labels
                errorCorrectionLevel: 'H', // High error correction helps Google Lens read it easily
                width: 256 // Higher source resolution helps with cleaner downscaling in PDF
            });

            // Layout Content — new design: Category / Name / MRP + QR
            const textAreaW = labelWidth - mmToPt(19);

            // Category name 
            const categoryLabel = (item.category || 'Inventory').toUpperCase();
            const catFontSize = categoryLabel.length > 18 ? 5.5 : 7;
            doc.fontSize(catFontSize).font('Helvetica-Bold').fillColor('#000000');
            doc.text(categoryLabel, x + 2, y + 5, { width: textAreaW, lineBreak: false });

            // Product model name (or name if model missing)
            const modelNameText = (item.model_name || item.name).toUpperCase();
            // Allow more characters since we are wrapping to 2 lines
            const shortName = modelNameText.length > 50 ? modelNameText.substring(0, 49) + '…' : modelNameText;
            doc.fontSize(6).font('Helvetica').fillColor('#000000');
            // Use lineBreak: true and specify a restricted height for up to 2 lines
            doc.text(shortName, x + 2, y + 15, { width: textAreaW, lineBreak: true, height: 16 });

            // MRP — positioned tightly below the worst-case 2-line name spacing
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000000');
            doc.text(`MRP: Rs. ${mrp % 1 === 0 ? mrp.toFixed(0) : mrp.toFixed(2)}`, x + 2, y + 30, { width: textAreaW, lineBreak: false });


            // Place QR Code (right side)
            // Adjusted position due to increased QR size (16mm width)
            doc.image(qrCodeBuffer, x + labelWidth - mmToPt(18), y + 2, {
                width: mmToPt(16)
            });

            // Unique code text below QR
            const uniqueCode = qrData;
            doc.fontSize(5).font('Helvetica').fillColor('#000000');
            doc.text(uniqueCode, x + labelWidth - mmToPt(18), y + mmToPt(18), { width: mmToPt(16), align: 'center', lineBreak: false });
        }

        doc.end();

    } catch (err) {
        console.error('Label gen error:', err);
        res.status(500).json({ message: 'Error generating PDF' });
    }
});

// Delete Inventory Item
router.delete('/inventory/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;

    try {
        // Check current stock and unlink any product references before deleting
        const [rows] = await pool.query('SELECT name, quantity FROM sarga_inventory WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ message: 'Inventory item not found' });

        // Unlink products that reference this inventory item
        await pool.query('UPDATE sarga_products SET inventory_item_id = NULL, is_physical_product = 0 WHERE inventory_item_id = ?', [id]);

        await pool.query("DELETE FROM sarga_inventory WHERE id = ?", [id]);
        auditLog(req.user.id, 'INVENTORY_DELETE', `Deleted item ${id} (${rows[0].name}), had qty=${rows[0].quantity}`);
        res.json({ message: 'Inventory item deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Stock Verification Monthly
router.get('/stock-verification/:month', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { month } = req.params; // Expected format: YYYY-MM
        const [y, m] = month.split('-').map(Number);
        const startDate = new Date(y, m - 1, 1).toISOString().split('T')[0];
        const lastDay = new Date(y, m, 0).getDate();
        const endDate =`${month}-${String(lastDay).padStart(2, '0')}`;

        // 1. Low Stock Items (quantity < reorder_level)
        const [lowStockItems] = await pool.query(`
            SELECT id, name, category, quantity, reorder_level, unit, cost_price
            FROM sarga_inventory
            WHERE quantity <= reorder_level
            ORDER BY (reorder_level - quantity) DESC
            LIMIT 50
        `);

        // 2. Monthly Consumption
        const [monthlyConsumption] = await pool.query(`
            SELECT 
                ic.inventory_item_id,
                i.name,
                i.category,
                SUM(ic.quantity_consumed) as total_consumed,
                i.cost_price,
                COUNT(DISTINCT DATE(ic.created_at)) as days_consumed
            FROM sarga_inventory_consumption ic
            JOIN sarga_inventory i ON ic.inventory_item_id = i.id
            WHERE DATE(ic.created_at) BETWEEN ? AND ?
            GROUP BY ic.inventory_item_id, i.id, i.name, i.category, i.cost_price
            ORDER BY total_consumed DESC
            LIMIT 50
        `, [startDate, endDate]);

        // 3. Category-wise Summary
        const [categoryStats] = await pool.query(`
            SELECT 
                category,
                COUNT(*) as item_count,
                SUM(quantity) as total_quantity,
                SUM(quantity * cost_price) as total_value,
                SUM(IF(quantity <= reorder_level, 1, 0)) as low_stock_count
            FROM sarga_inventory
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY total_value DESC
        `);

        // 4. Stock Movements (IN/OUT)
        const [stockMovements] = await pool.query(`
            SELECT 
                type,
                COUNT(*) as count,
                SUM(quantity) as total_qty,
                DATE(created_at) as movement_date
            FROM sarga_inventory_stock
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY type, movement_date
            ORDER BY movement_date DESC
        `, [startDate, endDate]);

        // 5. Discrepancy Detection (fast consumption relative to purchases)
        const [potentialDiscrepancies] = await pool.query(`
            SELECT 
                i.id,
                i.name,
                i.category,
                i.quantity as current_qty,
                i.reorder_level,
                COALESCE(SUM(CASE WHEN ism.type = 'IN' THEN ism.quantity ELSE 0 END), 0) as purchases_this_month,
                COALESCE(SUM(CASE WHEN ism.type = 'OUT' THEN ism.quantity ELSE 0 END), 0) as sales_this_month,
                COALESCE(SUM(ic.quantity_consumed), 0) as consumed_this_month
            FROM sarga_inventory i
            LEFT JOIN sarga_inventory_stock ism ON i.id = ism.item_id AND DATE(ism.created_at) BETWEEN ? AND ?
            LEFT JOIN sarga_inventory_consumption ic ON i.id = ic.inventory_item_id AND DATE(ic.created_at) BETWEEN ? AND ?
            GROUP BY i.id, i.name, i.category, i.quantity, i.reorder_level
            HAVING (consumed_this_month > 0 OR purchases_this_month > 0 OR sales_this_month > 0)
            ORDER BY consumed_this_month DESC
            LIMIT 50
        `, [startDate, endDate, startDate, endDate]);

        res.json({
            period: month,
            low_stock_items: lowStockItems,
            monthly_consumption: monthlyConsumption,
            category_stats: categoryStats,
            stock_movements: stockMovements,
            potential_discrepancies: potentialDiscrepancies,
            summary: {
                total_low_stock: lowStockItems.length,
                total_consumption_items: monthlyConsumption.length,
                total_category_value: categoryStats.reduce((s, c) => s + (Number(c.total_value) || 0), 0),
                total_items_with_movement: potentialDiscrepancies.length
            }
        });
    } catch (err) {
        console.error('Stock verification error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;

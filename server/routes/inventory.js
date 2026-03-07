const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, addInventorySchema } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

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
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// Add Inventory Item
router.post('/inventory', authenticateToken, authorizeRoles('Admin', 'Accountant'), validate(addInventorySchema), async (req, res) => {
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, product_id } = req.body;

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
                 SET quantity = ?, sku = COALESCE(?, sku), category = ?, unit = ?, reorder_level = ?, cost_price = ?, sell_price = ?, hsn = ?, discount = ?, gst_rate = ?
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
            `INSERT INTO sarga_inventory (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                Number(gst_rate) || 0
            ]
        );

        const inventoryId = result.insertId;

        // If a product_id was provided, link it to this inventory item
        if (product_id) {
            await pool.query(
                "UPDATE sarga_products SET inventory_item_id = ?, is_physical_product = 1 WHERE id = ?",
                [inventoryId, product_id]
            );
        }

        auditLog(req.user.id, 'INVENTORY_ADD', `Added new item ${name} (${sku || 'no-sku'})`);
        res.status(201).json({ id: inventoryId, message: 'Inventory item added' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// Update Inventory Item
router.put('/inventory/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, product_id } = req.body;

    try {
        await pool.query(
            `UPDATE sarga_inventory
             SET name = ?, sku = ?, category = ?, unit = ?, quantity = ?, reorder_level = ?, cost_price = ?, sell_price = ?, hsn = ?, discount = ?, gst_rate = ?
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
        res.status(500).json({ message: 'Database error', error: err.message });
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
                const qty = Math.min(Number(reqItem.quantity_to_print) || 1, 100); // Cap at 100 per item
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

            // QR Code generation
            // Formula: (Cost Price + GST) * 2
            const gstAmount = (item.cost_price * item.gst_rate) / 100;
            const mrp = (Number(item.cost_price) + gstAmount) * 2;

            const qrData = JSON.stringify({
                name: item.name,
                sku: item.sku,
                mrp: mrp.toFixed(2),
                hsn: item.hsn
            });

            const qrCodeBuffer = await QRCode.toBuffer(qrData, {
                margin: 0,
                width: mmToPt(12)
            });

            // Layout Content
            doc.fontSize(7).font('Helvetica-Bold');
            doc.text(item.name.substring(0, 25), x + 2, y + 2, { width: labelWidth - mmToPt(14), height: 10 });

            doc.fontSize(6).font('Helvetica');
            doc.text(`SKU: ${item.sku || 'N/A'}`, x + 2, y + 10);
            doc.text(`MRP: Rs. ${mrp.toFixed(2)}`, x + 2, y + 18);
            if (item.hsn) doc.text(`HSN: ${item.hsn}`, x + 2, y + 26);

            // Place QR Code
            doc.image(qrCodeBuffer, x + labelWidth - mmToPt(13), y + 2, { width: mmToPt(11) });

            // Small Company identifier if space allows
            doc.fontSize(5).text('SARGA INVENTORY', x + 2, y + labelHeight - 7, { characterSpacing: 1 });
        }

        doc.end();

    } catch (err) {
        console.error('Label gen error:', err);
        res.status(500).json({ message: 'Error generating PDF', error: err.message });
    }
});

// Delete Inventory Item
router.delete('/inventory/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query("DELETE FROM sarga_inventory WHERE id = ?", [id]);
        auditLog(req.user.id, 'INVENTORY_DELETE', `Deleted item ${id}`);
        res.json({ message: 'Inventory item deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

module.exports = router;

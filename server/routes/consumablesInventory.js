const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, consumablesInventorySchema } = require('../middleware/validate');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadToCloudinary } = require('../helpers/cloudinaryUpload');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const BRANCH_MAP = {
    perambra: 'Perambra',
    meppayur: 'Meppayur',
    Perambra: 'Perambra',
    Meppayur: 'Meppayur'
};

const normalizeBranch = (branch) => {
    if (!branch || branch === 'All' || branch === 'all') return null;
    return BRANCH_MAP[branch] || null;
};

const normalizeCategory = (category) => {
    if (!category || category === 'all' || category === 'All') return null;
    return String(category).toLowerCase();
};

const CONSUMABLE_FIELDS = `id, name, category, unit, gsm, size_name, brand, finish, color,
    quantity_in_stock, reorder_level, min_stock_level, max_stock_level, location,
    unit_cost, current_rate_id, supplier_name, supplier_id, sku, branch, notes, last_updated`;

async function recordRateChange(connection, consumableId, rate, supplierName, userId, opts = {}) {
    const effectiveDate = opts.effective_date || new Date().toISOString().split('T')[0];
    const supplierId = opts.supplier_id || null;
    const purchaseOrderRef = opts.purchase_order_ref || null;
    const notes = opts.notes || null;

    const [rateResult] = await connection.query(
        `INSERT INTO consumable_rate_history (consumable_id, rate, effective_date, supplier_name, supplier_id, purchase_order_ref, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [consumableId, rate, effectiveDate, supplierName || null, supplierId, purchaseOrderRef, notes, userId]
    );

    await connection.query(
        'UPDATE consumables_inventory SET current_rate_id = ?, unit_cost = ? WHERE id = ?',
        [rateResult.insertId, rate, consumableId]
    );
    return rateResult.insertId;
}

const mapBranchIdToEnum = (branchId, branchName) => {
    if (!branchId && !branchName) return 'common';
    const name = String(branchName || '').toLowerCase();
    if (name.includes('perambra') || branchId === 5) return 'perambra';
    if (name.includes('meppayur') || branchId === 4) return 'meppayur';
    return 'common';
};

const mapBranchIdToConsumableEnum = (branchId, branchName) => {
    const name = String(branchName || '').toLowerCase();
    if (name.includes('meppayur') || branchId === 4) return 'Meppayur';
    return 'Perambra';
};

// ─── LIST consumables with enhanced fields ───
router.get('/inventory/consumables', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { category, branch, search, low_stock } = req.query;
        const normalizedCategory = normalizeCategory(category);
        const normalizedBranch = normalizeBranch(branch);

        let query = `SELECT ${CONSUMABLE_FIELDS} FROM consumables_inventory WHERE 1=1`;
        const params = [];

        if (normalizedCategory) {
            query += ' AND category = ?';
            params.push(normalizedCategory);
        }
        if (normalizedBranch) {
            query += ' AND branch = ?';
            params.push(normalizedBranch);
        }
        if (search) {
            query += ' AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR size_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (low_stock === 'true') {
            query += ' AND quantity_in_stock <= reorder_level';
        }
        query += ' ORDER BY name ASC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Consumables inventory fetch error:', err);
        res.status(500).json({ message: 'Failed to fetch consumables inventory' });
    }
});

// ─── GET single consumable with current rate ───
router.get('/inventory/consumables/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [[item]] = await pool.query(`
            SELECT c.*, cr.rate as current_rate, cr.effective_date as rate_effective_date,
                   cr.supplier_name as rate_supplier, cr.purchase_order_ref
            FROM consumables_inventory c
            LEFT JOIN consumable_rate_history cr ON c.current_rate_id = cr.id
            WHERE c.id = ?
        `, [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Consumable not found' });
        res.json(item);
    } catch (err) {
        console.error('Fetch consumable error:', err);
        res.status(500).json({ message: 'Failed to fetch consumable' });
    }
});

// ─── ADD consumable ───
router.post('/inventory/consumables', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const {
            name, category, unit, gsm, size_name, brand, finish, color,
            quantity_in_stock, reorder_level, min_stock_level, max_stock_level, location,
            unit_cost, supplier_name, supplier_id, sku, branch, notes
        } = req.body;

        const [result] = await connection.query(
            `INSERT INTO consumables_inventory
            (name, category, unit, gsm, size_name, brand, finish, color,
             quantity_in_stock, reorder_level, min_stock_level, max_stock_level, location,
             unit_cost, supplier_name, supplier_id, sku, branch, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, category, unit, gsm || null, size_name || null, brand || null, finish || null, color || null,
             quantity_in_stock || 0, reorder_level || 0, min_stock_level || null, max_stock_level || null, location || null,
             unit_cost || 0, supplier_name || null, supplier_id || null, sku || null, branch, notes || null]
        );

        // Create initial rate record if unit_cost is provided
        if (unit_cost > 0) {
            await recordRateChange(connection, result.insertId, unit_cost, supplier_name, req.user.id, {
                supplier_id
            });
        }

        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_INV_ADD', `Added consumable: ${name} (${category}) in ${branch}`);
        res.status(201).json({ id: result.insertId, message: 'Consumable inventory item added' });
    } catch (err) {
        await connection.rollback();
        console.error('Consumables create error:', err);
        res.status(500).json({ message: 'Failed to add consumable inventory item' });
    } finally {
        connection.release();
    }
});

// ─── UPDATE consumable ───
router.put('/inventory/consumables/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const {
            name, category, unit, gsm, size_name, brand, finish, color,
            quantity_in_stock, reorder_level, min_stock_level, max_stock_level, location,
            unit_cost, supplier_name, supplier_id, sku, branch, notes
        } = req.body;

        // Select oldItem before updating
        const [[oldItem]] = await connection.query('SELECT unit_cost, current_rate_id FROM consumables_inventory WHERE id = ? FOR UPDATE', [id]);
        if (!oldItem) {
            await connection.rollback();
            return res.status(404).json({ message: 'Consumable item not found' });
        }

        await connection.query(
            `UPDATE consumables_inventory SET
             name = ?, category = ?, unit = ?, gsm = ?, size_name = ?, brand = ?, finish = ?, color = ?,
             quantity_in_stock = ?, reorder_level = ?, min_stock_level = ?, max_stock_level = ?, location = ?,
             unit_cost = ?, supplier_name = ?, supplier_id = ?, sku = ?, branch = ?, notes = ?
             WHERE id = ?`,
            [name, category, unit, gsm || null, size_name || null, brand || null, finish || null, color || null,
             quantity_in_stock || 0, reorder_level || 0, min_stock_level || null, max_stock_level || null, location || null,
             unit_cost || 0, supplier_name || null, supplier_id || null, sku || null, branch, notes || null, id]
        );

        // If unit_cost changed, create a new rate history record
        if (Number(oldItem.unit_cost) !== Number(unit_cost) && unit_cost > 0) {
            await recordRateChange(connection, id, unit_cost, supplier_name, req.user.id, {
                supplier_id
            });
        }

        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_INV_UPDATE', `Updated consumable: ${name} (ID: ${id})`);
        res.json({ message: 'Consumable inventory item updated' });
    } catch (err) {
        await connection.rollback();
        console.error('Consumables update error:', err);
        res.status(500).json({ message: 'Failed to update consumable inventory item' });
    } finally {
        connection.release();
    }
});

// ─── DELETE consumable ───
router.delete('/inventory/consumables/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.query('DELETE FROM consumables_inventory WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Consumable item not found' });
        auditLog(req.user.id, 'CONSUMABLE_INV_DELETE', `Deleted consumable inventory ID: ${id}`);
        res.json({ message: 'Consumable inventory item deleted' });
    } catch (err) {
        console.error('Consumables delete error:', err);
        res.status(500).json({ message: 'Failed to delete consumable inventory item' });
    }
});

// ─── ADJUST stock ───
router.put('/inventory/consumables/:id/adjust', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const reason = String(req.body.reason || '').trim();
    const rawDelta = req.body.quantity_delta ?? req.body.delta ?? req.body.change;
    const quantityDelta = Number(rawDelta);
    const adjustmentType = req.body.adjustment_type || (quantityDelta >= 0 ? 'INWARD' : 'OUTWARD');
    const { branch_id, reference_type, reference_id } = req.body;

    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
        return res.status(400).json({ message: 'quantity_delta must be a non-zero number' });
    }
    if (!reason) return res.status(400).json({ message: 'Adjustment reason is required' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT name, quantity_in_stock FROM consumables_inventory WHERE id = ? FOR UPDATE', [id]);
        if (!rows.length) { await connection.rollback(); return res.status(404).json({ message: 'Consumable item not found' }); }

        const item = rows[0];
        const updatedStock = Number(item.quantity_in_stock) + quantityDelta;
        if (updatedStock < 0) { await connection.rollback(); return res.status(400).json({ message: 'Insufficient stock for this adjustment' }); }

        await connection.query('UPDATE consumables_inventory SET quantity_in_stock = ? WHERE id = ?', [updatedStock, id]);
        await connection.query(
            `INSERT INTO consumables_inventory_adjustments
             (consumable_id, adjustment_type, branch_id, quantity_delta, reason, reference_type, reference_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, adjustmentType, branch_id || null, quantityDelta, reason, reference_type || null, reference_id || null, req.user.id]
        );

        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_INV_ADJUST', `Adjusted ${item.name} by ${quantityDelta}. Reason: ${reason}`);
        res.json({ message: 'Stock adjusted successfully', quantity_in_stock: updatedStock });
    } catch (err) {
        await connection.rollback();
        console.error('Consumables adjust error:', err);
        res.status(500).json({ message: 'Failed to adjust consumable stock' });
    } finally {
        connection.release();
    }
});

// ─── RATE HISTORY endpoints ───

// GET rate history for a consumable
router.get('/inventory/consumables/:id/rates', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [rates] = await pool.query(`
            SELECT rh.*, s.name as created_by_name
            FROM consumable_rate_history rh
            LEFT JOIN sarga_staff s ON rh.created_by = s.id
            WHERE rh.consumable_id = ?
            ORDER BY rh.effective_date DESC, rh.created_at DESC
        `, [req.params.id]);
        res.json(rates);
    } catch (err) {
        console.error('Fetch rate history error:', err);
        res.status(500).json({ message: 'Failed to fetch rate history' });
    }
});

// POST new rate for a consumable
router.post('/inventory/consumables/:id/rates', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const { rate, effective_date, supplier_name, supplier_id, purchase_order_ref, notes } = req.body;
    if (!rate || rate <= 0) return res.status(400).json({ message: 'Valid rate is required' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rateResult] = await connection.query(
            `INSERT INTO consumable_rate_history (consumable_id, rate, effective_date, supplier_name, supplier_id, purchase_order_ref, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, rate, effective_date || new Date().toISOString().split('T')[0], supplier_name || null, supplier_id || null, purchase_order_ref || null, notes || null, req.user.id]
        );
        // Update current rate on consumable
        await connection.query('UPDATE consumables_inventory SET current_rate_id = ?, unit_cost = ? WHERE id = ?', [rateResult.insertId, rate, id]);
        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_RATE_ADD', `Added rate ₹${rate} for consumable ID: ${id}`);
        res.status(201).json({ id: rateResult.insertId, message: 'Rate added successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Add rate error:', err);
        res.status(500).json({ message: 'Failed to add rate' });
    } finally {
        connection.release();
    }
});

// ─── PURCHASE HISTORY endpoints ───

// GET purchase history for a consumable
router.get('/inventory/consumables/:id/purchases', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [purchases] = await pool.query(`
            SELECT cp.*, s.name as created_by_name, b.name as branch_name
            FROM consumable_purchases cp
            LEFT JOIN sarga_staff s ON cp.created_by = s.id
            LEFT JOIN sarga_branches b ON cp.branch_id = b.id
            WHERE cp.consumable_id = ?
            ORDER BY cp.purchase_date DESC, cp.created_at DESC
        `, [req.params.id]);
        res.json(purchases);
    } catch (err) {
        console.error('Fetch purchases error:', err);
        res.status(500).json({ message: 'Failed to fetch purchases' });
    }
});

// POST record a purchase
router.post('/inventory/consumables/:id/purchases', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { id } = req.params;
    const { quantity, unit_price, supplier_name, supplier_id, purchase_date, invoice_ref, branch_id, notes } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ message: 'Valid quantity is required' });
    if (!unit_price || unit_price <= 0) return res.status(400).json({ message: 'Valid unit_price is required' });

    const total_amount = Number(quantity) * Number(unit_price);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.query(
            `INSERT INTO consumable_purchases (consumable_id, quantity, unit_price, total_amount, supplier_name, supplier_id, purchase_date, invoice_ref, branch_id, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, quantity, unit_price, total_amount, supplier_name || null, supplier_id || null, purchase_date || new Date().toISOString().split('T')[0], invoice_ref || null, branch_id || null, notes || null, req.user.id]
        );
        // Also add stock
        await connection.query('UPDATE consumables_inventory SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?', [Number(quantity), id]);
        await connection.query(
            `INSERT INTO consumables_inventory_adjustments (consumable_id, adjustment_type, branch_id, quantity_delta, reason, reference_type, reference_id, created_by)
             VALUES (?, 'INWARD', ?, ?, ?, 'PURCHASE', ?, ?)`,
            [id, branch_id || null, Number(quantity), `Purchase: ${invoice_ref || 'Direct'}`, result.insertId, req.user.id]
        );
        // Also create rate entry if unit_price differs from current
        const [[current]] = await connection.query('SELECT unit_cost FROM consumables_inventory WHERE id = ?', [id]);
        if (!current || Number(current.unit_cost) !== Number(unit_price)) {
            await recordRateChange(connection, id, unit_price, supplier_name, req.user.id, {
                supplier_id,
                purchase_order_ref: invoice_ref,
                effective_date: purchase_date || new Date().toISOString().split('T')[0],
                notes: `Purchase: ${invoice_ref || ''}`
            });
        }
        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_PURCHASE', `Recorded purchase of ${quantity} of consumable ID: ${id}`);
        res.status(201).json({ id: result.insertId, message: 'Purchase recorded successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Record purchase error:', err);
        res.status(500).json({ message: 'Failed to record purchase' });
    } finally {
        connection.release();
    }
});

// ─── GET bulk current rates (for multi-item quoting) ───
router.post('/inventory/consumables/bulk-rates', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.json([]);
        const placeholders = ids.map(() => '?').join(',');
        const [rows] = await pool.query(`
            SELECT c.id, c.name, c.unit_cost as current_rate, c.unit
            FROM consumables_inventory c
            WHERE c.id IN (${placeholders})
        `, ids);
        res.json(rows);
    } catch (err) {
        console.error('Bulk rates error:', err);
        res.status(500).json({ message: 'Failed to fetch rates' });
    }
});

// ─── GET current rate for integration with quotations/job costing ───
router.get('/inventory/consumables/:id/current-rate', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [[item]] = await pool.query(`
            SELECT c.id, c.name, c.unit_cost as current_rate, c.unit,
                   cr.effective_date, cr.supplier_name
            FROM consumables_inventory c
            LEFT JOIN consumable_rate_history cr ON c.current_rate_id = cr.id
            WHERE c.id = ?
        `, [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Consumable not found' });
        res.json({
            id: item.id,
            name: item.name,
            rate: Number(item.current_rate) || 0,
            unit: item.unit,
            effective_date: item.effective_date,
            supplier_name: item.supplier_name
        });
    } catch (err) {
        console.error('Fetch current rate error:', err);
        res.status(500).json({ message: 'Failed to fetch current rate' });
    }
});

// ─── GET low stock alerts ───
router.get('/inventory/consumables/low-stock', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { category, branch, search } = req.query;
        const normalizedCategory = normalizeCategory(category);
        const normalizedBranch = normalizeBranch(branch);

        let query = `SELECT ${CONSUMABLE_FIELDS} FROM consumables_inventory WHERE quantity_in_stock <= reorder_level`;
        const params = [];

        if (normalizedCategory) { query += ' AND category = ?'; params.push(normalizedCategory); }
        if (normalizedBranch) { query += ' AND branch = ?'; params.push(normalizedBranch); }
        if (search) { query += ' AND name LIKE ?'; params.push(`%${search}%`); }

        query += ' ORDER BY (quantity_in_stock / NULLIF(reorder_level, 0)) ASC, name ASC';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Consumables low-stock fetch error:', err);
        res.status(500).json({ message: 'Failed to fetch low stock consumables' });
    }
});

// ─── GET stats / summary for dashboard KPIs ───
router.get('/inventory/consumables/stats/summary', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [[stats]] = await pool.query(`
            SELECT
                COUNT(*) as total_items,
                SUM(CASE WHEN quantity_in_stock <= reorder_level THEN 1 ELSE 0 END) as low_stock_count,
                COALESCE(SUM(quantity_in_stock * unit_cost), 0) as total_value,
                COUNT(DISTINCT category) as category_count,
                COUNT(DISTINCT supplier_name) as supplier_count
            FROM consumables_inventory
        `);
        res.json(stats);
    } catch (err) {
        console.error('Consumables stats error:', err);
        res.status(500).json({ message: 'Failed to fetch stats' });
    }
});

// ─── CONFIRM consumables bill & create payables + restock ───
router.post('/inventory/consumables/bill-confirm', authenticateToken, authorizeRoles('Admin', 'Accountant'), upload.single('file'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const vendor_id = Number(req.body.vendor_id);
        const invoice_ref = req.body.invoice_ref;
        const bill_date = req.body.bill_date;
        const due_date = req.body.due_date;
        const branch_id = Number(req.body.branch_id);
        const line_items = typeof req.body.line_items === 'string' ? JSON.parse(req.body.line_items) : req.body.line_items;

        if (!vendor_id) return res.status(400).json({ message: 'Vendor is required' });
        if (!bill_date) return res.status(400).json({ message: 'Bill date is required' });
        if (!due_date) return res.status(400).json({ message: 'Due date is required' });
        if (!branch_id) return res.status(400).json({ message: 'Branch is required' });
        if (!Array.isArray(line_items) || line_items.length === 0) {
            return res.status(400).json({ message: 'Line items are required' });
        }

        // Handle uploaded file
        let filePath = null;
        let fileName = null;
        let fileType = null;
        let fileSizeKb = null;

        if (req.file) {
            try {
                const cloudinaryResult = await uploadToCloudinary(req.file.path, 'bills-documents');
                filePath = cloudinaryResult.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary upload error for consumables bill:', uploadError);
                filePath = `/uploads/${req.file.filename}`;
            }
            fileName = req.file.originalname;
            fileType = req.file.mimetype;
            fileSizeKb = Math.ceil(req.file.size / 1024);
        }

        // 1. Fetch branch name and vendor name
        const [[branchRow]] = await connection.query('SELECT name FROM sarga_branches WHERE id = ?', [branch_id]);
        const branchName = branchRow ? branchRow.name : '';
        const branchEnum = mapBranchIdToConsumableEnum(branch_id, branchName);
        const invoiceBranchEnum = mapBranchIdToEnum(branch_id, branchName);

        const [[vendorRow]] = await connection.query('SELECT name, gst_number FROM sarga_vendors WHERE id = ?', [vendor_id]);
        const supplierName = vendorRow ? vendorRow.name : 'Unknown';

        // Compute total amount
        const totalAmount = line_items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0);

        // 2. Insert into sarga_vendor_bills
        const autoDesc = line_items.slice(0, 5).map(i => i.name || 'Consumable').join(', ');
        const [vbResult] = await connection.query(
            `INSERT INTO sarga_vendor_bills (vendor_id, branch_id, bill_number, bill_date, total_amount, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [vendor_id, branch_id, invoice_ref || null, bill_date, totalAmount, `Consumables: ${autoDesc}`]
        );
        const sargaVendorBillId = vbResult.insertId;

        // 3. Insert into vendor_invoices for payables tracking
        await connection.query(
            `INSERT INTO vendor_invoices 
             (vendor_id, invoice_number, invoice_date, due_date, amount, gst_amount, total_amount, paid_amount, status, payment_status, branch, notes)
             VALUES (?, ?, ?, ?, ?, 0.00, ?, 0.00, 'pending', 'unpaid', ?, ?)`,
            [vendor_id, invoice_ref || null, bill_date, due_date, totalAmount, totalAmount, invoiceBranchEnum, `Consumables Bill Upload (Items: ${line_items.length})`]
        );

        // 4. Save file metadata in sarga_bills_documents if file was uploaded
        if (filePath) {
            await connection.query(
                `INSERT INTO sarga_bills_documents 
                 (branch_id, document_type, related_tab, related_id, vendor_name, vendor_gstin, bill_number, bill_date,
                  amount, subtotal, tax_amount, file_path, file_name, file_type, file_size_kb, description, uploaded_by,
                  extraction_confidence, extraction_status)
                 VALUES (?, 'Vendor Bill', 'vendors', ?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, 0.95, 'completed')`,
                [
                    branch_id,
                    sargaVendorBillId,
                    supplierName,
                    vendorRow?.gst_number || null,
                    invoice_ref || null,
                    bill_date,
                    totalAmount,
                    totalAmount,
                    filePath,
                    fileName,
                    fileType,
                    fileSizeKb,
                    `Consumables Bill: ${autoDesc}`,
                    req.user.id
                ]
            );
        }

        // 5. Process each line item
        for (const item of line_items) {
            const quantity = Number(item.quantity);
            const unitPrice = Number(item.unit_price);
            const lineTotal = quantity * unitPrice;
            let consumableId = item.consumable_id;

            if (item.is_new_consumable) {
                // Insert new consumable item
                const [newResult] = await connection.query(
                    `INSERT INTO consumables_inventory
                     (name, category, unit, gsm, size_name, brand, quantity_in_stock, reorder_level, unit_cost, supplier_name, supplier_id, branch, notes)
                     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`,
                    [
                        item.name,
                        item.category || 'other',
                        item.unit || 'piece',
                        item.gsm || null,
                        item.size_name || null,
                        item.brand || null,
                        unitPrice,
                        supplierName,
                        vendor_id,
                        branchEnum,
                        item.notes || 'Created via Bill Upload'
                    ]
                );
                consumableId = newResult.insertId;

                // Create initial rate record
                await recordRateChange(connection, consumableId, unitPrice, supplierName, req.user.id, {
                    supplier_id: vendor_id,
                    purchase_order_ref: invoice_ref,
                    effective_date: bill_date,
                    notes: 'Initial rate from confirmed bill'
                });
            } else {
                // Existing consumable - update rate if price changed
                const [[currItem]] = await connection.query('SELECT unit_cost FROM consumables_inventory WHERE id = ? FOR UPDATE', [consumableId]);
                if (!currItem) {
                    throw new Error(`Consumable with ID ${consumableId} not found in inventory`);
                }
                if (Number(currItem.unit_cost) !== unitPrice) {
                    await recordRateChange(connection, consumableId, unitPrice, supplierName, req.user.id, {
                        supplier_id: vendor_id,
                        purchase_order_ref: invoice_ref,
                        effective_date: bill_date,
                        notes: `Rate update via bill: ${invoice_ref || ''}`
                    });
                }
            }

            // Create purchase record
            const [purchaseResult] = await connection.query(
                `INSERT INTO consumable_purchases 
                 (consumable_id, quantity, unit_price, total_amount, supplier_name, supplier_id, purchase_date, invoice_ref, branch_id, notes, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [consumableId, quantity, unitPrice, lineTotal, supplierName, vendor_id, bill_date, invoice_ref || null, branch_id, 'Confirmed bill item', req.user.id]
            );
            const purchaseId = purchaseResult.insertId;

            // Insert into sarga_vendor_bill_items
            await connection.query(
                `INSERT INTO sarga_vendor_bill_items 
                 (bill_id, inventory_item_id, consumable_id, consumable_purchase_id, quantity, unit_cost, total_cost)
                 VALUES (?, NULL, ?, ?, ?, ?, ?)`,
                [sargaVendorBillId, consumableId, purchaseId, quantity, unitPrice, lineTotal]
            );

            // Update inventory stock
            await connection.query(
                `UPDATE consumables_inventory 
                 SET quantity_in_stock = quantity_in_stock + ? 
                 WHERE id = ?`,
                [quantity, consumableId]
            );

            // Insert inventory adjustment log
            await connection.query(
                `INSERT INTO consumables_inventory_adjustments 
                 (consumable_id, adjustment_type, branch_id, quantity_delta, reason, reference_type, reference_id, created_by)
                 VALUES (?, 'INWARD', ?, ?, ?, 'VENDOR_BILL', ?, ?)`,
                [consumableId, branch_id, quantity, `Vendor Bill: ${invoice_ref || 'Direct'}`, sargaVendorBillId, req.user.id]
            );
        }

        await connection.commit();
        auditLog(req.user.id, 'CONSUMABLE_BILL_CONFIRM', `Confirmed consumables bill: ${invoice_ref || 'N/A'} (Vendor ID: ${vendor_id})`);
        res.status(201).json({ success: true, message: 'Consumables bill confirmed and stock updated' });
    } catch (err) {
        await connection.rollback();
        console.error('Confirm consumables bill error:', err);
        res.status(500).json({ message: 'Failed to confirm consumables bill: ' + err.message });
    } finally {
        connection.release();
    }
});

module.exports = router;

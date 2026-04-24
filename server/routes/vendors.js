const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog, getTodayDate } = require('../helpers');
const { validate, addVendorSchema } = require('../middleware/validate');
const { paginate } = require('../helpers/pagination');

const VENDOR_COLUMNS = [
    'id',
    'name',
    'type',
    'contact_person',
    'phone',
    'address',
    'branch_id',
    'order_link',
    'gstin',
    'created_at'
].join(', ');

const PAYMENT_STATEMENT_COLUMNS = [
    'p.id',
    'p.branch_id',
    'p.type',
    'p.payee_name',
    'p.amount',
    'p.payment_method',
    'p.reference_number',
    'p.description',
    'p.payment_date',
    'p.vendor_id',
    'p.payment_status',
    'p.created_at'
].join(', ');

const VENDOR_BILL_STATEMENT_COLUMNS = [
    'b.id',
    'b.vendor_id',
    'b.branch_id',
    'b.bill_number',
    'b.bill_date',
    'b.total_amount',
    'b.description',
    'b.created_at'
].join(', ');

function normalizeVendorName(name = '') {
    return String(name || '').replace(/\s+/g, ' ').trim();
}

function stripFiscalSuffix(name = '') {
    return normalizeVendorName(name).replace(/\s*-\s*\(\d{4}\s*[-/]\s*\d{4}\)\s*$/i, '').trim();
}

function vendorMatchKey(name = '') {
    return stripFiscalSuffix(name).toLowerCase();
}

// --- VENDOR ROUTES ---

// List Vendors / Payees
router.get('/vendors', authenticateToken, async (req, res) => {
    const { type } = req.query;
    try {
        const { limit, offset, page, response } = paginate(req.query, req.query.page, req.query.limit);

        let query = `FROM sarga_vendors`;
        const params = [];
        const conditions = [];

        if (type) {
            conditions.push("type = ?");
            params.push(type);
        }

        // All vendors are universally visible so they don't need to be defined per branch
        // Front Office and Admin users alike can select any vendor
        // (Bills and Payments are still correctly tied to the branch where the action happens)

        const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${query}${where}`, params);
        const [rows] = await pool.query(`SELECT ${VENDOR_COLUMNS} ${query}${where} ORDER BY name ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
        
        res.json(response(rows, total));
    } catch (err) {
        console.error('List vendors error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Vendor / Payee
router.post('/vendors', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addVendorSchema), async (req, res) => {
    const { name, type, contact_person, phone, address, branch_id, order_link, gstin } = req.body;
    // For non-admins/accountants, ensure they can only add to their own branch
    const finalBranchId = (['Admin', 'Accountant'].includes(req.user.role) ? branch_id : req.user.branch_id) || null;

    try {
        const [existing] = await pool.query("SELECT id FROM sarga_vendors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [name]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Payee name already exists' });
        }

        const [result] = await pool.query(
            "INSERT INTO sarga_vendors (name, type, contact_person, phone, address, branch_id, order_link, gstin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [name, type || 'Vendor', contact_person, phone, address, finalBranchId, order_link, gstin]
        );
        res.json({ id: result.insertId, message: 'Payee added successfully' });
        auditLog(req.user.id, 'VENDOR_ADD', `Added vendor: ${name} (${type})`, { entity_type: 'vendor', entity_id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Payee name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Vendor / Payee
router.put('/vendors/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { id } = req.params;
    const { name, type, contact_person, phone, address, branch_id, order_link, gstin } = req.body;

    try {
        // Enforce branch constraint for updates if not admin or accountant
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            const [existing] = await pool.query("SELECT branch_id FROM sarga_vendors WHERE id = ?", [id]);
            if (existing[0] && existing[0].branch_id !== null && existing[0].branch_id !== req.user.branch_id) {
                return res.status(403).json({ message: 'Access denied to this payee' });
            }
        }

        const finalBranchId = (['Admin', 'Accountant'].includes(req.user.role) ? branch_id : req.user.branch_id) || null;

        const [existing] = await pool.query("SELECT id FROM sarga_vendors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?", [name, id]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Payee name already exists' });
        }

        await pool.query(
            "UPDATE sarga_vendors SET name = ?, type = ?, contact_person = ?, phone = ?, address = ?, branch_id = ?, order_link = ?, gstin = ? WHERE id = ?",
            [name, type, contact_person, phone, address, finalBranchId, order_link, gstin, id]
        );
        auditLog(req.user.id, 'VENDOR_UPDATE', `Updated vendor #${id}: ${name}`, { entity_type: 'vendor', entity_id: id });
        res.json({ message: 'Payee updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Payee name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// --- QUICK PURCHASE RECORDING ---

// Record a quick purchase (without inventory items)
router.post('/vendor-purchases', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { vendor_id, amount, bill_number, bill_date, description, branch_id } = req.body;
    const finalBranchId = ['Admin', 'Accountant'].includes(req.user.role) ? (branch_id || req.user.branch_id) : req.user.branch_id;

    if (!vendor_id || !amount || Number(amount) <= 0) {
        return res.status(400).json({ message: 'Vendor and amount are required' });
    }

    try {
        const [result] = await pool.query(
            "INSERT INTO sarga_vendor_bills (vendor_id, branch_id, bill_number, bill_date, total_amount, description) VALUES (?, ?, ?, ?, ?, ?)",
            [vendor_id, finalBranchId, bill_number || null, bill_date || getTodayDate(), Number(amount), description || null]
        );

        // SYNC WITH GLOBAL PAYMENTS TABLE
        const [[vendor]] = await pool.query('SELECT name FROM sarga_vendors WHERE id = ?', [vendor_id]);
        await pool.query(`
            INSERT INTO sarga_payments 
            (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, vendor_id) 
            VALUES (?, 'Vendor', ?, ?, 'Cash', ?, 0, ?, ?, ?)
        `, [
            finalBranchId,
            vendor?.name || 'Vendor',
            amount,
            amount,
            null,
            `Quick Purchase${description ? ': ' + description : ''}`,
            bill_date || new Date(),
            vendor_id
        ]);

        auditLog(req.user.id, 'VENDOR_PURCHASE', `Quick purchase ₹${amount} for vendor ${vendor_id}`);
        res.status(201).json({ id: result.insertId, message: 'Purchase recorded' });
    } catch (err) {
        console.error('Quick purchase error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// --- VENDOR BILL ROUTES ---

// List Vendor Bills
router.get('/vendor-bills', authenticateToken, async (req, res) => {
    const { vendor_id, branch_id } = req.query;
    try {
        const { limit, offset, page, response } = paginate(req.query, req.query.page, req.query.limit);

        let where = '';
        const params = [];
        if (vendor_id) {
            where += " AND b.vendor_id = ?";
            params.push(vendor_id);
        }
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            where += " AND b.branch_id = ?";
            params.push(req.user.branch_id);
        } else if (branch_id) {
            where += " AND b.branch_id = ?";
            params.push(branch_id);
        }

        const baseFrom = `
            FROM sarga_vendor_bills b
            JOIN sarga_vendors v ON b.vendor_id = v.id
            JOIN sarga_branches br ON b.branch_id = br.id
            WHERE 1=1 ${where}`;

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
        const [rows] = await pool.query(`
            SELECT b.*, v.name as vendor_name, br.name as branch_name
            ${baseFrom} ORDER BY b.bill_date DESC, b.created_at DESC LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        res.json(response(rows, total));
    } catch (err) {
        console.error('List vendor bills error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Full Vendor Bill Details (bill + items + linked document)
router.get('/vendor-bills/:id/full', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const [billRows] = await pool.query(
            `SELECT b.*, v.name as vendor_name, br.name as branch_name
             FROM sarga_vendor_bills b
             JOIN sarga_vendors v ON b.vendor_id = v.id
             JOIN sarga_branches br ON b.branch_id = br.id
             WHERE b.id = ?
             LIMIT 1`,
            [id]
        );

        if (!billRows.length) {
            return res.status(404).json({ message: 'Vendor bill not found' });
        }

        const bill = billRows[0];
        if (!['Admin', 'Accountant'].includes(req.user.role) && Number(bill.branch_id) !== Number(req.user.branch_id)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const [items] = await pool.query(
            `SELECT i.id, i.bill_id, i.inventory_item_id, i.quantity, i.unit_cost, i.total_cost,
                    inv.name as item_name, inv.sku as item_sku, inv.unit as item_unit
             FROM sarga_vendor_bill_items i
             LEFT JOIN sarga_inventory inv ON inv.id = i.inventory_item_id
             WHERE i.bill_id = ?
             ORDER BY i.id ASC`,
            [id]
        );

        const [candidateDocs] = await pool.query(
            `SELECT bd.id, bd.branch_id, bd.document_type, bd.vendor_name, bd.bill_number, bd.bill_date,
                    bd.amount, bd.file_path, bd.file_name, bd.file_type, bd.description, bd.created_at
             FROM sarga_bills_documents bd
             WHERE bd.document_type = 'Vendor Bill'
               AND bd.bill_date = ?
               AND (bd.bill_number = ? OR (? IS NULL AND bd.bill_number IS NULL))
               AND ABS(COALESCE(bd.amount, 0) - ?) < 0.01
             ORDER BY bd.created_at DESC
             LIMIT 25`,
            [bill.bill_date, bill.bill_number || null, bill.bill_number || null, Number(bill.total_amount) || 0]
        );

        const billVendorKey = vendorMatchKey(bill.vendor_name);
        const document = candidateDocs.find((doc) => vendorMatchKey(doc.vendor_name) === billVendorKey) || null;

        res.json({
            bill,
            items,
            document
        });
    } catch (err) {
        console.error('Vendor bill full details error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Vendor Bill
router.post('/vendor-bills', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { vendor_id, bill_number, bill_date, items, branch_id } = req.body;
    const finalBranchId = ['Admin', 'Accountant'].includes(req.user.role) ? (branch_id || req.user.branch_id) : req.user.branch_id;

    if (!items || !items.length) return res.status(400).json({ message: 'No items in bill' });

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const total_amount = items.reduce((sum, item) => sum + (Number(item.total_cost) || 0), 0);

        const [billResult] = await connection.query(
            "INSERT INTO sarga_vendor_bills (vendor_id, branch_id, bill_number, bill_date, total_amount) VALUES (?, ?, ?, ?, ?)",
            [vendor_id, finalBranchId, bill_number, bill_date, total_amount]
        );

        const billId = billResult.insertId;

        for (const item of items) {
            await connection.query(
                "INSERT INTO sarga_vendor_bill_items (bill_id, inventory_item_id, quantity, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?)",
                [billId, item.inventory_item_id, item.quantity, item.unit_cost, item.total_cost]
            );

            // SYNC WITH INVENTORY: Increase stock
            await connection.query(
                "UPDATE sarga_inventory SET quantity = quantity + ? WHERE id = ?",
                [item.quantity, item.inventory_item_id]
            );

            // Auto-generate SKU for items that don't have one yet
            const [[invItem]] = await connection.query("SELECT sku, category, source_code, model_name, size_code, name FROM sarga_inventory WHERE id = ?", [item.inventory_item_id]);
            if (invItem && !invItem.sku) {
                const company = String(invItem.source_code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                const product = String(invItem.model_name || invItem.name || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, '');
                const size = String(invItem.size_code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                let autoSku;
                if (company || product) {
                    const companyPart = company.substring(0, 3) || (invItem.category || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'INV';
                    const parts = [companyPart];
                    if (product) parts.push(product);
                    if (size) parts.push(size);
                    autoSku = parts.join('-');
                } else {
                    const prefix = (invItem.category || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'INV';
                    autoSku = `${prefix}-${String(item.inventory_item_id).padStart(4, '0')}`;
                }
                await connection.query("UPDATE sarga_inventory SET sku = ? WHERE id = ? AND sku IS NULL", [autoSku, item.inventory_item_id]);
            }
        }

        await connection.commit();
        
        // Fetch updated items with SKUs for label suggestion
        const itemIds = items.map(i => i.inventory_item_id);
        const [updatedItems] = await pool.query(
            "SELECT id, name, sku, quantity FROM sarga_inventory WHERE id IN (?)", [itemIds]
        );
        const labelSuggestions = items.map(i => {
            const inv = updatedItems.find(u => u.id === Number(i.inventory_item_id));
            return { inventory_item_id: i.inventory_item_id, name: inv?.name, sku: inv?.sku, quantity_added: i.quantity };
        });

        auditLog(req.user.id, 'VENDOR_BILL_ADD', `Added bill ${bill_number} for vendor ${vendor_id}, total ${total_amount}`);
        res.status(201).json({ id: billId, label_suggestions: labelSuggestions, message: 'Bill recorded and inventory updated' });
    } catch (err) {
        await connection.rollback();
        console.error('Vendor bill error:', err);
        res.status(500).json({ message: 'Database error and rollback' });
    } finally {
        connection.release();
    }
});

// Payee Statement (Transaction History)
router.get('/vendors/:id/statement', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const [payments] = await pool.query(`
            SELECT ${PAYMENT_STATEMENT_COLUMNS}, b.name as branch_name, 'Payment' as entry_type
            FROM sarga_payments p
            JOIN sarga_branches b ON p.branch_id = b.id
            WHERE p.vendor_id = ?
            ORDER BY p.payment_date DESC, p.created_at DESC
        `, [id]);

        const [bills] = await pool.query(`
            SELECT ${VENDOR_BILL_STATEMENT_COLUMNS}, br.name as branch_name, 'Purchase' as entry_type
            FROM sarga_vendor_bills b
            JOIN sarga_branches br ON b.branch_id = br.id
            WHERE b.vendor_id = ?
            ORDER BY b.bill_date DESC, b.created_at DESC
        `, [id]);

        const [payee] = await pool.query(`SELECT ${VENDOR_COLUMNS} FROM sarga_vendors WHERE id = ?`, [id]);

        // Compute outstanding balance
        const totalPurchases = bills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
        const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
        const outstandingBalance = totalPurchases - totalPaid;

        // Combine and sort by date
        const transactions = [...payments, ...bills].sort((a, b) => {
            const dateA = new Date(a.payment_date || a.bill_date);
            const dateB = new Date(b.payment_date || b.bill_date);
            return dateB - dateA;
        });

        res.json({
            payee: payee[0],
            transactions: transactions,
            summary: {
                total_purchases: totalPurchases,
                total_paid: totalPaid,
                outstanding_balance: outstandingBalance
            }
        });
    } catch (err) {
        console.error('Statement error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Aggregated items purchased from a vendor
router.get('/vendors/:id/items', authenticateToken, async (req, res) => {
    const vendorId = req.params.id;
    try {
        // Branch visibility: non-admin/accountant users only see their branch
        let branchClause = '';
        const params = [];
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            branchClause = ' AND b.branch_id = ?';
            params.push(req.user.branch_id);
        } else if (req.query.branch_id) {
            branchClause = ' AND b.branch_id = ?';
            params.push(req.query.branch_id);
        }

        // Aggregate quantities and fetch last purchase info per inventory item
        const sql = `
            SELECT i.inventory_item_id as inventory_id, IFNULL(inv.name, '') as item_name, IFNULL(inv.sku, '') as sku,
                   SUM(i.quantity) as total_purchased,
                   (
                     SELECT ib.unit_cost FROM sarga_vendor_bill_items ib
                     JOIN sarga_vendor_bills bb ON ib.bill_id = bb.id
                     WHERE ib.inventory_item_id = i.inventory_item_id AND bb.vendor_id = ? ${branchClause}
                     ORDER BY bb.bill_date DESC, ib.id DESC LIMIT 1
                   ) as last_unit_cost,
                   (
                     SELECT bb.bill_date FROM sarga_vendor_bill_items ib2
                     JOIN sarga_vendor_bills bb ON ib2.bill_id = bb.id
                     WHERE ib2.inventory_item_id = i.inventory_item_id AND bb.vendor_id = ? ${branchClause}
                     ORDER BY bb.bill_date DESC, ib2.id DESC LIMIT 1
                   ) as last_bill_date,
                   (
                     SELECT bb.id FROM sarga_vendor_bill_items ib3
                     JOIN sarga_vendor_bills bb ON ib3.bill_id = bb.id
                     WHERE ib3.inventory_item_id = i.inventory_item_id AND bb.vendor_id = ? ${branchClause}
                     ORDER BY bb.bill_date DESC, ib3.id DESC LIMIT 1
                   ) as last_bill_id
            FROM sarga_vendor_bill_items i
            JOIN sarga_vendor_bills b ON i.bill_id = b.id
            LEFT JOIN sarga_inventory inv ON inv.id = i.inventory_item_id
            WHERE b.vendor_id = ? ${branchClause}
            GROUP BY i.inventory_item_id
            ORDER BY last_bill_date DESC, total_purchased DESC
        `;

        // params order: for each subquery vendorId + optional branch, then vendorId + optional branch, then vendorId + optional branch, then main vendorId + optional branch
        const allParams = [vendorId];
        if (branchClause) allParams.push(...params);
        allParams.push(vendorId);
        if (branchClause) allParams.push(...params);
        allParams.push(vendorId);
        if (branchClause) allParams.push(...params);
        allParams.push(vendorId);
        if (branchClause) allParams.push(...params);

        const [rows] = await pool.query(sql, allParams);
        const mapped = rows.map(r => ({
            inventory_id: r.inventory_id,
            item_name: r.item_name,
            sku: r.sku,
            total_purchased: Number(r.total_purchased || 0),
            last_unit_cost: r.last_unit_cost != null ? Number(r.last_unit_cost) : null,
            last_bill_date: r.last_bill_date || null,
            last_bill_id: r.last_bill_id || null
        }));

        res.json({ items: mapped });
    } catch (err) {
        console.error('Vendor items error:', err);
        res.status(500).json({ message: 'Failed to fetch vendor items' });
    }
});

// Delete Vendor (Admin only)
router.delete('/vendors/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if vendor has any bills or payments
        const [[billCount]] = await pool.query(
            'SELECT COUNT(*) as count FROM sarga_vendor_bills WHERE vendor_id = ?',
            [id]
        );
        const [[paymentCount]] = await pool.query(
            'SELECT COUNT(*) as count FROM sarga_payments WHERE vendor_id = ?',
            [id]
        );

        if (Number(billCount.count) > 0 || Number(paymentCount.count) > 0) {
            return res.status(400).json({
                error: 'Cannot delete vendor with existing bills or payments. Please archive instead.'
            });
        }

        await pool.query('DELETE FROM sarga_vendors WHERE id = ?', [id]);
        auditLog(req.user.id, 'DELETE', `Deleted vendor ID ${id}`);
        res.json({ message: 'Vendor deleted successfully' });
    } catch (err) {
        console.error('Delete vendor error:', err);
        res.status(500).json({ error: 'Failed to delete vendor' });
    }
});

module.exports = router;


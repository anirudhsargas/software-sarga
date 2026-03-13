const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, addVendorSchema } = require('../middleware/validate');

// --- VENDOR ROUTES ---

// List Vendors / Payees
router.get('/vendors', authenticateToken, async (req, res) => {
    const { type } = req.query;
    const { role, branch_id } = req.user;
    try {
        let query = "SELECT * FROM sarga_vendors";
        const params = [];
        const conditions = [];

        if (type) {
            conditions.push("type = ?");
            params.push(type);
        }

        // Branch-wise visibility
        if (!['Admin', 'Accountant'].includes(role)) {
            conditions.push("(branch_id IS NULL OR branch_id = ?)");
            params.push(branch_id);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY name ASC";
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Vendor / Payee
router.post('/vendors', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addVendorSchema), async (req, res) => {
    const { name, type, contact_person, phone, address, branch_id, order_link, gstin } = req.body;
    // For non-admins/accountants, ensure they can only add to their own branch
    const finalBranchId = (['Admin', 'Accountant'].includes(req.user.role) ? branch_id : req.user.branch_id) || null;

    try {
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
            [vendor_id, finalBranchId, bill_number || null, bill_date || new Date().toISOString().split('T')[0], Number(amount), description || null]
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
        let query = `
            SELECT b.*, v.name as vendor_name, br.name as branch_name
            FROM sarga_vendor_bills b
            JOIN sarga_vendors v ON b.vendor_id = v.id
            JOIN sarga_branches br ON b.branch_id = br.id
            WHERE 1=1
        `;
        const params = [];
        if (vendor_id) {
            query += " AND b.vendor_id = ?";
            params.push(vendor_id);
        }
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            query += " AND b.branch_id = ?";
            params.push(req.user.branch_id);
        } else if (branch_id) {
            query += " AND b.branch_id = ?";
            params.push(branch_id);
        }
        query += " ORDER BY b.bill_date DESC, b.created_at DESC";
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
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
            SELECT p.*, b.name as branch_name, 'Payment' as entry_type
            FROM sarga_payments p
            JOIN sarga_branches b ON p.branch_id = b.id
            WHERE p.vendor_id = ?
            ORDER BY p.payment_date DESC, p.created_at DESC
        `, [id]);

        const [bills] = await pool.query(`
            SELECT b.*, br.name as branch_name, 'Purchase' as entry_type
            FROM sarga_vendor_bills b
            JOIN sarga_branches br ON b.branch_id = br.id
            WHERE b.vendor_id = ?
            ORDER BY b.bill_date DESC, b.created_at DESC
        `, [id]);

        const [payee] = await pool.query("SELECT * FROM sarga_vendors WHERE id = ?", [id]);

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


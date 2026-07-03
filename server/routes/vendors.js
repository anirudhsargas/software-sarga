/* VENDOR ROUTES INDEX
 * GET    /api/vendors                          (line 108)  - List all vendors
 * GET    /api/vendors/:id                      (line 152)  - Vendor detail
 * GET    /api/vendors/:id/items                (line 209)  - Items purchased from vendor
 * POST   /api/vendors                          (line 234)  - Create vendor
 * PUT    /api/vendors/:id                      (line 293)  - Update vendor
 * DELETE /api/vendors/:id                      (line 358)  - Delete vendor
 * GET    /api/vendors/dashboard/stats          (line 401)  - Dashboard statistics
 * GET    /api/vendor-invoices                  (line 538)  - List invoices
 * POST   /api/vendor-invoices                  (line 609)  - Create invoice
 * PUT    /api/vendor-invoices/:id              (line 612)  - Update invoice
 * POST   /api/vendor-payments                  (line 615)  - Record payment
 * GET    /api/vendors/:id/spend-trend          (line 618)  - Spend trend
 * POST   /api/vendor-invoices/:id/upload-bill  (line 707)  - Upload bill attachment
 * GET    /api/vendors/:id/bills                (line 764)  - List vendor bills
 * GET    /api/vendor-invoices/:id/bills        (line 803)  - Invoice bill attachments
 * DELETE /api/vendor-bill-attachments/:id      (line 828)  - Delete bill attachment
 * POST   /api/vendors/:id/upload-statement     (line 859)  - Upload bank statement CSV
 * POST   /api/vendor-statements/:id/reconcile  (line 1053) - Reconcile statement
 * GET    /api/vendor-statements/:id/result     (line 1174) - Reconciliation result
 * GET    /api/vendors/:id/ledger               (line 1420) - Vendor ledger
 * GET    /api/vendors/:id/ledger/pdf           (auto)      - Styled PDFKit statement download/print
 * GET    /api/vendors/:id/balance              (line 1457) - Current balance
 * GET    /api/vendors/summary                  (line 1472) - Summary totals
 * GET    /api/vendors/:id/payments             (line 1503) - List payments
 * POST   /api/vendors/:id/payments             (line 1521) - Record payment (by vendor)
 * PUT    /api/vendor-payments/:paymentId       (line 1524) - Update payment
 * DELETE /api/vendor-payments/:paymentId       (line 1596) - Delete payment
 * (dup)  /api/vendors/:id/bills                (line 1656) - List bills (ledger)
 * POST   /api/vendors/:id/bills                (line 1668) - Create bill
 * PUT    /api/vendor-bills/:billId             (line 1671) - Update bill
 * GET    /api/vendors/payment-audit            (line 1674) - Payment audit log
 * POST   /api/vendors/:id/recalculate          (line 1716) - Recalculate balance
 */
const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, addVendorSchema, addInvoiceSchema, addVendorPaymentSchema } = require('../middleware/validate');
const { paginate: _paginate } = require('../helpers/pagination');
const multer = require('multer');
const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');
const logger = require('../helpers/logger');

// Log the loaded filename for diagnostics
logger.info(`Loaded vendors route: ${__filename}`);

// Vendor code generation function
async function generateVendorCode(vendorName) {
  // Clean the name: remove spaces and special characters, take first 3 letters, uppercase
  const cleanName = vendorName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();

  if (cleanName.length < 3) {
    // If name is too short, pad with 'X'
    return cleanName.padEnd(3, 'X');
  }

  let code = cleanName;

  // Check if code exists, if so try next combinations
  const usedCodes = new Set();
  const [existing] = await pool.query('SELECT vendor_code FROM vendors WHERE vendor_code IS NOT NULL AND vendor_code != ""');
  existing.forEach(row => usedCodes.add(row.vendor_code));

  // If original code is free, use it
  if (!usedCodes.has(code)) {
    return code;
  }

  // Try variations: SUP → SUA → SUB → SUC ... SUZ → SAA → SAB ... SAZ → SBA → SBB ... etc.
  const base = code.substring(0, 2);
  for (let i = 65; i <= 90; i++) { // A-Z
    const variation = base + String.fromCharCode(i);
    if (!usedCodes.has(variation)) {
      return variation;
    }
  }

  // If all variations are taken, try different base
  for (let i = 65; i <= 90; i++) {
    for (let j = 65; j <= 90; j++) {
      const variation = String.fromCharCode(i) + String.fromCharCode(j) + code[2];
      if (!usedCodes.has(variation)) {
        return variation;
      }
    }
  }

  // Fallback: generate random code (shouldn't happen in practice)
  let randomCode;
  do {
    randomCode = String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
                 String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
                 String.fromCharCode(65 + Math.floor(Math.random() * 26));
  } while (usedCodes.has(randomCode));

  return randomCode;
}

// Recalculate vendor current balance based on opening balance, bills, and payments
async function recalculateVendorBalance(vendorId, connectionOrPool) {
  const conn = connectionOrPool || pool;
  
  // Get opening_balance
  const [vendorRows] = await conn.query('SELECT opening_balance FROM vendors WHERE id = ?', [vendorId]);
  if (vendorRows.length === 0) return 0;
  const opening_balance = Number(vendorRows[0].opening_balance) || 0;
  
  // Get sum(total_amount) from vendor_invoices
  const [billRows] = await conn.query('SELECT COALESCE(SUM(total_amount), 0) as total_billed FROM vendor_invoices WHERE vendor_id = ?', [vendorId]);
  const total_billed = Number(billRows[0].total_billed) || 0;
  
  // Get sum(amount) from vendor_payments
  const [paymentRows] = await conn.query('SELECT COALESCE(SUM(amount), 0) as total_paid FROM vendor_payments WHERE vendor_id = ?', [vendorId]);
  const total_paid = Number(paymentRows[0].total_paid) || 0;
  
  const newBalance = opening_balance + total_billed - total_paid;
  
  await conn.query('UPDATE vendors SET current_balance = ? WHERE id = ?', [newBalance, vendorId]);
  return newBalance;
}

// Helper function to update overdue status
async function updateOverdueStatuses() {
  try {
    await pool.query(`
      UPDATE vendor_invoices
      SET status = 'overdue'
      WHERE due_date < CURDATE()
        AND paid_amount < amount
        AND status != 'paid'
    `);
  } catch (error) {
    logger.error('Error updating overdue statuses:', error);
  }
}

// GET /api/vendors - List all vendors with spend summary
router.get('/vendors', authenticateToken, async (req, res) => {
  try {
    const { page: _page, limit: _limit, search = '', category = '' } = req.query;

    let whereClause = 'WHERE v.is_active = TRUE';
    const params = [];

    if (search) {
      whereClause += ' AND (v.name LIKE ? OR v.contact_person LIKE ? OR v.phone LIKE ? OR v.vendor_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category) {
      whereClause += ' AND v.category = ?';
      params.push(category);
    }

    // Get current month dates
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [vendors] = await pool.query(`
      SELECT
        v.*,
        COALESCE(SUM(CASE WHEN vi.invoice_date BETWEEN ? AND ? THEN vi.amount ELSE 0 END), 0) as this_month_spend,
        COALESCE(SUM(vi.amount - vi.paid_amount), 0) as pending_amount,
        COUNT(vi.id) as total_invoices,
        COUNT(CASE WHEN vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0 THEN 1 END) as overdue_invoices
      FROM vendors v
      LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id
      ${whereClause}
      GROUP BY v.id
      ORDER BY v.name
    `, [startOfMonth, endOfMonth, ...params]);

    res.json({ success: true, data: vendors });
  } catch (error) {
    logger.error('Error fetching vendors:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendors/summary → total payables, overdue, all vendors
router.get('/vendors/summary', authenticateToken, async (req, res) => {
  try {
    const [summary] = await pool.query(`
      SELECT 
        COALESCE(SUM(current_balance), 0) as total_payables,
        COUNT(id) as vendor_count
      FROM vendors
      WHERE is_active = TRUE
    `);

    const [overdue] = await pool.query(`
      SELECT COALESCE(SUM(amount - paid_amount), 0) as total_overdue
      FROM vendor_invoices
      WHERE status = 'overdue' AND (amount - paid_amount) > 0
    `);

    res.json({
      success: true,
      data: {
        total_payables: Number(summary[0].total_payables) || 0,
        total_overdue: Number(overdue[0].total_overdue) || 0,
        vendor_count: summary[0].vendor_count
      }
    });
  } catch (error) {
    logger.error('Error fetching summary:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendors/payables/summary → payables dashboard data with aging buckets
router.get('/vendors/payables/summary', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        v.id,
        v.name,
        v.vendor_type,
        v.credit_limit,
        v.credit_days,
        v.current_balance,
        v.phone,
        COALESCE(SUM(CASE
          WHEN vi.payment_status IN ('unpaid','partial')
               AND vi.due_date >= CURDATE()
          THEN vi.total_amount - COALESCE(vi.paid_amount, 0)
          ELSE 0 END), 0) as current_due,
        COALESCE(SUM(CASE
          WHEN vi.payment_status IN ('unpaid','partial')
               AND vi.due_date < CURDATE()
               AND vi.due_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          THEN vi.total_amount - COALESCE(vi.paid_amount, 0)
          ELSE 0 END), 0) as overdue_0_30,
        COALESCE(SUM(CASE
          WHEN vi.payment_status IN ('unpaid','partial')
               AND vi.due_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               AND vi.due_date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
          THEN vi.total_amount - COALESCE(vi.paid_amount, 0)
          ELSE 0 END), 0) as overdue_31_60,
        COALESCE(SUM(CASE
          WHEN vi.payment_status IN ('unpaid','partial')
               AND vi.due_date < DATE_SUB(CURDATE(), INTERVAL 60 DAY)
          THEN vi.total_amount - COALESCE(vi.paid_amount, 0)
          ELSE 0 END), 0) as overdue_60_plus
      FROM vendors v
      LEFT JOIN vendor_invoices vi ON vi.vendor_id = v.id
      WHERE v.is_active = 1
      GROUP BY v.id, v.name, v.vendor_type, v.credit_limit,
               v.credit_days, v.current_balance, v.phone
      HAVING v.current_balance > 0
      ORDER BY v.current_balance DESC
    `);

    let totalPayable = 0;
    let totalOverdue = 0;
    let vendorsOverLimit = 0;

    const vendors = rows.map(r => {
      const balance = Number(r.current_balance) || 0;
      const limit = Number(r.credit_limit) || 0;
      totalPayable += balance;
      totalOverdue += Number(r.overdue_0_30) + Number(r.overdue_31_60) + Number(r.overdue_60_plus);
      if (limit > 0 && balance > limit) vendorsOverLimit++;
      return {
        id: r.id,
        name: r.name,
        vendor_type: r.vendor_type,
        credit_limit: limit,
        credit_days: Number(r.credit_days) || 0,
        current_balance: balance,
        phone: r.phone,
        current_due: Number(r.current_due) || 0,
        overdue_0_30: Number(r.overdue_0_30) || 0,
        overdue_31_60: Number(r.overdue_31_60) || 0,
        overdue_60_plus: Number(r.overdue_60_plus) || 0
      };
    });

    res.json({
      success: true,
      summary: {
        total_payable: totalPayable,
        total_overdue: totalOverdue,
        vendors_over_limit: vendorsOverLimit,
        vendors_count: vendors.length
      },
      vendors
    });
  } catch (error) {
    logger.error('Error fetching payables summary:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendors/:id/credit-status → credit utilization and overdue info
router.get('/vendors/:id/credit-status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [vendors] = await pool.query(
      'SELECT id, name, current_balance, credit_limit, credit_days FROM vendors WHERE id = ?',
      [id]
    );
    if (vendors.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const v = vendors[0];
    const currentBalance = Number(v.current_balance) || 0;
    const creditLimit = Number(v.credit_limit) || 0;

    let status = 'ok';
    let utilizationPercent = 0;
    if (creditLimit > 0) {
      utilizationPercent = (currentBalance / creditLimit) * 100;
      if (utilizationPercent > 100) {
        status = 'exceeded';
      } else if (utilizationPercent >= 80) {
        status = 'warning';
      }
    } else if (currentBalance > 0) {
      status = 'warning';
      utilizationPercent = 100;
    }

    const [overdueBills] = await pool.query(`
      SELECT id, invoice_number as bill_number, due_date,
             DATEDIFF(CURDATE(), due_date) as days_overdue,
             total_amount - COALESCE(paid_amount, 0) as amount
      FROM vendor_invoices
      WHERE vendor_id = ? AND payment_status IN ('unpaid', 'partial') AND due_date < CURDATE()
      ORDER BY due_date ASC
    `, [id]);

    res.json({
      success: true,
      vendor_id: Number(id),
      current_balance: currentBalance,
      credit_limit: creditLimit,
      credit_days: Number(v.credit_days) || 0,
      utilization_percent: Math.round(utilizationPercent * 100) / 100,
      status,
      overdue_bills: overdueBills.map(b => ({
        bill_number: b.bill_number || `INV-${b.id}`,
        due_date: b.due_date,
        days_overdue: b.days_overdue,
        amount: Number(b.amount) || 0
      }))
    });
  } catch (error) {
    logger.error('Error fetching credit status:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendors/payment-audit → run SQL audit discrepancy query
router.get('/vendors/payment-audit', authenticateToken, async (req, res) => {
  try {
    try {
      await pool.query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))");
    } catch (e) {
      logger.warn('Could not modify sql_mode for session:', e.message);
    }

    const [rows] = await pool.query(`
      SELECT 
        v.id,
        v.name,
        v.opening_balance,
        (SELECT COALESCE(SUM(total_amount), 0) FROM vendor_invoices WHERE vendor_id = v.id) as total_billed,
        (SELECT COALESCE(SUM(amount), 0) FROM vendor_payments WHERE vendor_id = v.id) as total_paid,
        (v.opening_balance + 
         (SELECT COALESCE(SUM(total_amount), 0) FROM vendor_invoices WHERE vendor_id = v.id) - 
         (SELECT COALESCE(SUM(amount), 0) FROM vendor_payments WHERE vendor_id = v.id)
        ) as calculated_balance,
        v.current_balance as stored_balance,
        (v.current_balance - (v.opening_balance + 
         (SELECT COALESCE(SUM(total_amount), 0) FROM vendor_invoices WHERE vendor_id = v.id) - 
         (SELECT COALESCE(SUM(amount), 0) FROM vendor_payments WHERE vendor_id = v.id)
        )) as discrepancy
      FROM vendors v
      WHERE v.is_active = 1
      GROUP BY v.id, v.name, v.opening_balance, v.current_balance
      HAVING ABS(discrepancy) > 0.01
    `);

    if (rows.length > 0) {
      logger.warn(`Vendor payment audit found ${rows.length} discrepancy(ies)`);
    }

    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error running payment audit:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendors/:id - Single vendor with full details
router.get('/vendors/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get vendor details
    const [vendors] = await pool.query(`
      SELECT v.*,
             COALESCE(SUM(vi.amount), 0) as total_spend,
             COALESCE(SUM(vi.amount - vi.paid_amount), 0) as pending_amount,
             COUNT(vi.id) as total_invoices
      FROM vendors v
      LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id
      WHERE v.id = ? AND v.is_active = TRUE
      GROUP BY v.id
    `, [id]);

    if (vendors.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const vendor = vendors[0];

    // Get recent invoices
    const [invoices] = await pool.query(`
      SELECT vi.*, vp.amount as last_payment_amount, vp.payment_date as last_payment_date
      FROM vendor_invoices vi
      LEFT JOIN vendor_payments vp ON vi.id = vp.vendor_invoice_id
      WHERE vi.vendor_id = ?
      ORDER BY vi.invoice_date DESC
      LIMIT 10
    `, [id]);

    // Get recent payments
    const [payments] = await pool.query(`
      SELECT vp.*, vi.invoice_number
      FROM vendor_payments vp
      JOIN vendor_invoices vi ON vp.vendor_invoice_id = vi.id
      WHERE vp.vendor_id = ?
      ORDER BY vp.payment_date DESC
      LIMIT 10
    `, [id]);

    res.json({
      success: true,
      data: {
        ...vendor,
        invoices,
        payments
      }
    });
  } catch (error) {
    logger.error('Error fetching vendor details:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendors/:id/items - Get items purchased from vendor
router.get('/vendors/:id/items', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [items] = await pool.query(`
      SELECT
        bi.inventory_item_id AS inventory_id,
        i.name AS item_name,
        i.sku,
        SUM(bi.quantity) AS total_purchased,
        MAX(bi.unit_cost) AS last_unit_cost
      FROM sarga_vendor_bill_items bi
      JOIN sarga_inventory i ON bi.inventory_item_id = i.id
      JOIN sarga_vendor_bills b ON bi.bill_id = b.id
      WHERE b.vendor_id = ?
      GROUP BY bi.inventory_item_id, i.name, i.sku
      ORDER BY total_purchased DESC
    `, [id]);
    res.json({ success: true, items });
  } catch (error) {
    logger.error('Error fetching vendor items:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST /api/vendors - Create vendor
router.post('/vendors', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addVendorSchema), async (req, res) => {
  try {
    const vendorData = req.body;

    // Check for duplicate name
    const [existing] = await pool.query('SELECT id FROM vendors WHERE name = ? AND is_active = TRUE', [vendorData.name]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Vendor name already exists' });
    }

    // Generate or validate vendor code
    let vendorCode = vendorData.vendor_code;
    if (!vendorCode) {
      vendorCode = await generateVendorCode(vendorData.name);
    } else {
      // Validate uniqueness if manually provided
      const [codeCheck] = await pool.query('SELECT id FROM vendors WHERE vendor_code = ?', [vendorCode]);
      if (codeCheck.length > 0) {
        return res.status(400).json({ success: false, message: 'Vendor code already exists' });
      }
    }

    const gst = vendorData.gst_number || vendorData.gstin || null;
    const vendorType = vendorData.vendor_type || 'other';
    const openBal = Number(vendorData.opening_balance) || 0;
    const curBal = openBal;

    const [result] = await pool.query(`
      INSERT INTO vendors (name, contact_person, phone, email, gst_number, address, city, category, vendor_type, credit_days, credit_limit, opening_balance, current_balance, notes, vendor_code, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      vendorData.name,
      vendorData.contact_person || null,
      vendorData.phone || null,
      vendorData.email || null,
      gst,
      vendorData.address || null,
      vendorData.city || null,
      vendorData.category || 'other',
      vendorType,
      vendorData.credit_days || 0,
      vendorData.credit_limit || 0,
      openBal,
      curBal,
      vendorData.notes || null,
      vendorCode,
      1
    ]);

    auditLog(req.user.id, 'VENDOR_ADD', `Added vendor: ${vendorData.name} (${vendorCode})`, { entity_type: 'vendor', entity_id: result.insertId });

    res.json({ success: true, data: { id: result.insertId, vendor_code: vendorCode, current_balance: curBal, message: 'Vendor added successfully' } });
  } catch (error) {
    console.error('Error creating vendor:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// PUT /api/vendors/:id - Update vendor
router.put('/vendors/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), validate(addVendorSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const vendorData = req.body;

    // Check if vendor exists
    const [existing] = await pool.query('SELECT id FROM vendors WHERE id = ? AND is_active = TRUE', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Check for duplicate name
    const [duplicate] = await pool.query('SELECT id FROM vendors WHERE name = ? AND id != ? AND is_active = TRUE', [vendorData.name, id]);
    if (duplicate.length > 0) {
      return res.status(400).json({ success: false, message: 'Vendor name already exists' });
    }

    // Validate vendor_code if provided
    if (vendorData.vendor_code) {
      const [codeCheck] = await pool.query('SELECT id FROM vendors WHERE vendor_code = ? AND id != ?', [vendorData.vendor_code, id]);
      if (codeCheck.length > 0) {
        return res.status(400).json({ success: false, message: 'Vendor code already exists' });
      }
    }

    const gst = vendorData.gst_number || vendorData.gstin || null;
    const vendorType = vendorData.vendor_type || 'other';
    const openBal = Number(vendorData.opening_balance) || 0;

    await pool.query(`
      UPDATE vendors
      SET name = ?, contact_person = ?, phone = ?, email = ?, gst_number = ?, address = ?, city = ?, category = ?, vendor_type = ?, credit_days = ?, credit_limit = ?, opening_balance = ?, notes = ?, vendor_code = ?
      WHERE id = ?
    `, [
      vendorData.name,
      vendorData.contact_person || null,
      vendorData.phone || null,
      vendorData.email || null,
      gst,
      vendorData.address || null,
      vendorData.city || null,
      vendorData.category || 'other',
      vendorType,
      vendorData.credit_days || 0,
      vendorData.credit_limit || 0,
      openBal,
      vendorData.notes || null,
      vendorData.vendor_code || null,
      id
    ]);

    // Recalculate balance for this vendor because opening_balance or credit parameters might have changed
    const updatedBalance = await recalculateVendorBalance(id, pool);

    auditLog(req.user.id, 'VENDOR_UPDATE', `Updated vendor: ${vendorData.name}`, { entity_type: 'vendor', entity_id: id });

    res.json({ success: true, current_balance: updatedBalance, message: 'Vendor updated successfully' });
  } catch (error) {
    console.error('Error updating vendor:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// DELETE /api/vendors/:id - Soft delete vendor
router.delete('/vendors/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';

    // Check if vendor exists
    const [vendor] = await pool.query('SELECT id FROM vendors WHERE id = ? AND is_active = TRUE', [id]);
    if (vendor.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Check if vendor has unpaid invoices (try both table schemas for compatibility)
    let unpaidCount = 0;
    try {
      const [invoices] = await pool.query('SELECT COUNT(*) as count FROM vendor_invoices WHERE vendor_id = ? AND paid_amount < amount', [id]);
      unpaidCount = invoices[0].count;
    } catch (_err) {
      // If vendor_invoices doesn't exist or fails, try sarga_vendor_bills
      try {
        const [bills] = await pool.query('SELECT COUNT(*) as count FROM sarga_vendor_bills WHERE vendor_id = ?', [id]);
        unpaidCount = bills[0].count;
      } catch (err2) {
        // Both queries failed, assume no invoices
        logger.warn('Could not check for unpaid invoices, proceeding with deletion:', err2.message);
      }
    }

    if (unpaidCount > 0 && !force) {
      return res.status(400).json({ success: false, message: 'Cannot delete vendor with unpaid invoices. Use force option to proceed.' });
    }

    await pool.query('UPDATE vendors SET is_active = FALSE WHERE id = ?', [id]);

    auditLog(req.user.id, 'VENDOR_DELETE', `Deleted vendor ID: ${id} (force: ${force})`, { entity_type: 'vendor', entity_id: id });

    res.json({ success: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    logger.error('Error deleting vendor:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendors/dashboard/stats - Dashboard statistics
router.get('/vendors/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    logger.info('Entered vendors dashboard handler');
    // Disable ONLY_FULL_GROUP_BY for this session to avoid strict grouping errors
    try {
      await pool.query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))");
    } catch (e) {
      logger.warn('Could not modify sql_mode for session:', e.message);
    }

    // Update overdue statuses first
    await updateOverdueStatuses();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    // Basic stats
    logger.info('Running dashboard stats query (basic stats)');
    let stats = [{ total_vendors: 0, this_month_spend: 0, pending_amount: 0, overdue_amount: 0 }];
    try {
      const [s] = await pool.query(`
        SELECT
          COUNT(DISTINCT v.id) as total_vendors,
          COALESCE(SUM(CASE WHEN vi.invoice_date BETWEEN ? AND ? THEN vi.amount ELSE 0 END), 0) as this_month_spend,
          COALESCE(SUM(vi.amount - vi.paid_amount), 0) as pending_amount,
          COALESCE(SUM(CASE WHEN vi.status = 'overdue' THEN vi.amount - vi.paid_amount ELSE 0 END), 0) as overdue_amount
        FROM vendors v
        LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id AND vi.status != 'paid'
        WHERE v.is_active = TRUE
      `, [startOfMonth, endOfMonth]);
      stats = s;
    } catch (err) {
      logger.error('Basic stats query failed:', err && (err.stack || err));
    }

    // Top vendors by this month spend
    logger.info('Running dashboard stats query (top vendors)');
    let topVendors = [];
    try {
      const [tv] = await pool.query(`
        SELECT
          v.id as vendor_id, v.name,
          COALESCE(SUM(vi.amount), 0) as spend
        FROM vendors v
        LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id AND vi.invoice_date BETWEEN ? AND ?
        WHERE v.is_active = TRUE
        GROUP BY v.id, v.name
        HAVING spend > 0
        ORDER BY spend DESC
        LIMIT 5
      `, [startOfMonth, endOfMonth]);
      topVendors = tv;
    } catch (err) {
      logger.error('Top vendors query failed:', err && (err.stack || err));
    }

    // Pending invoices
    logger.info('Running dashboard stats query (pending invoices)');
    let pendingInvoices = [];
    try {
      const [pi] = await pool.query(`
        SELECT
          vi.id, vi.invoice_number, vi.invoice_date, vi.due_date, vi.amount, vi.paid_amount,
          v.name as vendor_name, vi.branch, vi.status
        FROM vendor_invoices vi
        JOIN vendors v ON vi.vendor_id = v.id
        WHERE vi.status IN ('pending', 'partial', 'overdue') AND v.is_active = TRUE
        ORDER BY vi.due_date ASC
        LIMIT 10
      `);
      pendingInvoices = pi;
    } catch (err) {
      logger.error('Pending invoices query failed:', err && (err.stack || err));
    }

    // Monthly trend for last 6 months (single grouped query)
    logger.info('Running dashboard stats query (monthly trend)');
    const startOfSixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
    const endOfCurrentMonth = endOfMonth;
    let trendRows = [];
    try {
      const [tr] = await pool.query(`
        SELECT
          DATE_FORMAT(vi.invoice_date, '%b %Y') as month,
          YEAR(vi.invoice_date) as yr,
          MONTH(vi.invoice_date) as mth,
          vi.branch,
          COALESCE(SUM(vi.amount), 0) as total_spend
        FROM vendor_invoices vi
        JOIN vendors v ON vi.vendor_id = v.id
        WHERE vi.invoice_date BETWEEN ? AND ? AND v.is_active = TRUE
        GROUP BY DATE_FORMAT(vi.invoice_date, '%b %Y'), YEAR(vi.invoice_date), MONTH(vi.invoice_date), vi.branch
        ORDER BY YEAR(vi.invoice_date), MONTH(vi.invoice_date)
      `, [startOfSixMonthsAgo, endOfCurrentMonth]);
      trendRows = tr;
    } catch (err) {
      logger.error('Monthly trend query failed:', err && (err.stack || err));
    }

    // Build a map for quick lookup: map[month][branch] = total_spend
    const map = {};
    trendRows.forEach(r => {
      const month = r.month;
      if (!map[month]) map[month] = {};
      map[month][r.branch] = Number(r.total_spend || 0);
    });

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthlyTrend.push({
        month: monthName,
        perambra: map[monthName]?.perambra || 0,
        meppayur: map[monthName]?.meppayur || 0,
        common: map[monthName]?.common || 0
      });
    }

      res.json({
        success: true,
        data: {
          ...stats[0],
          top_vendors: topVendors,
          pending_invoices: pendingInvoices,
          monthly_trend: monthlyTrend
        }
      });
    } catch (error) {
      logger.error('Error fetching dashboard stats:', error && (error.stack || error));
      // Include the error message in the response briefly for debugging (remove before production)
      res.status(500).json({ success: false, message: 'Database error', error: String(error && (error.stack || error)) });
    }
});

// GET /api/vendor-invoices - List invoices with filters
router.get('/vendor-invoices', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, vendor_id, status, branch, start_date, end_date } = req.query;

    let whereClause = '';
    const params = [];

    if (vendor_id) {
      whereClause += ' AND vi.vendor_id = ?';
      params.push(vendor_id);
    }

    if (status) {
      whereClause += ' AND vi.status = ?';
      params.push(status);
    }

    if (branch) {
      whereClause += ' AND vi.branch = ?';
      params.push(branch);
    }

    if (start_date) {
      whereClause += ' AND vi.invoice_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND vi.invoice_date <= ?';
      params.push(end_date);
    }

    // Update overdue statuses
    await updateOverdueStatuses();

    const [invoices] = await pool.query(`
      SELECT
        vi.*,
        v.name as vendor_name,
        v.category as vendor_category
      FROM vendor_invoices vi
      JOIN vendors v ON vi.vendor_id = v.id
      WHERE v.is_active = TRUE ${whereClause}
      ORDER BY vi.invoice_date DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]);

    const [total] = await pool.query(`
      SELECT COUNT(*) as count
      FROM vendor_invoices vi
      JOIN vendors v ON vi.vendor_id = v.id
      WHERE v.is_active = TRUE ${whereClause}
    `, params);

    res.json({
      success: true,
      data: invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total[0].count,
        pages: Math.ceil(total[0].count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST /api/vendor-invoices - Create invoice
router.post('/vendor-invoices', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addInvoiceSchema), recordVendorBill);

// PUT /api/vendor-invoices/:id - Update invoice
router.put('/vendor-invoices/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), updateVendorBill);

// POST /api/vendor-payments - Record payment
router.post('/vendor-payments', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addVendorPaymentSchema), recordVendorPayment);

// GET /api/vendors/:id/spend-trend - Monthly spend trend
router.get('/vendors/:id/spend-trend', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const monthlySpend = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startDate = date.toISOString().split('T')[0];
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const [spend] = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM vendor_invoices
        WHERE vendor_id = ? AND invoice_date BETWEEN ? AND ?
      `, [id, startDate, endDate]);

      monthlySpend.push({
        month: monthName,
        spend: parseFloat(spend[0].total)
      });
    }

    res.json({ success: true, data: monthlySpend });
  } catch (error) {
    console.error('Error fetching spend trend:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// File upload configuration
const uploadDir = path.join(__dirname, '../uploads');
const vendorBillsDir = path.join(uploadDir, 'vendor-bills');
const vendorStatementsDir = path.join(uploadDir, 'vendor-statements');

// Ensure directories exist
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(vendorBillsDir)) fs.mkdirSync(vendorBillsDir);
if (!fs.existsSync(vendorStatementsDir)) fs.mkdirSync(vendorStatementsDir);

const billUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, vendorBillsDir);
    },
    filename: (req, file, cb) => {
      const { vendor_code, invoice_id } = req.body;
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `${vendor_code}_${invoice_id}_${timestamp}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, JPEG, PNG allowed.'));
    }
  }
});

const statementUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, vendorStatementsDir);
    },
    filename: (req, file, cb) => {
      const { vendor_id } = req.params;
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `vendor_${vendor_id}_${timestamp}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/csv', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and PDF allowed.'));
    }
  }
});

// POST /api/vendor-invoices/:id/upload-bill - Upload bill attachment
router.post('/vendor-invoices/:id/upload-bill', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), billUpload.single('bill'), async (req, res) => {
  try {
    const { id } = req.params;
    const { invoice_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Get vendor info
    const [invoice] = await pool.query(`
      SELECT vi.*, v.vendor_code
      FROM vendor_invoices vi
      JOIN vendors v ON vi.vendor_id = v.id
      WHERE vi.id = ?
    `, [invoice_id || id]);

    if (invoice.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const vendor = invoice[0];

    // Insert attachment record
    const [result] = await pool.query(`
      INSERT INTO vendor_bill_attachments (vendor_invoice_id, vendor_id, file_name, file_path, file_type, file_size)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      invoice_id || id,
      vendor.vendor_id,
      req.file.originalname,
      req.file.path,
      req.file.mimetype,
      req.file.size
    ]);

    auditLog(req.user.id, 'BILL_UPLOAD', `Uploaded bill for invoice ${invoice_id || id}`, {
      entity_type: 'vendor_bill_attachment',
      entity_id: result.insertId
    });

    res.json({
      success: true,
      data: {
        id: result.insertId,
        file_name: req.file.originalname,
        file_path: req.file.path,
        uploaded_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error uploading bill:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// GET /api/vendors/:id/bills - Get all bills for vendor
router.get('/vendors/:id/bills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    let whereClause = 'WHERE vba.vendor_id = ?';
    const params = [id];

    if (status) {
      whereClause += ' AND vi.status = ?';
      params.push(status);
    }

    const [bills] = await pool.query(`
      SELECT
        vba.id as attachment_id,
        vba.file_name,
        vba.file_path,
        vba.file_type,
        vba.uploaded_at,
        vi.invoice_number,
        vi.invoice_date,
        vi.amount as invoice_amount,
        vi.status as invoice_status
      FROM vendor_bill_attachments vba
      JOIN vendor_invoices vi ON vba.vendor_invoice_id = vi.id
      JOIN vendors v ON vba.vendor_id = v.id
      ${whereClause}
      ORDER BY vba.uploaded_at DESC
    `, params);

    res.json({ success: true, data: bills });
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendor-invoices/:id/bills - Get bills for specific invoice
router.get('/vendor-invoices/:id/bills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [bills] = await pool.query(`
      SELECT
        vba.id,
        vba.file_name,
        vba.file_path,
        vba.file_type,
        vba.file_size,
        vba.uploaded_at
      FROM vendor_bill_attachments vba
      WHERE vba.vendor_invoice_id = ?
      ORDER BY vba.uploaded_at DESC
    `, [id]);

    res.json({ success: true, data: bills });
  } catch (error) {
    console.error('Error fetching invoice bills:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// DELETE /api/vendor-bill-attachments/:id - Delete bill attachment
router.delete('/vendor-bill-attachments/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get file path
    const [attachment] = await pool.query('SELECT file_path FROM vendor_bill_attachments WHERE id = ?', [id]);
    if (attachment.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    // Delete file from disk
    if (fs.existsSync(attachment[0].file_path)) {
      fs.unlinkSync(attachment[0].file_path);
    }

    // Delete from database
    await pool.query('DELETE FROM vendor_bill_attachments WHERE id = ?', [id]);

    auditLog(req.user.id, 'BILL_DELETE', `Deleted bill attachment ${id}`, {
      entity_type: 'vendor_bill_attachment',
      entity_id: id
    });

    res.json({ success: true, message: 'Bill attachment deleted' });
  } catch (error) {
    console.error('Error deleting bill attachment:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

// GET /api/vendors/:id/statement - Get latest vendor statement
router.get('/vendors/:id/statement', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [statements] = await pool.query(`
      SELECT vs.* FROM vendor_statements vs WHERE vs.vendor_id = ? ORDER BY vs.id DESC LIMIT 1
    `, [id]);
    if (statements.length === 0) {
      return res.status(404).json({ success: false, message: 'No statement found' });
    }
    const statement = statements[0];
    const [lines] = await pool.query(`
      SELECT * FROM vendor_statement_lines WHERE vendor_statement_id = ? ORDER BY line_date
    `, [statement.id]);
    res.json({ success: true, data: { ...statement, lines } });
  } catch (err) {
    console.error('Statement fetch error:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST /api/vendors/:id/upload-statement - Upload bank statement
router.post('/vendors/:id/upload-statement', authenticateToken, authorizeRoles('Admin', 'Accountant'), statementUpload.single('statement'), async (req, res) => {
  try {
    const { id } = req.params;
    const { statement_month } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Insert statement record
    const [result] = await pool.query(`
      INSERT INTO vendor_statements (vendor_id, statement_month, file_name, file_path)
      VALUES (?, ?, ?, ?)
    `, [id, statement_month, req.file.originalname, req.file.path]);

    const statementId = result.insertId;
    let linesParsed = 0;

    if (req.file.mimetype === 'text/csv' || req.file.originalname.endsWith('.csv')) {
      // Parse CSV
      const csvData = fs.readFileSync(req.file.path, 'utf8');
      const records = [];

      await new Promise((resolve, reject) => {
        csv.parse(csvData, {
          skip_empty_lines: true,
          from_line: 2 // Skip header
        })
        .on('data', (row) => {
          // Try to detect columns and parse
          const line = parseStatementLine(row);
          if (line) records.push({ ...line, statementId });
        })
        .on('end', () => resolve())
        .on('error', reject);
      });

      // Insert parsed lines
      if (records.length > 0) {
        const values = records.map(r => [statementId, r.date, r.description, r.amount, r.type]);
        await pool.query(`
          INSERT INTO vendor_statement_lines (vendor_statement_id, line_date, description, amount, type)
          VALUES ${values.map(() => '(?, ?, ?, ?, ?)').join(', ')}
        `, values.flat());
      }
      linesParsed = records.length;

    } else if (req.file.mimetype === 'application/pdf') {
      // Extract text from PDF
      const pdfData = fs.readFileSync(req.file.path);
      const pdfText = await pdfParse(pdfData);

      // Store raw text
      await pool.query('UPDATE vendor_statements SET raw_text = ? WHERE id = ?', [pdfText.text, statementId]);

      // Try to parse lines from text
      const lines = pdfText.text.split('\n').filter(line => line.trim());
      const parsedLines = [];

      for (const line of lines) {
        const parsed = parseStatementLineFromText(line);
        if (parsed) {
          parsedLines.push(parsed);
        }
      }

      // Insert parsed lines
      if (parsedLines.length > 0) {
        const values = parsedLines.map(r => [statementId, r.date, r.description, r.amount, r.type]);
        await pool.query(`
          INSERT INTO vendor_statement_lines (vendor_statement_id, line_date, description, amount, type)
          VALUES ${values.map(() => '(?, ?, ?, ?, ?)').join(', ')}
        `, values.flat());
      }
      linesParsed = parsedLines.length;
    }

    auditLog(req.user.id, 'STATEMENT_UPLOAD', `Uploaded statement for vendor ${id}`, {
      entity_type: 'vendor_statement',
      entity_id: statementId
    });

    res.json({
      success: true,
      data: {
        statement_id: statementId,
        lines_parsed: linesParsed
      }
    });
  } catch (error) {
    console.error('Error uploading statement:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// Helper function to parse CSV row
function parseStatementLine(row) {
  // Try different column arrangements
  const datePatterns = [
    /^\d{2}[-/]\d{2}[-/]\d{4}$/, // DD-MM-YYYY
    /^\d{4}[-/]\d{2}[-/]\d{2}$/, // YYYY-MM-DD
    /^\d{2}[-/]\d{2}[-/]\d{2}$/, // DD-MM-YY
  ];

  for (let i = 0; i < row.length; i++) {
    const cell = row[i]?.trim();
    if (!cell) continue;

    // Check if this looks like a date
    const isDate = datePatterns.some(pattern => pattern.test(cell));
    if (isDate) {
      const date = parseDate(cell);
      if (date) {
        // Look for amount in nearby columns
        for (let j = i + 1; j < Math.min(i + 4, row.length); j++) {
          const amountCell = row[j]?.trim();
          if (amountCell) {
            const amount = parseFloat(amountCell.replace(/[^\d.-]/g, ''));
            if (!isNaN(amount) && amount !== 0) {
              const description = row.slice(i + 1, j).join(' ').trim() || row.slice(Math.max(0, i - 2), i).join(' ').trim();
              return {
                date,
                description: description || 'Transaction',
                amount: Math.abs(amount),
                type: amount > 0 ? 'credit' : 'debit'
              };
            }
          }
        }
      }
    }
  }
  return null;
}

// Helper function to parse statement line from text
function parseStatementLineFromText(line) {
  // Look for date pattern followed by amount
  const datePattern = /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/g;
  const amountPattern = /₹?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g;

  const dateMatch = line.match(datePattern);
  const amountMatch = line.match(amountPattern);

  if (dateMatch && amountMatch) {
    const date = parseDate(dateMatch[0]);
    const amount = parseFloat(amountMatch[0].replace(/[^\d.]/g, ''));

    if (date && !isNaN(amount)) {
      // Remove date and amount from description
      let description = line.replace(dateMatch[0], '').replace(amountMatch[0], '').trim();
      if (!description) description = 'Transaction';

      return {
        date,
        description,
        amount,
        type: amount > 0 ? 'credit' : 'debit'
      };
    }
  }
  return null;
}

// Helper function to parse date
function parseDate(dateStr) {
  // Try different date formats
  const formats = [
    'DD-MM-YYYY', 'DD/MM/YYYY', 'DD-MM-YY', 'DD/MM/YY',
    'YYYY-MM-DD', 'YYYY/MM/DD', 'MM-DD-YYYY', 'MM/DD/YYYY'
  ];

  for (const format of formats) {
    try {
      let date;
      if (format === 'DD-MM-YYYY') {
        const [d, m, y] = dateStr.split(/[-/]/);
        date = new Date(y.length === 2 ? `20${y}` : y, m - 1, d);
      } else if (format === 'YYYY-MM-DD') {
        const [y, m, d] = dateStr.split(/[-/]/);
        date = new Date(y, m - 1, d);
      }

      if (date && !isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (_e) {
      continue;
    }
  }
  return null;
}

// POST /api/vendor-statements/:id/reconcile - Reconcile statement
router.post('/vendor-statements/:id/reconcile', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get statement and vendor info
    const [statement] = await pool.query(`
      SELECT vs.*, v.name as vendor_name
      FROM vendor_statements vs
      JOIN vendors v ON vs.vendor_id = v.id
      WHERE vs.id = ?
    `, [id]);

    if (statement.length === 0) {
      return res.status(404).json({ success: false, message: 'Statement not found' });
    }

    const vendorId = statement[0].vendor_id;

    // Get unmatched statement lines
    const [lines] = await pool.query(`
      SELECT * FROM vendor_statement_lines
      WHERE vendor_statement_id = ? AND match_status = 'unmatched'
      ORDER BY line_date
    `, [id]);

    let matched = 0, partial = 0, unmatched = 0;
    const discrepancies = [];

    for (const line of lines) {
      // Try to match with invoices
      const [matches] = await pool.query(`
        SELECT vi.*,
               ABS(vi.amount - ?) as amount_diff,
               ABS(DATEDIFF(vi.due_date, ?) / 30) as date_diff_months
        FROM vendor_invoices vi
        WHERE vi.vendor_id = ?
          AND vi.status IN ('pending', 'partial', 'overdue')
          AND ABS(vi.amount - ?) <= 100  -- Amount tolerance
          AND ABS(DATEDIFF(vi.due_date, ?)) <= 5  -- Date tolerance (5 days)
        ORDER BY amount_diff, date_diff_months
        LIMIT 1
      `, [line.amount, line.line_date, vendorId, line.amount, line.line_date]);

      if (matches.length > 0) {
        const invoice = matches[0];

        // Check description match
        const descriptionMatch = invoice.invoice_number &&
          line.description.toLowerCase().includes(invoice.invoice_number.toLowerCase());

        if (Math.abs(invoice.amount - line.amount) < 1 && descriptionMatch) {
          // Perfect match
          await pool.query(`
            UPDATE vendor_statement_lines
            SET matched_invoice_id = ?, match_status = 'matched'
            WHERE id = ?
          `, [invoice.id, line.id]);
          matched++;
        } else if (Math.abs(invoice.amount - line.amount) < 1) {
          // Amount matches but date off
          await pool.query(`
            UPDATE vendor_statement_lines
            SET matched_invoice_id = ?, match_status = 'partial'
            WHERE id = ?
          `, [invoice.id, line.id]);
          partial++;
        } else {
          unmatched++;
          discrepancies.push({
            line_id: line.id,
            description: line.description,
            amount: line.amount,
            reason: 'Amount mismatch'
          });
        }
      } else {
        unmatched++;
        discrepancies.push({
          line_id: line.id,
          description: line.description,
          amount: line.amount,
          reason: 'No matching invoice found'
        });
      }
    }

    // Update statement reconciliation status
    let status = 'pending';
    if (matched > 0 && unmatched === 0) {
      status = 'matched';
    } else if (unmatched > 0) {
      status = 'has_discrepancy';
    }

    await pool.query(`
      UPDATE vendor_statements
      SET reconciliation_status = ?, discrepancy_notes = ?
      WHERE id = ?
    `, [status, discrepancies.length > 0 ? JSON.stringify(discrepancies.slice(0, 10)) : null, id]);

    auditLog(req.user.id, 'STATEMENT_RECONCILE', `Reconciled statement ${id}: ${matched} matched, ${partial} partial, ${unmatched} unmatched`, {
      entity_type: 'vendor_statement',
      entity_id: id
    });

    res.json({
      success: true,
      data: {
        matched,
        partial,
        unmatched,
        discrepancies: discrepancies.slice(0, 5) // Return first 5 discrepancies
      }
    });
  } catch (error) {
    console.error('Error reconciling statement:', error);
    res.status(500).json({ success: false, message: 'Reconciliation failed' });
  }
});

// GET /api/vendor-statements/:id/result - Get reconciliation results
router.get('/vendor-statements/:id/result', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [lines] = await pool.query(`
      SELECT vsl.*,
             vi.invoice_number,
             vi.invoice_date,
             vi.amount as invoice_amount,
             vi.status as invoice_status
      FROM vendor_statement_lines vsl
      LEFT JOIN vendor_invoices vi ON vsl.matched_invoice_id = vi.id
      WHERE vsl.vendor_statement_id = ?
      ORDER BY vsl.line_date
    `, [id]);

    res.json({ success: true, data: lines });
  } catch (error) {
    console.error('Error fetching reconciliation results:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Helper functions for bills and payments
async function recordVendorBill(req, res) {
  try {
    const vendor_id = req.params.id ? parseInt(req.params.id) : req.body.vendor_id;
    const { invoice_number, invoice_date, amount, gst_amount, branch, notes } = req.body;
    
    if (!vendor_id) {
      return res.status(400).json({ success: false, message: 'vendor_id is required' });
    }

    // Get credit limit
    const [vendor] = await pool.query('SELECT credit_limit, current_balance, credit_days FROM vendors WHERE id = ?', [vendor_id]);
    if (vendor.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    
    const currentBal = Number(vendor[0].current_balance || 0);
    const creditLimit = Number(vendor[0].credit_limit) || 0;
    const newOutstanding = currentBal + Number(amount);
    const creditLimitWarning = creditLimit > 0 && newOutstanding > creditLimit;
    if (creditLimitWarning) {
      res.setHeader('X-Credit-Limit-Warning', 'Breached');
    }
    
    // Calculate due date
    const creditDays = vendor[0].credit_days || 0;
    const dueDateObj = new Date(invoice_date);
    dueDateObj.setDate(dueDateObj.getDate() + creditDays);
    const due_date = dueDateObj.toISOString().split('T')[0];
    
    const finalTotal = Number(amount) + Number(gst_amount || 0);
    
    const [result] = await pool.query(`
      INSERT INTO vendor_invoices (vendor_id, invoice_number, invoice_date, due_date, amount, gst_amount, total_amount, paid_amount, status, payment_status, branch, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending', 'unpaid', ?, ?)
    `, [
      vendor_id,
      invoice_number || null,
      invoice_date,
      due_date,
      amount,
      gst_amount || 0,
      finalTotal,
      branch || 'common',
      notes || null
    ]);
    
    // Recalculate vendor balance
    const updatedBalance = await recalculateVendorBalance(vendor_id, pool);
    
    auditLog(req.user.id, 'VENDOR_BILL_ADD', `Added bill for vendor ID ${vendor_id}`, {
      entity_type: 'vendor_invoice',
      entity_id: result.insertId
    });
    
    res.json({
      success: true,
      data: {
        id: result.insertId,
        current_balance: updatedBalance,
        new_vendor_balance: updatedBalance,
        credit_limit_warning: creditLimitWarning,
        message: 'Bill recorded successfully'
      }
    });
  } catch (error) {
    logger.error('Error recording bill:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
}

async function updateVendorBill(req, res) {
  try {
    const billId = req.params.billId || req.params.id;
    const { invoice_number, invoice_date, due_date, amount, gst_amount, branch, notes } = req.body;
    
    // Find old bill
    const [bill] = await pool.query('SELECT vendor_id, paid_amount FROM vendor_invoices WHERE id = ?', [billId]);
    if (bill.length === 0) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }
    const vendorId = bill[0].vendor_id;
    const paidAmount = Number(bill[0].paid_amount || 0);
    
    const finalTotal = Number(amount) + Number(gst_amount || 0);
    
    // Determine status and payment_status
    let status = 'pending';
    let paymentStatus = 'unpaid';
    if (paidAmount >= finalTotal) {
      status = 'paid';
      paymentStatus = 'paid';
    } else if (paidAmount > 0) {
      status = 'partial';
      paymentStatus = 'partial';
    }
    
    await pool.query(`
      UPDATE vendor_invoices
      SET invoice_number = ?, invoice_date = ?, due_date = ?, amount = ?, gst_amount = ?, total_amount = ?, status = ?, payment_status = ?, branch = ?, notes = ?
      WHERE id = ?
    `, [
      invoice_number || null,
      invoice_date,
      due_date,
      amount,
      gst_amount || 0,
      finalTotal,
      status,
      paymentStatus,
      branch || 'common',
      notes || null,
      billId
    ]);
    
    // Recalculate balance
    const updatedBalance = await recalculateVendorBalance(vendorId, pool);
    
    auditLog(req.user.id, 'VENDOR_BILL_UPDATE', `Updated bill ID ${billId}`, {
      entity_type: 'vendor_invoice',
      entity_id: billId
    });
    
    res.json({ success: true, current_balance: updatedBalance, message: 'Bill updated successfully' });
  } catch (error) {
    logger.error('Error updating bill:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
}

async function recordVendorPayment(req, res) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const vendor_id = req.params.id ? parseInt(req.params.id) : req.body.vendor_id;
    const { vendor_invoice_id, amount, payment_date, payment_mode, reference_number, notes } = req.body;
    
    if (!amount || amount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
    }
    
    // Verify payment mode
    const validModes = ['cash', 'bank', 'upi', 'cheque', 'neft', 'rtgs'];
    if (!validModes.includes(payment_mode)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Invalid payment mode. Allowed: ${validModes.join(', ')}` });
    }
    
    // For cheque, reference number is required
    if (payment_mode === 'cheque' && (!reference_number || reference_number.trim() === '')) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Reference number is required for cheque payments' });
    }
    
    // Fetch invoice details
    const [invoice] = await connection.query('SELECT * FROM vendor_invoices WHERE id = ?', [vendor_invoice_id]);
    if (invoice.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    
    const inv = invoice[0];
    const finalVendorId = vendor_id || inv.vendor_id;
    
    // Insert payment
    const [paymentResult] = await connection.query(`
      INSERT INTO vendor_payments (vendor_invoice_id, vendor_id, amount, payment_date, payment_mode, reference_number, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      vendor_invoice_id,
      finalVendorId,
      amount,
      payment_date,
      payment_mode,
      reference_number || null,
      notes || null,
      req.user.id
    ]);
    
    // Update invoice paid amount and status
    const newPaidAmount = Number(inv.paid_amount || 0) + Number(amount);
    let newStatus = 'partial';
    let newPaymentStatus = 'partial';
    if (newPaidAmount >= Number(inv.amount)) {
      newStatus = 'paid';
      newPaymentStatus = 'paid';
    } else if (newPaidAmount <= 0) {
      newStatus = 'pending';
      newPaymentStatus = 'unpaid';
    }
    
    await connection.query(`
      UPDATE vendor_invoices
      SET paid_amount = ?, status = ?, payment_status = ?
      WHERE id = ?
    `, [newPaidAmount, newStatus, newPaymentStatus, vendor_invoice_id]);
    
    await connection.commit();
    
    // Recalculate vendor balance
    const updatedBalance = await recalculateVendorBalance(finalVendorId, pool);
    
    auditLog(req.user.id, 'VENDOR_PAYMENT_ADD', `Recorded payment of ₹${amount} for vendor ID ${finalVendorId}`, {
      entity_type: 'vendor_payment',
      entity_id: paymentResult.insertId
    });
    
    res.json({
      success: true,
      data: {
        id: paymentResult.insertId,
        current_balance: updatedBalance,
        message: 'Payment recorded successfully'
      }
    });
  } catch (error) {
    await connection.rollback();
    logger.error('Error recording payment:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  } finally {
    connection.release();
  }
}

// REST endpoints for vendor ledger, balance, and summary

// GET /api/vendors/:id/ledger → full ledger with running balance, date filter, summary
router.get('/vendors/:id/ledger', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    // Get vendor detail
    const [vendors] = await pool.query(
      'SELECT id, name, phone, vendor_type, credit_limit, credit_days, opening_balance, current_balance FROM vendors WHERE id = ?',
      [id]
    );
    if (vendors.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    const vendor = vendors[0];

    // Combined query: bills + payments ordered by date
    const [rows] = await pool.query(`
      SELECT id, date, description, debit, credit, type, payment_status, due_date
      FROM (
        SELECT
          vi.id,
          vi.invoice_date AS date,
          CONCAT('Invoice #', COALESCE(vi.invoice_number, CONCAT('', vi.id)), ' - ', COALESCE(vi.notes, '')) AS description,
          vi.total_amount AS debit,
          0 AS credit,
          'bill' AS type,
          vi.payment_status,
          vi.due_date
        FROM vendor_invoices vi
        WHERE vi.vendor_id = ?

        UNION ALL

        SELECT
          vp.id,
          vp.payment_date AS date,
          CONCAT('Payment - ', vp.payment_mode,
            CASE WHEN vp.reference_number IS NOT NULL
              THEN CONCAT(' (Ref: ', vp.reference_number, ')')
              ELSE '' END) AS description,
          0 AS debit,
          vp.amount AS credit,
          'payment' AS type,
          NULL AS payment_status,
          NULL AS due_date
        FROM vendor_payments vp
        WHERE vp.vendor_id = ?
      ) AS combined
      ORDER BY date ASC, type DESC
    `, [id, id]);

    // Apply date filter in JS if from/to provided
    let filtered = rows;
    if (from) {
      const fromDate = new Date(from);
      filtered = filtered.filter(r => new Date(r.date) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => new Date(r.date) <= toDate);
    }

    // Calculate running balance and summary
    const openingBalance = Number(vendor.opening_balance) || 0;
    let runningBalance = openingBalance;
    let totalBilled = 0;
    let totalPaid = 0;

    const ledger = filtered.map(row => {
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      runningBalance += debit - credit;
      totalBilled += debit;
      totalPaid += credit;
      return {
        date: row.date,
        description: row.description,
        debit,
        credit,
        balance: runningBalance,
        type: row.type,
        payment_status: row.payment_status,
        due_date: row.due_date
      };
    });

    const currentBalance = Number(vendor.current_balance) || 0;

    // Overdue amount: sum of unpaid/partial bills past due
    let overdueAmount = 0;
    try {
      const [overdueRows] = await pool.query(
        `SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as overdue
         FROM vendor_invoices
         WHERE vendor_id = ? AND payment_status IN ('unpaid', 'partial') AND due_date < CURDATE()`,
        [id]
      );
      overdueAmount = Number(overdueRows[0].overdue) || 0;
    } catch (_) { /* ignore */ }

    res.json({
      success: true,
      vendor: {
        id: vendor.id,
        name: vendor.name,
        phone: vendor.phone,
        vendor_type: vendor.vendor_type,
        credit_limit: Number(vendor.credit_limit) || 0,
        credit_days: Number(vendor.credit_days) || 0
      },
      opening_balance: openingBalance,
      ledger,
      summary: {
        total_billed: totalBilled,
        total_paid: totalPaid,
        current_balance: currentBalance,
        overdue_amount: overdueAmount
      }
    });
  } catch (error) {
    logger.error('Error fetching ledger:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// ─── Indian number formatter ────────────────────────────────────────────────
function fmtINR(n) {
  const num = Math.abs(Number(n) || 0);
  const [int, dec] = num.toFixed(2).split('.');
  const lastThree = int.slice(-3);
  const rest = int.slice(0, -3);
  const formatted = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree : lastThree;
  return '\u20B9' + formatted + '.' + dec;
}

// GET /api/vendors/:id/ledger/pdf → styled PDFKit statement
// Must be registered BEFORE /vendors/:id/balance to avoid route conflicts.
router.get('/vendors/:id/ledger/pdf', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    // ── 1. Vendor detail ────────────────────────────────────────────────────
    const [vendors] = await pool.query(
      'SELECT id, name, phone, address, gst_number, vendor_type, opening_balance FROM vendors WHERE id = ?',
      [id]
    );
    if (vendors.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    const vendor = vendors[0];

    // ── 2. Company settings ─────────────────────────────────────────────────
    let companyName = 'SARGA PRINTS';
    let companyAddress = 'Perambra, Kozhikode, Kerala';
    let companyGst = '';
    let companyPhone = '';
    try {
      const [settings] = await pool.query('SELECT setting_key, setting_value FROM sarga_company_settings');
      const s = Object.fromEntries(settings.map(r => [r.setting_key, r.setting_value]));
      if (s.company_name) companyName = s.company_name;
      if (s.company_address) companyAddress = s.company_address;
      if (s.gst_number) companyGst = s.gst_number;
      if (s.company_phone) companyPhone = s.company_phone;
    } catch (_) { /* use defaults */ }

    // ── 3. Ledger rows ──────────────────────────────────────────────────────
    const [rows] = await pool.query(`
      SELECT id, date, description, debit, credit, type, payment_status
      FROM (
        SELECT vi.id,
               vi.invoice_date AS date,
               CONCAT('Invoice #', COALESCE(vi.invoice_number, CONCAT('', vi.id)),
                 CASE WHEN vi.notes IS NOT NULL AND vi.notes <> '' THEN CONCAT(' – ', vi.notes) ELSE '' END) AS description,
               vi.total_amount AS debit, 0 AS credit, 'bill' AS type,
               vi.payment_status
        FROM vendor_invoices vi WHERE vi.vendor_id = ?
        UNION ALL
        SELECT vp.id,
               vp.payment_date AS date,
               CONCAT('Payment – ', vp.payment_mode,
                 CASE WHEN vp.reference_number IS NOT NULL
                      THEN CONCAT(' (Ref: ', vp.reference_number, ')') ELSE '' END) AS description,
               0 AS debit, vp.amount AS credit, 'payment' AS type, NULL
        FROM vendor_payments vp WHERE vp.vendor_id = ?
      ) AS combined ORDER BY date ASC, type DESC
    `, [id, id]);

    // Apply date filter
    let filtered = rows;
    if (from) { const d = new Date(from); filtered = filtered.filter(r => new Date(r.date) >= d); }
    if (to)   { const d = new Date(to); d.setHours(23,59,59,999); filtered = filtered.filter(r => new Date(r.date) <= d); }

    // Compute running balance and summary
    const openingBalance = Number(vendor.opening_balance) || 0;
    let runBal = openingBalance;
    let totalDebit = 0, totalCredit = 0;
    const ledger = filtered.map(r => {
      const debit  = Number(r.debit)  || 0;
      const credit = Number(r.credit) || 0;
      runBal += debit - credit;
      totalDebit  += debit;
      totalCredit += credit;
      return { ...r, debit, credit, balance: runBal };
    });
    const closingBalance = runBal;

    // ── 4. Build PDF ────────────────────────────────────────────────────────
    const MARGIN  = 40;
    const PAGE_W  = 595.28;   // A4 pt width
    const PAGE_H  = 841.89;   // A4 pt height
    const CONTENT_W = PAGE_W - MARGIN * 2;
    const BRAND   = '#1a1a2e'; // dark navy for headers
    const ACCENT  = '#16213e'; // slightly lighter for rows
    const GRAY_ROW = '#f7f7f7';
    const BORDER  = '#d1d5db';

    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    const safeName = (vendor.name || String(id)).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    res.setHeader('Content-Disposition',
      `inline; filename="vendor-statement-${safeName}-${new Date().toISOString().slice(0,10)}.pdf"`);
    doc.pipe(res);

    let pageNum = 0;
    const drawHeader = () => {
      pageNum++;
      const top = MARGIN;

      // Brand bar
      doc.rect(MARGIN, top, CONTENT_W, 2).fill(BRAND);

      // Company name
      doc.fontSize(18).font('Helvetica-Bold').fillColor(BRAND)
         .text(companyName, MARGIN, top + 8, { width: CONTENT_W / 2 });

      // Company details (right side)
      let ry = top + 8;
      doc.fontSize(8).font('Helvetica').fillColor('#444');
      if (companyAddress) { doc.text(companyAddress, MARGIN + CONTENT_W / 2, ry, { align: 'right', width: CONTENT_W / 2 }); ry += 12; }
      if (companyGst)     { doc.text('GSTIN: ' + companyGst, MARGIN + CONTENT_W / 2, ry, { align: 'right', width: CONTENT_W / 2 }); ry += 12; }
      if (companyPhone)   { doc.text('Ph: ' + companyPhone,  MARGIN + CONTENT_W / 2, ry, { align: 'right', width: CONTENT_W / 2 }); }

      // Bottom border of header block
      const afterHeader = Math.max(doc.y + 10, top + 50);
      doc.rect(MARGIN, afterHeader, CONTENT_W, 1).fill(ACCENT);
      return afterHeader + 10;
    };

    let y = drawHeader();

    // ── Statement title & metadata ──────────────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND)
       .text('VENDOR STATEMENT OF ACCOUNT', MARGIN, y, { align: 'center', width: CONTENT_W });
    y = doc.y + 8;

    // Meta block: two columns
    const metaL = MARGIN;
    const metaR = MARGIN + CONTENT_W / 2 + 10;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#111');
    doc.text('To:', metaL, y);
    doc.font('Helvetica').text(vendor.name, metaL + 20, y);
    y = doc.y + 2;
    if (vendor.phone) {
      doc.font('Helvetica').fillColor('#555').text('Phone: ' + vendor.phone, metaL, y);
      y = doc.y + 2;
    }
    if (vendor.gst_number) {
      doc.text('GSTIN: ' + vendor.gst_number, metaL, y);
      y = doc.y + 2;
    }

    // Right meta
    const metaRY = y - (vendor.phone ? 24 : 12);
    doc.fontSize(9).font('Helvetica').fillColor('#555')
       .text('Generated: ' + new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
             metaR, metaRY, { align: 'right', width: CONTENT_W / 2 - 10 });
    if (from || to) {
      doc.text('Period: ' + (from || '—') + ' to ' + (to || '—'),
               metaR, metaRY + 14, { align: 'right', width: CONTENT_W / 2 - 10 });
    }

    y = doc.y + 14;
    doc.rect(MARGIN, y, CONTENT_W, 1).fill(BORDER);
    y += 10;

    // ── Table ───────────────────────────────────────────────────────────────
    // Column layout (x positions)
    const C = {
      date:   { x: MARGIN,                w: 65,  align: 'left'  },
      desc:   { x: MARGIN + 65,           w: 170, align: 'left'  },
      ref:    { x: MARGIN + 235,          w: 75,  align: 'left'  },
      debit:  { x: MARGIN + 310,         w: 75,  align: 'right' },
      credit: { x: MARGIN + 385,         w: 75,  align: 'right' },
      bal:    { x: MARGIN + 460,         w: 75,  align: 'right' },
    };

    const drawTableHeader = (topY) => {
      // Header fill
      doc.rect(MARGIN, topY, CONTENT_W, 18).fill(BRAND);
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
      const ly = topY + 5;
      doc.text('DATE',        C.date.x + 2,  ly, { width: C.date.w,   align: 'left'  });
      doc.text('DESCRIPTION', C.desc.x + 2,  ly, { width: C.desc.w,   align: 'left'  });
      doc.text('REF / TYPE',  C.ref.x  + 2,  ly, { width: C.ref.w,    align: 'left'  });
      doc.text('DEBIT',       C.debit.x + 2, ly, { width: C.debit.w,  align: 'right' });
      doc.text('CREDIT',      C.credit.x + 2,ly, { width: C.credit.w, align: 'right' });
      doc.text('BALANCE',     C.bal.x + 2,   ly, { width: C.bal.w,    align: 'right' });
      return topY + 18 + 2;
    };

    y = drawTableHeader(y);

    // Opening balance row
    doc.rect(MARGIN, y, CONTENT_W, 16).fill('#eef0f7');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#333');
    doc.text('Opening Balance', C.desc.x + 2, y + 4, { width: C.desc.w, align: 'left' });
    doc.text(fmtINR(openingBalance), C.bal.x + 2, y + 4, { width: C.bal.w, align: 'right' });
    y += 16;

    // Transaction rows
    const ROW_H = 16;
    ledger.forEach((r, i) => {
      // New page if needed
      if (y + ROW_H > PAGE_H - 80) {
        doc.addPage();
        y = drawHeader();
        y = drawTableHeader(y);
      }

      // Alternating fill
      if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(GRAY_ROW);
      else             doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill('#ffffff');

      const dateStr = r.date ? new Date(r.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '';
      const desc    = String(r.description || '').substring(0, 45);
      const refType = r.type === 'bill' ? 'Invoice' : 'Payment';

      doc.fontSize(7.5).font('Helvetica').fillColor('#222');
      doc.text(dateStr, C.date.x  + 2, y + 4, { width: C.date.w,   align: 'left'  });
      doc.text(desc,    C.desc.x  + 2, y + 4, { width: C.desc.w,   align: 'left'  });
      doc.text(refType, C.ref.x   + 2, y + 4, { width: C.ref.w,    align: 'left'  });

      if (r.debit  > 0) { doc.fillColor('#c53030').text(fmtINR(r.debit),  C.debit.x  + 2, y + 4, { width: C.debit.w,  align: 'right' }); }
      if (r.credit > 0) { doc.fillColor('#276749').text(fmtINR(r.credit), C.credit.x + 2, y + 4, { width: C.credit.w, align: 'right' }); }
      doc.fillColor('#111').text(fmtINR(r.balance), C.bal.x + 2, y + 4, { width: C.bal.w, align: 'right' });

      y += ROW_H;
    });

    // Bottom border of table
    doc.rect(MARGIN, y, CONTENT_W, 1).fill(BORDER);
    y += 8;

    // ── Totals summary box ──────────────────────────────────────────────────
    if (y + 70 > PAGE_H - 60) { doc.addPage(); y = drawHeader() + 10; }

    const boxX = MARGIN + CONTENT_W * 0.55;
    const boxW = CONTENT_W * 0.45;
    doc.rect(boxX, y, boxW, 62).stroke(BORDER);

    doc.fontSize(8).font('Helvetica').fillColor('#444');
    const lbl = boxX + 8;
    const val = boxX + boxW - 8;
    doc.text('Total Debits (Bills):',  lbl, y + 8,  { width: boxW - 16, align: 'left' });
    doc.fillColor('#c53030').text(fmtINR(totalDebit),  val, y + 8,  { align: 'right' });

    doc.fillColor('#444').text('Total Credits (Payments):', lbl, y + 22, { width: boxW - 16, align: 'left' });
    doc.fillColor('#276749').text(fmtINR(totalCredit), val, y + 22, { align: 'right' });

    // Closing balance — bold separator
    doc.rect(boxX, y + 38, boxW, 1).fill(BORDER);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#111');
    doc.text('Closing Balance:', lbl, y + 44, { width: boxW - 16, align: 'left' });
    doc.fillColor(closingBalance > 0 ? '#c53030' : '#276749')
       .text(fmtINR(Math.abs(closingBalance)), val, y + 44, { align: 'right' });

    // ── Footer (all pages) ──────────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let p = 0; p < totalPages; p++) {
      doc.switchToPage(p);
      const footerY = PAGE_H - 30;
      doc.rect(MARGIN, footerY - 4, CONTENT_W, 1).fill(BORDER);
      doc.fontSize(7).font('Helvetica').fillColor('#888')
         .text('This is a system-generated statement. No signature required.',
               MARGIN, footerY, { width: CONTENT_W / 2, align: 'left' })
         .text(`Page ${p + 1} of ${totalPages}`,
               MARGIN + CONTENT_W / 2, footerY, { width: CONTENT_W / 2, align: 'right' });
    }

    doc.flushPages();
    doc.end();

  } catch (error) {
    logger.error('Error generating vendor statement PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'PDF generation failed' });
    }
  }
});

// GET /api/vendors/:id/balance → current balance
router.get('/vendors/:id/balance', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT current_balance FROM vendors WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    res.json({ success: true, balance: Number(rows[0].current_balance) || 0 });
  } catch (error) {
    logger.error('Error fetching balance:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/vendors/:id/payments → list payments
router.get('/vendors/:id/payments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [payments] = await pool.query(`
      SELECT vp.*, vi.invoice_number
      FROM vendor_payments vp
      LEFT JOIN vendor_invoices vi ON vp.vendor_invoice_id = vi.id
      WHERE vp.vendor_id = ?
      ORDER BY vp.payment_date DESC
    `, [id]);
    res.json({ success: true, data: payments });
  } catch (error) {
    logger.error('Error fetching payments:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST /api/vendors/:id/payments → record payment scoped to vendor
router.post('/vendors/:id/payments', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addVendorPaymentSchema), recordVendorPayment);

// PUT /api/vendor-payments/:paymentId → edit payment
router.put('/vendor-payments/:paymentId', authenticateToken, authorizeRoles('Admin', 'Accountant'), validate(addVendorPaymentSchema), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { paymentId } = req.params;
    const { amount, payment_date, payment_mode, reference_number, notes } = req.body;
    
    const [payment] = await connection.query('SELECT * FROM vendor_payments WHERE id = ?', [paymentId]);
    if (payment.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    
    const oldPayment = payment[0];
    const vendorId = oldPayment.vendor_id;
    
    // For cheque, reference number is required
    if (payment_mode === 'cheque' && (!reference_number || reference_number.trim() === '')) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Reference number is required for cheque payments' });
    }
    
    // Update payment
    await connection.query(`
      UPDATE vendor_payments
      SET amount = ?, payment_date = ?, payment_mode = ?, reference_number = ?, notes = ?
      WHERE id = ?
    `, [amount, payment_date, payment_mode, reference_number || null, notes || null, paymentId]);
    
    // Adjust invoice paid amount
    const diff = Number(amount) - Number(oldPayment.amount);
    const [invoice] = await connection.query('SELECT * FROM vendor_invoices WHERE id = ?', [oldPayment.vendor_invoice_id]);
    if (invoice.length > 0) {
      const inv = invoice[0];
      const newPaidAmount = Number(inv.paid_amount || 0) + diff;
      let newStatus = 'partial';
      let newPaymentStatus = 'partial';
      if (newPaidAmount >= Number(inv.amount)) {
        newStatus = 'paid';
        newPaymentStatus = 'paid';
      } else if (newPaidAmount <= 0) {
        newStatus = 'pending';
        newPaymentStatus = 'unpaid';
      }
      
      await connection.query(`
        UPDATE vendor_invoices
        SET paid_amount = ?, status = ?, payment_status = ?
        WHERE id = ?
      `, [newPaidAmount, newStatus, newPaymentStatus, oldPayment.vendor_invoice_id]);
    }
    
    await connection.commit();
    
    const updatedBalance = await recalculateVendorBalance(vendorId, pool);
    
    auditLog(req.user.id, 'VENDOR_PAYMENT_UPDATE', `Updated payment ID ${paymentId}`, {
      entity_type: 'vendor_payment',
      entity_id: paymentId
    });
    
    res.json({ success: true, current_balance: updatedBalance, message: 'Payment updated successfully' });
  } catch (error) {
    await connection.rollback();
    logger.error('Error updating payment:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  } finally {
    connection.release();
  }
});

// DELETE /api/vendor-payments/:paymentId → delete payment
router.delete('/vendor-payments/:paymentId', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { paymentId } = req.params;
    
    const [payment] = await connection.query('SELECT * FROM vendor_payments WHERE id = ?', [paymentId]);
    if (payment.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    
    const oldPayment = payment[0];
    const vendorId = oldPayment.vendor_id;
    
    // Delete payment
    await connection.query('DELETE FROM vendor_payments WHERE id = ?', [paymentId]);
    
    // Adjust invoice paid amount
    const [invoice] = await connection.query('SELECT * FROM vendor_invoices WHERE id = ?', [oldPayment.vendor_invoice_id]);
    if (invoice.length > 0) {
      const inv = invoice[0];
      const newPaidAmount = Math.max(0, Number(inv.paid_amount || 0) - Number(oldPayment.amount));
      let newStatus = 'partial';
      let newPaymentStatus = 'partial';
      if (newPaidAmount >= Number(inv.amount)) {
        newStatus = 'paid';
        newPaymentStatus = 'paid';
      } else if (newPaidAmount <= 0) {
        newStatus = 'pending';
        newPaymentStatus = 'unpaid';
      }
      
      await connection.query(`
        UPDATE vendor_invoices
        SET paid_amount = ?, status = ?, payment_status = ?
        WHERE id = ?
      `, [newPaidAmount, newStatus, newPaymentStatus, oldPayment.vendor_invoice_id]);
    }
    
    await connection.commit();
    
    const updatedBalance = await recalculateVendorBalance(vendorId, pool);
    
    auditLog(req.user.id, 'VENDOR_PAYMENT_DELETE', `Deleted payment ID ${paymentId}`, {
      entity_type: 'vendor_payment',
      entity_id: paymentId
    });
    
    res.json({ success: true, current_balance: updatedBalance, message: 'Payment deleted successfully' });
  } catch (error) {
    await connection.rollback();
    logger.error('Error deleting payment:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  } finally {
    connection.release();
  }
});

// GET /api/vendors/:id/bills → list bills for vendor
router.get('/vendors/:id/bills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [bills] = await pool.query('SELECT * FROM vendor_invoices WHERE vendor_id = ? ORDER BY invoice_date DESC', [id]);
    res.json({ success: true, data: bills });
  } catch (error) {
    logger.error('Error fetching bills:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST /api/vendors/:id/bills → record purchase bill
router.post('/vendors/:id/bills', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addInvoiceSchema), recordVendorBill);

// PUT /api/vendor-bills/:billId → update bill
router.put('/vendor-bills/:billId', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), updateVendorBill);

// POST /api/vendors/:id/recalculate → trigger recalculation of balance manually
router.post('/vendors/:id/recalculate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const balance = await recalculateVendorBalance(parseInt(id), pool);
    res.json({ success: true, current_balance: balance, message: 'Balance recalculated successfully' });
  } catch (error) {
    logger.error('Error recalculating balance:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

module.exports = router;
const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { validate, addVendorSchema, addInvoiceSchema, addVendorPaymentSchema } = require('../middleware/validate');
const { paginate } = require('../helpers/pagination');
const multer = require('multer');
const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
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
    const { page = 1, limit = 20, search = '', category = '' } = req.query;

    let whereClause = 'WHERE v.is_active = TRUE';
    const params = [];

    if (search) {
      whereClause += ' AND (v.name LIKE ? OR v.contact_person LIKE ? OR v.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
        COUNT(CASE WHEN vi.status = 'overdue' THEN 1 END) as overdue_invoices
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

    const [result] = await pool.query(`
      INSERT INTO vendors (name, contact_person, phone, email, gstin, address, city, category, credit_days, credit_limit, notes, vendor_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      vendorData.name,
      vendorData.contact_person || null,
      vendorData.phone || null,
      vendorData.email || null,
      vendorData.gstin || null,
      vendorData.address || null,
      vendorData.city || null,
      vendorData.category || 'other',
      vendorData.credit_days || 0,
      vendorData.credit_limit || 0,
      vendorData.notes || null,
      vendorCode
    ]);

    auditLog(req.user.id, 'VENDOR_ADD', `Added vendor: ${vendorData.name} (${vendorCode})`, { entity_type: 'vendor', entity_id: result.insertId });

    res.json({ success: true, data: { id: result.insertId, vendor_code: vendorCode, message: 'Vendor added successfully' } });
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

    await pool.query(`
      UPDATE vendors
      SET name = ?, contact_person = ?, phone = ?, email = ?, gstin = ?, address = ?, city = ?, category = ?, credit_days = ?, credit_limit = ?, notes = ?, vendor_code = ?
      WHERE id = ?
    `, [
      vendorData.name,
      vendorData.contact_person || null,
      vendorData.phone || null,
      vendorData.email || null,
      vendorData.gstin || null,
      vendorData.address || null,
      vendorData.city || null,
      vendorData.category || 'other',
      vendorData.credit_days || 0,
      vendorData.credit_limit || 0,
      vendorData.notes || null,
      vendorData.vendor_code || null,
      id
    ]);

    auditLog(req.user.id, 'VENDOR_UPDATE', `Updated vendor: ${vendorData.name}`, { entity_type: 'vendor', entity_id: id });

    res.json({ success: true, message: 'Vendor updated successfully' });
  } catch (error) {
    console.error('Error updating vendor:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// DELETE /api/vendors/:id - Soft delete vendor
router.delete('/vendors/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const { id } = req.params;

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
    } catch (err) {
      // If vendor_invoices doesn't exist or fails, try sarga_vendor_bills
      try {
        const [bills] = await pool.query('SELECT COUNT(*) as count FROM sarga_vendor_bills WHERE vendor_id = ?', [id]);
        unpaidCount = bills[0].count;
      } catch (err2) {
        // Both queries failed, assume no invoices
        logger.warn('Could not check for unpaid invoices, proceeding with deletion:', err2.message);
      }
    }

    if (unpaidCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete vendor with unpaid invoices' });
    }

    await pool.query('UPDATE vendors SET is_active = FALSE WHERE id = ?', [id]);

    auditLog(req.user.id, 'VENDOR_DELETE', `Deleted vendor ID: ${id}`, { entity_type: 'vendor', entity_id: id });

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
router.post('/vendor-invoices', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addInvoiceSchema), async (req, res) => {
  try {
    const invoiceData = req.body;

    // Check if vendor exists
    const [vendor] = await pool.query('SELECT id, credit_days FROM vendors WHERE id = ? AND is_active = TRUE', [invoiceData.vendor_id]);
    if (vendor.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Calculate due date
    const invoiceDate = new Date(invoiceData.invoice_date);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + (vendor[0].credit_days || 0));

    const [result] = await pool.query(`
      INSERT INTO vendor_invoices (vendor_id, invoice_number, invoice_date, due_date, amount, branch, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceData.vendor_id,
      invoiceData.invoice_number || null,
      invoiceData.invoice_date,
      dueDate.toISOString().split('T')[0],
      invoiceData.amount,
      invoiceData.branch || 'common',
      invoiceData.notes || null
    ]);

    auditLog(req.user.id, 'VENDOR_INVOICE_ADD', `Added invoice for vendor ${invoiceData.vendor_id}`, { entity_type: 'vendor_invoice', entity_id: result.insertId });

    res.json({ success: true, data: { id: result.insertId, message: 'Invoice added successfully' } });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// PUT /api/vendor-invoices/:id - Update invoice
router.put('/vendor-invoices/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { id } = req.params;
    const invoiceData = req.body;

    await pool.query(`
      UPDATE vendor_invoices
      SET invoice_number = ?, invoice_date = ?, due_date = ?, amount = ?, branch = ?, notes = ?
      WHERE id = ?
    `, [
      invoiceData.invoice_number || null,
      invoiceData.invoice_date,
      invoiceData.due_date,
      invoiceData.amount,
      invoiceData.branch || 'common',
      invoiceData.notes || null,
      id
    ]);

    auditLog(req.user.id, 'VENDOR_INVOICE_UPDATE', `Updated invoice ${id}`, { entity_type: 'vendor_invoice', entity_id: id });

    res.json({ success: true, message: 'Invoice updated successfully' });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST /api/vendor-payments - Record payment
router.post('/vendor-payments', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addVendorPaymentSchema), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const paymentData = req.body;

    // Get invoice details
    const [invoice] = await connection.query('SELECT * FROM vendor_invoices WHERE id = ?', [paymentData.vendor_invoice_id]);
    if (invoice.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const inv = invoice[0];
    const balanceDue = inv.amount - inv.paid_amount;

    if (paymentData.amount > balanceDue) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Payment amount cannot exceed balance due of ₹${balanceDue}` });
    }

    // Insert payment
    const [paymentResult] = await connection.query(`
      INSERT INTO vendor_payments (vendor_invoice_id, vendor_id, amount, payment_date, payment_mode, reference_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      paymentData.vendor_invoice_id,
      inv.vendor_id,
      paymentData.amount,
      paymentData.payment_date,
      paymentData.payment_mode || 'cash',
      paymentData.reference_number || null,
      paymentData.notes || null
    ]);

    // Update invoice paid amount and status
    const newPaidAmount = inv.paid_amount + paymentData.amount;
    let newStatus = 'partial';
    if (newPaidAmount >= inv.amount) {
      newStatus = 'paid';
    } else if (new Date(inv.due_date) < new Date() && newPaidAmount < inv.amount) {
      newStatus = 'overdue';
    }

    await connection.query(`
      UPDATE vendor_invoices
      SET paid_amount = ?, status = ?
      WHERE id = ?
    `, [newPaidAmount, newStatus, paymentData.vendor_invoice_id]);

    await connection.commit();

    auditLog(req.user.id, 'VENDOR_PAYMENT_ADD', `Recorded payment of ₹${paymentData.amount} for invoice ${paymentData.vendor_invoice_id}`, {
      entity_type: 'vendor_payment',
      entity_id: paymentResult.insertId
    });

    res.json({ success: true, data: { id: paymentResult.insertId, message: 'Payment recorded successfully' } });
  } catch (error) {
    await connection.rollback();
    console.error('Error recording payment:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  } finally {
    connection.release();
  }
});

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
    } catch (e) {
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

module.exports = router;
const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// ─── GST Summary (monthly aggregation) ───
router.get('/accounts/gst-summary', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { startDate, endDate, branch_id } = req.query;

  // Default to current financial year April-March
  const now = new Date();
  const fyStart = now.getMonth() >= 3
    ? `${now.getFullYear()}-04-01`
    : `${now.getFullYear() - 1}-04-01`;
  const fyEnd = now.getMonth() >= 3
    ? `${now.getFullYear() + 1}-03-31`
    : `${now.getFullYear()}-03-31`;

  const start = startDate || fyStart;
  const end = endDate || fyEnd;

  let branchCond = '';
  const params = [start, `${end} 23:59:59`];
  if (branch_id) {
    branchCond = ' AND cp.branch_id = ?';
    params.push(branch_id);
  }

  // Output GST (collected on sales)
  const [outputGST] = await pool.query(`
    SELECT
      DATE_FORMAT(cp.payment_date, '%Y-%m') as month,
      COUNT(*) as invoice_count,
      COALESCE(SUM(cp.net_amount), 0) as taxable_value,
      COALESCE(SUM(cp.sgst_amount), 0) as sgst_collected,
      COALESCE(SUM(cp.cgst_amount), 0) as cgst_collected,
      COALESCE(SUM(cp.sgst_amount + cp.cgst_amount), 0) as total_gst_collected,
      COALESCE(SUM(cp.total_amount), 0) as total_sales
    FROM sarga_customer_payments cp
    WHERE cp.payment_date >= ? AND cp.payment_date <= ?
      ${branchCond}
    GROUP BY DATE_FORMAT(cp.payment_date, '%Y-%m')
    ORDER BY month ASC
  `, params);

  // Input GST (paid on purchases) — estimated from vendor bills using inventory gst_rate
  const purchaseParams = [start, `${end} 23:59:59`];
  let purchaseBranchCond = '';
  if (branch_id) {
    purchaseBranchCond = ' AND vb.branch_id = ?';
    purchaseParams.push(branch_id);
  }

  const [inputGST] = await pool.query(`
    SELECT
      DATE_FORMAT(vb.bill_date, '%Y-%m') as month,
      COUNT(DISTINCT vb.id) as bill_count,
      COALESCE(SUM(vbi.total_cost), 0) as total_purchase_value,
      COALESCE(SUM(
        CASE WHEN inv.gst_rate > 0
          THEN vbi.total_cost - (vbi.total_cost / (1 + inv.gst_rate / 100))
          ELSE 0
        END
      ), 0) as estimated_input_gst
    FROM sarga_vendor_bills vb
    LEFT JOIN sarga_vendor_bill_items vbi ON vbi.bill_id = vb.id
    LEFT JOIN sarga_inventory inv ON vbi.inventory_item_id = inv.id
    WHERE vb.bill_date >= ? AND vb.bill_date <= ?
      ${purchaseBranchCond}
    GROUP BY DATE_FORMAT(vb.bill_date, '%Y-%m')
    ORDER BY month ASC
  `, purchaseParams);

  // Totals
  const totalOutput = outputGST.reduce((s, r) => ({
    sgst: s.sgst + Number(r.sgst_collected),
    cgst: s.cgst + Number(r.cgst_collected),
    total: s.total + Number(r.total_gst_collected),
    sales: s.sales + Number(r.total_sales),
  }), { sgst: 0, cgst: 0, total: 0, sales: 0 });

  const totalInput = inputGST.reduce((s, r) => ({
    gst: s.gst + Number(r.estimated_input_gst),
    purchases: s.purchases + Number(r.total_purchase_value),
  }), { gst: 0, purchases: 0 });

  res.json({
    period: { start, end },
    output_gst: outputGST,
    input_gst: inputGST,
    totals: {
      output_sgst: totalOutput.sgst,
      output_cgst: totalOutput.cgst,
      output_total: totalOutput.total,
      total_sales: totalOutput.sales,
      input_gst: totalInput.gst,
      total_purchases: totalInput.purchases,
      net_gst_liability: totalOutput.total - totalInput.gst,
    }
  });
}));


// ─── Sales Register (sales bills list with GST) ───
router.get('/accounts/sales-register', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { startDate, endDate, branch_id, customer_id, search } = req.query;
  const { page, limit, offset } = parsePagination(req);

  let where = '1=1';
  const params = [];

  if (startDate) { where += ' AND cp.payment_date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND cp.payment_date <= ?'; params.push(`${endDate} 23:59:59`); }
  if (branch_id) { where += ' AND cp.branch_id = ?'; params.push(branch_id); }
  if (customer_id) { where += ' AND cp.customer_id = ?'; params.push(customer_id); }
  if (search) {
    where += ' AND (cp.customer_name LIKE ? OR cp.description LIKE ? OR i.invoice_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const baseQuery = `
    FROM sarga_customer_payments cp
    LEFT JOIN sarga_invoices i ON i.payment_id = cp.id
    LEFT JOIN sarga_branches b ON cp.branch_id = b.id
    LEFT JOIN sarga_customers c ON cp.customer_id = c.id
    WHERE ${where}
  `;

  const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseQuery}`, params);
  const [rows] = await pool.query(`
    SELECT cp.id, cp.payment_date, cp.customer_name, cp.customer_mobile,
      c.gst as customer_gstin,
      cp.bill_amount, cp.net_amount, cp.sgst_amount, cp.cgst_amount, cp.total_amount,
      cp.discount_percent, cp.discount_amount,
      cp.advance_paid, cp.balance_amount,
      cp.payment_method, cp.cash_amount, cp.upi_amount,
      cp.description, cp.order_lines,
      i.invoice_number, i.status as invoice_status,
      b.name as branch_name
    ${baseQuery}
    ORDER BY cp.payment_date DESC, cp.id DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  // Period totals
  const [[totals]] = await pool.query(`
    SELECT
      COALESCE(SUM(cp.net_amount), 0) as total_taxable,
      COALESCE(SUM(cp.sgst_amount), 0) as total_sgst,
      COALESCE(SUM(cp.cgst_amount), 0) as total_cgst,
      COALESCE(SUM(cp.total_amount), 0) as total_amount,
      COALESCE(SUM(cp.discount_amount), 0) as total_discount,
      COALESCE(SUM(cp.advance_paid), 0) as total_collected,
      COALESCE(SUM(cp.balance_amount), 0) as total_balance
    ${baseQuery}
  `, params);

  res.json({
    ...paginatedResponse(rows, cnt, page, limit),
    totals
  });
}));


// ─── Purchase Register (vendor bills with GST) ───
router.get('/accounts/purchase-register', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { startDate, endDate, branch_id, vendor_id, search } = req.query;
  const { page, limit, offset } = parsePagination(req);

  let where = '1=1';
  const params = [];

  if (startDate) { where += ' AND vb.bill_date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND vb.bill_date <= ?'; params.push(`${endDate} 23:59:59`); }
  if (branch_id) { where += ' AND vb.branch_id = ?'; params.push(branch_id); }
  if (vendor_id) { where += ' AND vb.vendor_id = ?'; params.push(vendor_id); }
  if (search) {
    where += ' AND (v.name LIKE ? OR vb.bill_number LIKE ? OR vb.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const baseQuery = `
    FROM sarga_vendor_bills vb
    LEFT JOIN sarga_vendors v ON vb.vendor_id = v.id
    LEFT JOIN sarga_branches b ON vb.branch_id = b.id
    WHERE ${where}
  `;

  const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseQuery}`, params);

  const [rows] = await pool.query(`
    SELECT vb.id, vb.bill_number, vb.bill_date, vb.total_amount, vb.description,
      v.name as vendor_name, v.gstin as vendor_gstin, v.phone as vendor_phone,
      b.name as branch_name,
      (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'item_name', inv.name,
        'sku', inv.sku,
        'quantity', vbi2.quantity,
        'unit_cost', vbi2.unit_cost,
        'total_cost', vbi2.total_cost,
        'gst_rate', inv.gst_rate
      )) FROM sarga_vendor_bill_items vbi2
        LEFT JOIN sarga_inventory inv ON vbi2.inventory_item_id = inv.id
        WHERE vbi2.bill_id = vb.id
      ) as items,
      (SELECT COALESCE(SUM(
        CASE WHEN inv2.gst_rate > 0
          THEN vbi3.total_cost - (vbi3.total_cost / (1 + inv2.gst_rate / 100))
          ELSE 0
        END
      ), 0) FROM sarga_vendor_bill_items vbi3
        LEFT JOIN sarga_inventory inv2 ON vbi3.inventory_item_id = inv2.id
        WHERE vbi3.bill_id = vb.id
      ) as estimated_gst,
      (SELECT COALESCE(SUM(p.amount), 0)
        FROM sarga_payments p
        WHERE p.type = 'Vendor' AND p.vendor_id = vb.vendor_id
          AND p.bill_reference_id = vb.id
      ) as paid_amount
    ${baseQuery}
    ORDER BY vb.bill_date DESC, vb.id DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  // Period totals
  const [[totals]] = await pool.query(`
    SELECT
      COUNT(*) as total_bills,
      COALESCE(SUM(vb.total_amount), 0) as total_amount,
      COALESCE(SUM(
        (SELECT COALESCE(SUM(
          CASE WHEN inv3.gst_rate > 0
            THEN vbi4.total_cost - (vbi4.total_cost / (1 + inv3.gst_rate / 100))
            ELSE 0
          END
        ), 0) FROM sarga_vendor_bill_items vbi4
          LEFT JOIN sarga_inventory inv3 ON vbi4.inventory_item_id = inv3.id
          WHERE vbi4.bill_id = vb.id)
      ), 0) as total_estimated_gst
    ${baseQuery}
  `, params);

  res.json({
    ...paginatedResponse(rows, cnt, page, limit),
    totals
  });
}));


// ─── GST Report data for filing (GSTR-1 / GSTR-3B style) ───
router.get('/accounts/gst-report', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { month, year, branch_id } = req.query;
  if (!month || !year) return res.status(400).json({ message: 'month and year are required' });

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

  let branchCond = '';
  const params = [startDate, `${endDate} 23:59:59`];
  if (branch_id) { branchCond = ' AND branch_id = ?'; params.push(branch_id); }

  // B2C sales (no GSTIN)
  const [[b2c]] = await pool.query(`
    SELECT COUNT(*) as count,
      COALESCE(SUM(net_amount), 0) as taxable_value,
      COALESCE(SUM(sgst_amount), 0) as sgst,
      COALESCE(SUM(cgst_amount), 0) as cgst,
      COALESCE(SUM(total_amount), 0) as total
    FROM sarga_customer_payments cp
    LEFT JOIN sarga_customers c ON cp.customer_id = c.id
    WHERE cp.payment_date >= ? AND cp.payment_date <= ?
      AND (c.gst IS NULL OR c.gst = '')
      ${branchCond}
  `, params);

  // B2B sales (with GSTIN)
  const b2bParams = [startDate, `${endDate} 23:59:59`];
  if (branch_id) b2bParams.push(branch_id);

  const [b2bRows] = await pool.query(`
    SELECT c.gst as gstin, c.name as customer_name,
      COUNT(*) as invoice_count,
      COALESCE(SUM(cp.net_amount), 0) as taxable_value,
      COALESCE(SUM(cp.sgst_amount), 0) as sgst,
      COALESCE(SUM(cp.cgst_amount), 0) as cgst,
      COALESCE(SUM(cp.total_amount), 0) as total
    FROM sarga_customer_payments cp
    LEFT JOIN sarga_customers c ON cp.customer_id = c.id
    WHERE cp.payment_date >= ? AND cp.payment_date <= ?
      AND c.gst IS NOT NULL AND c.gst != ''
      ${branchCond}
    GROUP BY c.gst, c.name
    ORDER BY total DESC
  `, b2bParams);

  // Summary for GSTR-3B style
  const [[summary]] = await pool.query(`
    SELECT
      COALESCE(SUM(net_amount), 0) as total_taxable,
      COALESCE(SUM(sgst_amount), 0) as total_sgst,
      COALESCE(SUM(cgst_amount), 0) as total_cgst,
      COALESCE(SUM(sgst_amount + cgst_amount), 0) as total_output_gst,
      COALESCE(SUM(total_amount), 0) as gross_sales
    FROM sarga_customer_payments
    WHERE payment_date >= ? AND payment_date <= ?
      ${branchCond}
  `, params);

  res.json({
    period: { month: Number(month), year: Number(year) },
    gstr1: { b2b: b2bRows, b2c },
    gstr3b: summary,
  });
}));

module.exports = router;

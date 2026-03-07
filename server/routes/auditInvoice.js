const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getNextInvoiceNumber, asyncHandler, auditLog } = require('../helpers');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// ─── Audit Logs (Admin / Accountant only) ───

/**
 * GET /audit-logs?entity_type=job&entity_id=42&action=JOB_UPDATE&startDate=2025-01-01&endDate=2025-12-31
 * Paginated audit log viewer with optional filters.
 */
router.get('/audit-logs', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { entity_type, entity_id, action, user_id, startDate, endDate } = req.query;
  const { page, limit, offset } = parsePagination(req);

  let where = '1=1';
  const params = [];

  if (entity_type) { where += ' AND a.entity_type = ?'; params.push(entity_type); }
  if (entity_id) { where += ' AND a.entity_id = ?'; params.push(entity_id); }
  if (action) { where += ' AND a.action LIKE ?'; params.push(`%${action}%`); }
  if (user_id) { where += ' AND a.user_id_internal = ?'; params.push(user_id); }
  if (startDate) { where += ' AND a.timestamp >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND a.timestamp <= ?'; params.push(`${endDate} 23:59:59`); }

  const baseQuery = `
    FROM sarga_audit_logs a
    LEFT JOIN sarga_staff s ON a.user_id_internal = s.id
    WHERE ${where}
  `;

  const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseQuery}`, params);
  const [rows] = await pool.query(
    `SELECT a.*, s.name as user_name, s.role as user_role ${baseQuery}
     ORDER BY a.timestamp DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, cnt, page, limit));
}));

/**
 * GET /audit-logs/entity/:type/:id
 * Full audit trail for a specific entity (e.g., job #42).
 */
router.get('/audit-logs/entity/:type/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const [rows] = await pool.query(
    `SELECT a.*, s.name as user_name, s.role as user_role
     FROM sarga_audit_logs a
     LEFT JOIN sarga_staff s ON a.user_id_internal = s.id
     WHERE a.entity_type = ? AND a.entity_id = ?
     ORDER BY a.timestamp DESC
     LIMIT 100`,
    [type, id]
  );
  res.json(rows);
}));


// ─── Invoice Management ───

/**
 * GET /invoices?startDate=&endDate=&customer_id=
 * List invoices with pagination.
 */
router.get('/invoices', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), asyncHandler(async (req, res) => {
  const { customer_id, startDate, endDate, status } = req.query;
  const { page, limit, offset } = parsePagination(req);

  let where = '1=1';
  const params = [];

  if (customer_id) { where += ' AND i.customer_id = ?'; params.push(customer_id); }
  if (status) { where += ' AND i.status = ?'; params.push(status); }
  if (startDate) { where += ' AND i.created_at >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND i.created_at <= ?'; params.push(`${endDate} 23:59:59`); }

  const baseQuery = `
    FROM sarga_invoices i
    LEFT JOIN sarga_customers c ON i.customer_id = c.id
    LEFT JOIN sarga_staff s ON i.generated_by = s.id
    WHERE ${where}
  `;

  const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseQuery}`, params);
  const [rows] = await pool.query(
    `SELECT i.*, c.name as customer_name, c.mobile as customer_mobile, s.name as generated_by_name
     ${baseQuery}
     ORDER BY i.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, cnt, page, limit));
}));

/**
 * POST /invoices/generate
 * Manually generate an invoice number (e.g., for a standalone invoice).
 * Returns the next sequential number without creating a payment.
 */
router.post('/invoices/generate', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), asyncHandler(async (req, res) => {
  const { customer_id, total_amount, tax_amount, net_amount } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const invoiceNumber = await getNextInvoiceNumber(connection, 'INV');

    await connection.query(
      `INSERT INTO sarga_invoices
       (invoice_number, financial_year, customer_id, total_amount, tax_amount, net_amount, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        invoiceNumber.split('/')[1] || '',
        customer_id || null,
        Number(total_amount) || 0,
        Number(tax_amount) || 0,
        Number(net_amount) || 0,
        req.user.id,
      ]
    );

    await connection.commit();
    auditLog(req.user.id, 'INVOICE_GENERATE', `Generated invoice ${invoiceNumber}`, { entity_type: 'invoice' });
    res.status(201).json({ invoice_number: invoiceNumber, message: 'Invoice number generated' });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

/**
 * PUT /invoices/:id/cancel
 * Cancel an invoice (creates audit trail).
 */
router.put('/invoices/:id/cancel', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const [invoices] = await pool.query('SELECT * FROM sarga_invoices WHERE id = ?', [id]);
  if (!invoices[0]) return res.status(404).json({ message: 'Invoice not found' });
  if (invoices[0].status !== 'Active') return res.status(400).json({ message: 'Only active invoices can be cancelled' });

  await pool.query(
    "UPDATE sarga_invoices SET status = 'Cancelled' WHERE id = ?", [id]
  );

  // Note: We do NOT reuse the number — gap stays for audit trail
  const { auditLog } = require('../helpers');
  auditLog(req.user.id, 'INVOICE_CANCEL', `Cancelled invoice ${invoices[0].invoice_number}. Reason: ${reason || 'Not specified'}`, {
    entity_type: 'invoice',
    entity_id: Number(id),
    field_name: 'status',
    old_value: 'Active',
    new_value: 'Cancelled',
    ip_address: req.ip,
  });

  res.json({ message: 'Invoice cancelled', invoice_number: invoices[0].invoice_number });
}));

module.exports = router;

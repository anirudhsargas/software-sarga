const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  }
});

const allowedDocExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.xls', '.xlsx', '.doc', '.docx']);
const documentFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedDocExts.has(ext)) return cb(null, true);
  return cb(new Error('Invalid file type. Allowed: JPG, PNG, WEBP, PDF, XLS, XLSX, DOC, DOCX.'));
};

const uploadDocs = multer({ storage: documentStorage, fileFilter: documentFileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// ========== OFFICE & ADMIN EXPENSES ==========

// Get office expenses dashboard
router.get('/office-dashboard', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    
    // Build branch filter
    const branchFilter = role === 'Admin' ? '' : 'WHERE o.branch_id = ?';
    const branchParams = role === 'Admin' ? [] : [branch_id];

    // Total spent this month
    const [totalRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_office_expenses o
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'} 
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Count of transactions this month
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM sarga_office_expenses o
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Breakdown by expense type
    const [breakdownRows] = await pool.query(
      `SELECT expense_type, SUM(amount) as total
       FROM sarga_office_expenses o
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       GROUP BY expense_type
       ORDER BY total DESC`,
      branchParams
    );

    // Recent expenses
    const [recentRows] = await pool.query(
      `SELECT o.*, s.name as created_by_name, b.name as branch_name
       FROM sarga_office_expenses o
       LEFT JOIN sarga_staff s ON o.created_by = s.id
       LEFT JOIN sarga_branches b ON o.branch_id = b.id
       ${branchFilter}
       ORDER BY o.expense_date DESC, o.created_at DESC
       LIMIT 20`,
      branchParams
    );

    res.json({
      total_spent: totalRows[0].total,
      transaction_count: countRows[0].count,
      breakdown: breakdownRows,
      recent_expenses: recentRows
    });
  } catch (error) {
    console.error('Office dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all office expenses with filters
router.get('/office-expenses', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { expense_type, start_date, end_date } = req.query;

    let query = `
      SELECT o.*, s.name as created_by_name, b.name as branch_name
      FROM sarga_office_expenses o
      LEFT JOIN sarga_staff s ON o.created_by = s.id
      LEFT JOIN sarga_branches b ON o.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (role !== 'Admin') {
      query += ' AND o.branch_id = ?';
      params.push(branch_id);
    }

    if (expense_type) {
      query += ' AND o.expense_type = ?';
      params.push(expense_type);
    }

    if (start_date) {
      query += ' AND o.expense_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND o.expense_date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY o.expense_date DESC, o.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get office expenses error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add office expense
router.post('/office-expenses', authenticateToken, async (req, res) => {
  try {
    const { branch_id, id: created_by } = req.user;
    const { expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number } = req.body;

    const [result] = await pool.query(
      `INSERT INTO sarga_office_expenses 
       (branch_id, expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number, created_by]
    );

    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add office expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update office expense
router.put('/office-expenses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number } = req.body;

    await pool.query(
      `UPDATE sarga_office_expenses 
       SET expense_type=?, vendor_name=?, amount=?, payment_method=?, reference_number=?, description=?, expense_date=?, bill_number=?
       WHERE id=?`,
      [expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update office expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete office expense
router.delete('/office-expenses/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only admins can delete expenses' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM sarga_office_expenses WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete office expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== TRANSPORT & DELIVERY EXPENSES ==========

// Get transport dashboard
router.get('/transport-dashboard', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    
    const branchFilter = role === 'Admin' ? '' : 'WHERE t.branch_id = ?';
    const branchParams = role === 'Admin' ? [] : [branch_id];

    // Total spent this month
    const [totalRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_transport_expenses t
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'} 
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Transaction count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM sarga_transport_expenses t
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Breakdown by transport type
    const [breakdownRows] = await pool.query(
      `SELECT transport_type, SUM(amount) as total, COUNT(*) as count
       FROM sarga_transport_expenses t
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       GROUP BY transport_type
       ORDER BY total DESC`,
      branchParams
    );

    // Total distance this month
    const [distanceRows] = await pool.query(
      `SELECT COALESCE(SUM(distance_km), 0) as total_km
       FROM sarga_transport_expenses t
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Recent expenses
    const [recentRows] = await pool.query(
      `SELECT t.*, s.name as created_by_name, b.name as branch_name
       FROM sarga_transport_expenses t
       LEFT JOIN sarga_staff s ON t.created_by = s.id
       LEFT JOIN sarga_branches b ON t.branch_id = b.id
       ${branchFilter}
       ORDER BY t.expense_date DESC, t.created_at DESC
       LIMIT 20`,
      branchParams
    );

    res.json({
      total_spent: totalRows[0].total,
      transaction_count: countRows[0].count,
      total_distance_km: distanceRows[0].total_km,
      breakdown: breakdownRows,
      recent_expenses: recentRows
    });
  } catch (error) {
    console.error('Transport dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all transport expenses with filters
router.get('/transport-expenses', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { transport_type, vehicle_number, start_date, end_date } = req.query;

    let query = `
      SELECT t.*, s.name as created_by_name, b.name as branch_name
      FROM sarga_transport_expenses t
      LEFT JOIN sarga_staff s ON t.created_by = s.id
      LEFT JOIN sarga_branches b ON t.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (role !== 'Admin') {
      query += ' AND t.branch_id = ?';
      params.push(branch_id);
    }

    if (transport_type) {
      query += ' AND t.transport_type = ?';
      params.push(transport_type);
    }

    if (vehicle_number) {
      query += ' AND t.vehicle_number LIKE ?';
      params.push(`%${vehicle_number}%`);
    }

    if (start_date) {
      query += ' AND t.expense_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND t.expense_date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY t.expense_date DESC, t.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get transport expenses error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add transport expense
router.post('/transport-expenses', authenticateToken, async (req, res) => {
  try {
    const { branch_id, id: created_by } = req.user;
    const { 
      transport_type, vehicle_number, driver_name, amount, payment_method, 
      reference_number, description, expense_date, bill_number, 
      from_location, to_location, distance_km 
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO sarga_transport_expenses 
       (branch_id, transport_type, vehicle_number, driver_name, amount, payment_method, reference_number, 
        description, expense_date, bill_number, from_location, to_location, distance_km, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, transport_type, vehicle_number, driver_name, amount, payment_method, reference_number, 
       description, expense_date, bill_number, from_location, to_location, distance_km, created_by]
    );

    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add transport expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update transport expense
router.put('/transport-expenses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      transport_type, vehicle_number, driver_name, amount, payment_method, 
      reference_number, description, expense_date, bill_number,
      from_location, to_location, distance_km 
    } = req.body;

    await pool.query(
      `UPDATE sarga_transport_expenses 
       SET transport_type=?, vehicle_number=?, driver_name=?, amount=?, payment_method=?, reference_number=?, 
           description=?, expense_date=?, bill_number=?, from_location=?, to_location=?, distance_km=?
       WHERE id=?`,
      [transport_type, vehicle_number, driver_name, amount, payment_method, reference_number, 
       description, expense_date, bill_number, from_location, to_location, distance_km, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update transport expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete transport expense
router.delete('/transport-expenses/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only admins can delete expenses' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM sarga_transport_expenses WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete transport expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== MISCELLANEOUS EXPENSES ==========

// Get miscellaneous dashboard
router.get('/misc-dashboard', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    
    const branchFilter = role === 'Admin' ? '' : 'WHERE m.branch_id = ?';
    const branchParams = role === 'Admin' ? [] : [branch_id];

    // Total spent this month
    const [totalRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_misc_expenses m
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'} 
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Transaction count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM sarga_misc_expenses m
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Top categories
    const [categoriesRows] = await pool.query(
      `SELECT expense_category, SUM(amount) as total, COUNT(*) as count
       FROM sarga_misc_expenses m
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       GROUP BY expense_category
       ORDER BY total DESC
       LIMIT 10`,
      branchParams
    );

    // Recurring expenses
    const [recurringRows] = await pool.query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM sarga_misc_expenses m
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       is_recurring = 1 AND
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Recent expenses
    const [recentRows] = await pool.query(
      `SELECT m.*, s.name as created_by_name, b.name as branch_name
       FROM sarga_misc_expenses m
       LEFT JOIN sarga_staff s ON m.created_by = s.id
       LEFT JOIN sarga_branches b ON m.branch_id = b.id
       ${branchFilter}
       ORDER BY m.expense_date DESC, m.created_at DESC
       LIMIT 20`,
      branchParams
    );

    res.json({
      total_spent: totalRows[0].total,
      transaction_count: countRows[0].count,
      recurring_count: recurringRows[0].count,
      recurring_total: recurringRows[0].total,
      top_categories: categoriesRows,
      recent_expenses: recentRows
    });
  } catch (error) {
    console.error('Misc dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all miscellaneous expenses with filters
router.get('/misc-expenses', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { expense_category, is_recurring, start_date, end_date } = req.query;

    let query = `
      SELECT m.*, s.name as created_by_name, b.name as branch_name
      FROM sarga_misc_expenses m
      LEFT JOIN sarga_staff s ON m.created_by = s.id
      LEFT JOIN sarga_branches b ON m.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (role !== 'Admin') {
      query += ' AND m.branch_id = ?';
      params.push(branch_id);
    }

    if (expense_category) {
      query += ' AND m.expense_category = ?';
      params.push(expense_category);
    }

    if (is_recurring !== undefined) {
      query += ' AND m.is_recurring = ?';
      params.push(is_recurring === 'true' ? 1 : 0);
    }

    if (start_date) {
      query += ' AND m.expense_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND m.expense_date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY m.expense_date DESC, m.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get misc expenses error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add miscellaneous expense
router.post('/misc-expenses', authenticateToken, async (req, res) => {
  try {
    const { branch_id, id: created_by } = req.user;
    const { 
      expense_category, vendor_name, amount, payment_method, reference_number, 
      description, expense_date, bill_number, is_recurring 
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO sarga_misc_expenses 
       (branch_id, expense_category, vendor_name, amount, payment_method, reference_number, 
        description, expense_date, bill_number, is_recurring, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, expense_category, vendor_name, amount, payment_method, reference_number, 
       description, expense_date, bill_number, is_recurring ? 1 : 0, created_by]
    );

    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add misc expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update miscellaneous expense
router.put('/misc-expenses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      expense_category, vendor_name, amount, payment_method, reference_number, 
      description, expense_date, bill_number, is_recurring 
    } = req.body;

    await pool.query(
      `UPDATE sarga_misc_expenses 
       SET expense_category=?, vendor_name=?, amount=?, payment_method=?, reference_number=?, 
           description=?, expense_date=?, bill_number=?, is_recurring=?
       WHERE id=?`,
      [expense_category, vendor_name, amount, payment_method, reference_number, 
       description, expense_date, bill_number, is_recurring ? 1 : 0, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update misc expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete miscellaneous expense
router.delete('/misc-expenses/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only admins can delete expenses' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM sarga_misc_expenses WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete misc expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== PETTY CASH MANAGEMENT ==========

// Get petty cash dashboard
router.get('/petty-cash-dashboard', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    
    const branchFilter = role === 'Admin' ? '' : 'WHERE p.branch_id = ?';
    const branchParams = role === 'Admin' ? [] : [branch_id];

    // Current balance (latest balance_after)
    const [balanceRows] = await pool.query(
      `SELECT balance_after as current_balance
       FROM sarga_petty_cash p
       ${branchFilter}
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 1`,
      branchParams
    );

    // Cash In this month
    const [cashInRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_petty_cash p
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       transaction_type = 'Cash In' AND
       DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Cash Out this month
    const [cashOutRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_petty_cash p
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       transaction_type = 'Cash Out' AND
       DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Transaction count this month
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM sarga_petty_cash p
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Recent transactions (ledger)
    const [ledgerRows] = await pool.query(
      `SELECT p.*, s.name as created_by_name, b.name as branch_name
       FROM sarga_petty_cash p
       LEFT JOIN sarga_staff s ON p.created_by = s.id
       LEFT JOIN sarga_branches b ON p.branch_id = b.id
       ${branchFilter}
       ORDER BY p.transaction_date DESC, p.created_at DESC
       LIMIT 50`,
      branchParams
    );

    res.json({
      current_balance: balanceRows.length > 0 ? balanceRows[0].current_balance : 0,
      cash_in_month: cashInRows[0].total,
      cash_out_month: cashOutRows[0].total,
      transaction_count: countRows[0].count,
      ledger: ledgerRows
    });
  } catch (error) {
    console.error('Petty cash dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get petty cash ledger with filters
router.get('/petty-cash-ledger', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { transaction_type, start_date, end_date } = req.query;

    let query = `
      SELECT p.*, s.name as created_by_name, b.name as branch_name
      FROM sarga_petty_cash p
      LEFT JOIN sarga_staff s ON p.created_by = s.id
      LEFT JOIN sarga_branches b ON p.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (role !== 'Admin') {
      query += ' AND p.branch_id = ?';
      params.push(branch_id);
    }

    if (transaction_type) {
      query += ' AND p.transaction_type = ?';
      params.push(transaction_type);
    }

    if (start_date) {
      query += ' AND p.transaction_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND p.transaction_date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY p.transaction_date DESC, p.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get petty cash ledger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add petty cash transaction
router.post('/petty-cash', authenticateToken, async (req, res) => {
  try {
    const { branch_id, id: created_by, role } = req.user;
    const { 
      transaction_date, transaction_type, amount, description, reference_number,
      received_from, paid_to, category 
    } = req.body;

    // Get current balance
    const [balanceRows] = await pool.query(
      `SELECT balance_after FROM sarga_petty_cash 
       WHERE branch_id = ? 
       ORDER BY transaction_date DESC, created_at DESC 
       LIMIT 1`,
      [branch_id]
    );

    let currentBalance = balanceRows.length > 0 ? parseFloat(balanceRows[0].balance_after) : 0;
    
    // Calculate new balance
    let newBalance = currentBalance;
    if (transaction_type === 'Opening') {
      newBalance = parseFloat(amount);
    } else if (transaction_type === 'Cash In') {
      newBalance = currentBalance + parseFloat(amount);
    } else if (transaction_type === 'Cash Out') {
      newBalance = currentBalance - parseFloat(amount);
    }

    const [result] = await pool.query(
      `INSERT INTO sarga_petty_cash 
       (branch_id, transaction_date, transaction_type, amount, description, reference_number, 
        balance_after, received_from, paid_to, category, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, transaction_date, transaction_type, amount, description, reference_number, 
       newBalance, received_from, paid_to, category, created_by]
    );

    res.json({ success: true, id: result.insertId, new_balance: newBalance });
  } catch (error) {
    console.error('Add petty cash transaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update petty cash transaction (Admin only, recalculates balances)
router.put('/petty-cash/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only admins can edit petty cash transactions' });
    }

    const { id } = req.params;
    const { 
      transaction_date, transaction_type, amount, description, reference_number,
      received_from, paid_to, category 
    } = req.body;

    // Get the transaction to update
    const [txRows] = await pool.query('SELECT * FROM sarga_petty_cash WHERE id = ?', [id]);
    if (txRows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = txRows[0];

    // Update the transaction
    await pool.query(
      `UPDATE sarga_petty_cash 
       SET transaction_date=?, transaction_type=?, amount=?, description=?, reference_number=?,
           received_from=?, paid_to=?, category=?
       WHERE id=?`,
      [transaction_date, transaction_type, amount, description, reference_number, 
       received_from, paid_to, category, id]
    );

    // Recalculate all balances for this branch from the updated date onwards
    const [allTxs] = await pool.query(
      `SELECT * FROM sarga_petty_cash 
       WHERE branch_id = ? AND transaction_date >= ?
       ORDER BY transaction_date ASC, created_at ASC`,
      [tx.branch_id, transaction_date]
    );

    // Get balance before this date
    const [prevBalance] = await pool.query(
      `SELECT balance_after FROM sarga_petty_cash 
       WHERE branch_id = ? AND transaction_date < ?
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 1`,
      [tx.branch_id, transaction_date]
    );

    let runningBalance = prevBalance.length > 0 ? parseFloat(prevBalance[0].balance_after) : 0;

    for (const t of allTxs) {
      if (t.transaction_type === 'Opening') {
        runningBalance = parseFloat(t.amount);
      } else if (t.transaction_type === 'Cash In') {
        runningBalance += parseFloat(t.amount);
      } else if (t.transaction_type === 'Cash Out') {
        runningBalance -= parseFloat(t.amount);
      }

      await pool.query(
        'UPDATE sarga_petty_cash SET balance_after = ? WHERE id = ?',
        [runningBalance, t.id]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update petty cash error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete petty cash transaction (Admin only)
router.delete('/petty-cash/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only admins can delete petty cash transactions' });
    }

    const { id } = req.params;
    
    // Get transaction details
    const [txRows] = await pool.query('SELECT * FROM sarga_petty_cash WHERE id = ?', [id]);
    if (txRows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = txRows[0];

    await pool.query('DELETE FROM sarga_petty_cash WHERE id = ?', [id]);

    // Recalculate balances after deletion
    const [allTxs] = await pool.query(
      `SELECT * FROM sarga_petty_cash 
       WHERE branch_id = ? AND transaction_date >= ?
       ORDER BY transaction_date ASC, created_at ASC`,
      [tx.branch_id, tx.transaction_date]
    );

    const [prevBalance] = await pool.query(
      `SELECT balance_after FROM sarga_petty_cash 
       WHERE branch_id = ? AND transaction_date < ?
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 1`,
      [tx.branch_id, tx.transaction_date]
    );

    let runningBalance = prevBalance.length > 0 ? parseFloat(prevBalance[0].balance_after) : 0;

    for (const t of allTxs) {
      if (t.transaction_type === 'Opening') {
        runningBalance = parseFloat(t.amount);
      } else if (t.transaction_type === 'Cash In') {
        runningBalance += parseFloat(t.amount);
      } else if (t.transaction_type === 'Cash Out') {
        runningBalance -= parseFloat(t.amount);
      }

      await pool.query(
        'UPDATE sarga_petty_cash SET balance_after = ? WHERE id = ?',
        [runningBalance, t.id]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete petty cash error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== BILLS & DOCUMENTS STORAGE ==========

// Get bills/documents with search filters
router.get('/bills-documents', authenticateToken, async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { document_type, vendor_name, start_date, end_date, related_tab } = req.query;

    let query = `
      SELECT bd.*, s.name as uploaded_by_name, b.name as branch_name
      FROM sarga_bills_documents bd
      LEFT JOIN sarga_staff s ON bd.uploaded_by = s.id
      LEFT JOIN sarga_branches b ON bd.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (role !== 'Admin') {
      query += ' AND bd.branch_id = ?';
      params.push(branch_id);
    }

    if (document_type) {
      query += ' AND bd.document_type = ?';
      params.push(document_type);
    }

    if (vendor_name) {
      query += ' AND bd.vendor_name LIKE ?';
      params.push(`%${vendor_name}%`);
    }

    if (start_date) {
      query += ' AND bd.bill_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND bd.bill_date <= ?';
      params.push(end_date);
    }

    if (related_tab) {
      query += ' AND bd.related_tab = ?';
      params.push(related_tab);
    }

    query += ' ORDER BY bd.bill_date DESC, bd.created_at DESC LIMIT 200';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get bills/documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload bill/document (file + metadata)
router.post('/bills-documents/upload', authenticateToken, uploadDocs.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const { branch_id, id: uploaded_by } = req.user;
    const {
      document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
      amount, description
    } = req.body;

    const filePath = `/uploads/${req.file.filename}`;
    const [result] = await pool.query(
      `INSERT INTO sarga_bills_documents 
       (branch_id, document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
        amount, file_path, file_name, file_type, file_size_kb, description, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branch_id,
        document_type,
        related_tab || null,
        related_id || null,
        vendor_name || null,
        bill_number || null,
        bill_date,
        amount || null,
        filePath,
        req.file.originalname,
        req.file.mimetype,
        Math.ceil(req.file.size / 1024),
        description || null,
        uploaded_by
      ]
    );

    res.json({ success: true, id: result.insertId, file_path: filePath });
  } catch (error) {
    console.error('Upload bill/document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add bill/document metadata
router.post('/bills-documents', authenticateToken, async (req, res) => {
  try {
    const { branch_id, id: uploaded_by } = req.user;
    const {
      document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
      amount, file_path, file_name, file_type, file_size_kb, description
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO sarga_bills_documents 
       (branch_id, document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
        amount, file_path, file_name, file_type, file_size_kb, description, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
       amount, file_path, file_name, file_type, file_size_kb, description, uploaded_by]
    );

    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add bill/document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update bill/document metadata
router.put('/bills-documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
      amount, description
    } = req.body;

    await pool.query(
      `UPDATE sarga_bills_documents 
       SET document_type=?, related_tab=?, related_id=?, vendor_name=?, bill_number=?, 
           bill_date=?, amount=?, description=?
       WHERE id=?`,
      [document_type, related_tab, related_id, vendor_name, bill_number, bill_date, 
       amount, description, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update bill/document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete bill/document
router.delete('/bills-documents/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only admins can delete documents' });
    }

    const { id } = req.params;
    const [rows] = await pool.query('SELECT file_path FROM sarga_bills_documents WHERE id = ?', [id]);
    await pool.query('DELETE FROM sarga_bills_documents WHERE id = ?', [id]);

    if (rows.length > 0 && rows[0].file_path && rows[0].file_path.startsWith('/uploads/')) {
      const fileName = path.basename(rows[0].file_path);
      const filePath = path.join(uploadsDir, fileName);
      if (filePath.startsWith(uploadsDir)) {
        fs.promises.unlink(filePath).catch(() => null);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete bill/document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== REPORTS & ANALYTICS ==========
const buildBranchFilter = (alias, req, params) => {
  if (req.user.role !== 'Admin') {
    params.push(req.user.branch_id);
    return ` AND ${alias}.branch_id = ?`;
  }
  if (req.query.branch_id) {
    params.push(req.query.branch_id);
    return ` AND ${alias}.branch_id = ?`;
  }
  return '';
};

const buildDateFilter = (field, startDate, endDate, params) => {
  let filter = '';
  if (startDate) {
    filter += ` AND ${field} >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    filter += ` AND ${field} <= ?`;
    params.push(endDate);
  }
  return filter;
};

const buildExpenseUnionQuery = (req, startDate, endDate) => {
  const params = [];
  const paymentFilters = `${buildBranchFilter('p', req, params)}${buildDateFilter('p.payment_date', startDate, endDate, params)}`;
  const officeFilters = `${buildBranchFilter('o', req, params)}${buildDateFilter('o.expense_date', startDate, endDate, params)}`;
  const transportFilters = `${buildBranchFilter('t', req, params)}${buildDateFilter('t.expense_date', startDate, endDate, params)}`;
  const miscFilters = `${buildBranchFilter('m', req, params)}${buildDateFilter('m.expense_date', startDate, endDate, params)}`;
  const pettyFilters = `${buildBranchFilter('pc', req, params)}${buildDateFilter('pc.transaction_date', startDate, endDate, params)}`;

  const query = `
    SELECT p.payment_date as expense_date, p.amount, p.type as category, p.type as sub_category, p.branch_id,
           p.payee_name as payee, p.payment_method as payment_method
    FROM sarga_payments p
    WHERE 1=1 ${paymentFilters}
    UNION ALL
    SELECT o.expense_date, o.amount, 'Office & Admin' as category, o.expense_type as sub_category, o.branch_id,
           o.vendor_name as payee, o.payment_method as payment_method
    FROM sarga_office_expenses o
    WHERE 1=1 ${officeFilters}
    UNION ALL
    SELECT t.expense_date, t.amount, 'Transport & Delivery' as category, t.transport_type as sub_category, t.branch_id,
           COALESCE(t.driver_name, t.vehicle_number) as payee, t.payment_method as payment_method
    FROM sarga_transport_expenses t
    WHERE 1=1 ${transportFilters}
    UNION ALL
    SELECT m.expense_date, m.amount, 'Miscellaneous' as category, m.expense_category as sub_category, m.branch_id,
           m.vendor_name as payee, m.payment_method as payment_method
    FROM sarga_misc_expenses m
    WHERE 1=1 ${miscFilters}
    UNION ALL
    SELECT pc.transaction_date as expense_date, pc.amount, 'Petty Cash' as category,
           COALESCE(pc.category, 'Petty Cash') as sub_category, pc.branch_id,
           pc.paid_to as payee, 'Cash' as payment_method
    FROM sarga_petty_cash pc
    WHERE pc.transaction_type = 'Cash Out' ${pettyFilters}
  `;

  return { query, params };
};

const getDefaultStartDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const getDefaultEndDate = () => new Date().toISOString().slice(0, 10);

router.get('/reports/monthly-expenses', authenticateToken, async (req, res) => {
  try {
    const startDate = req.query.start_date || getDefaultStartDate();
    const endDate = req.query.end_date || getDefaultEndDate();

    const unionA = buildExpenseUnionQuery(req, startDate, endDate);
    const [monthlyRows] = await pool.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m') as month, SUM(amount) as total
       FROM (${unionA.query}) x
       GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
       ORDER BY month ASC`,
      unionA.params
    );

    const unionB = buildExpenseUnionQuery(req, startDate, endDate);
    const [categoryRows] = await pool.query(
      `SELECT category, SUM(amount) as total
       FROM (${unionB.query}) x
       GROUP BY category
       ORDER BY total DESC`,
      unionB.params
    );

    res.json({
      rows: monthlyRows,
      categories: categoryRows,
      filters: { start_date: startDate, end_date: endDate }
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/category-wise', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const unionA = buildExpenseUnionQuery(req, start_date, end_date);
    const [categoryRows] = await pool.query(
      `SELECT category, SUM(amount) as total
       FROM (${unionA.query}) x
       GROUP BY category
       ORDER BY total DESC`,
      unionA.params
    );

    const unionB = buildExpenseUnionQuery(req, start_date, end_date);
    const [subCategoryRows] = await pool.query(
      `SELECT category, sub_category, SUM(amount) as total
       FROM (${unionB.query}) x
       GROUP BY category, sub_category
       ORDER BY category ASC, total DESC`,
      unionB.params
    );

    res.json({ rows: categoryRows, breakdown: subCategoryRows });
  } catch (error) {
    console.error('Category report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/branch-wise', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const unionA = buildExpenseUnionQuery(req, start_date, end_date);
    const [rows] = await pool.query(
      `SELECT b.name as branch_name, x.category, SUM(x.amount) as total
       FROM (${unionA.query}) x
       JOIN sarga_branches b ON x.branch_id = b.id
       GROUP BY b.name, x.category
       ORDER BY b.name ASC, total DESC`,
      unionA.params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Branch report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/vendor-ledger', authenticateToken, async (req, res) => {
  try {
    const { vendor_id, vendor_name, start_date, end_date } = req.query;
    const params = [];
    let filter = " WHERE p.type = 'Vendor'";
    filter += buildBranchFilter('p', req, params);
    filter += buildDateFilter('p.payment_date', start_date, end_date, params);

    if (vendor_id) {
      filter += ' AND p.vendor_id = ?';
      params.push(vendor_id);
    }
    if (vendor_name) {
      filter += ' AND p.payee_name LIKE ?';
      params.push(`%${vendor_name}%`);
    }

    const [rows] = await pool.query(
      `SELECT p.*, b.name as branch_name
       FROM sarga_payments p
       JOIN sarga_branches b ON p.branch_id = b.id
       ${filter}
       ORDER BY p.payment_date DESC`,
      params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Vendor ledger error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/utility-statement', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, utility_type } = req.query;
    const payParams = [];
    let payFilter = " WHERE p.type = 'Utility'";
    payFilter += buildBranchFilter('p', req, payParams);
    payFilter += buildDateFilter('p.payment_date', start_date, end_date, payParams);
    if (utility_type) { payFilter += " AND p.payee_name = ?"; payParams.push(utility_type); }

    const [payments] = await pool.query(
      `SELECT p.id, p.payee_name, p.amount, p.payment_method, p.reference_number, p.description, p.payment_date, p.branch_id, b.name as branch_name
       FROM sarga_payments p
       JOIN sarga_branches b ON p.branch_id = b.id
       ${payFilter}
       ORDER BY p.payment_date DESC`,
      payParams
    );

    const billParams = [];
    let billFilter = " WHERE 1=1";
    if (req.user.role !== 'Admin') { billFilter += " AND ub.branch_id = ?"; billParams.push(req.user.branch_id); }
    if (start_date) { billFilter += " AND ub.bill_date >= ?"; billParams.push(start_date); }
    if (end_date) { billFilter += " AND ub.bill_date <= ?"; billParams.push(end_date); }
    if (utility_type) { billFilter += " AND ub.utility_type = ?"; billParams.push(utility_type); }

    const [bills] = await pool.query(
      `SELECT ub.*, b.name as branch_name
       FROM sarga_utility_bills ub
       JOIN sarga_branches b ON ub.branch_id = b.id
       ${billFilter}
       ORDER BY ub.bill_date DESC`,
      billParams
    );

    res.json({ payments, bills, rows: payments });
  } catch (error) {
    console.error('Utility statement error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record a utility bill
router.post('/utility-bills', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  const { utility_type, amount, bill_number, bill_date, description, connection_id, branch_id } = req.body;
  const finalBranchId = req.user.role === 'Admin' ? (branch_id || req.user.branch_id) : req.user.branch_id;

  if (!utility_type || !amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Utility type and amount are required' });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO sarga_utility_bills (utility_type, branch_id, bill_number, bill_date, amount, description, connection_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [utility_type, finalBranchId, bill_number || null, bill_date || new Date().toISOString().split('T')[0], Number(amount), description || null, connection_id || null]
    );
    auditLog(req.user.id, 'UTILITY_BILL', `Utility bill ₹${amount} for ${utility_type}`);
    res.status(201).json({ id: result.insertId, message: 'Utility bill recorded' });
  } catch (err) {
    console.error('Utility bill error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// List utility bills
router.get('/utility-bills', authenticateToken, async (req, res) => {
  const { utility_type, branch_id } = req.query;
  try {
    let query = `SELECT ub.*, b.name as branch_name FROM sarga_utility_bills ub JOIN sarga_branches b ON ub.branch_id = b.id WHERE 1=1`;
    const params = [];
    if (utility_type) { query += " AND ub.utility_type = ?"; params.push(utility_type); }
    if (req.user.role !== 'Admin') { query += " AND ub.branch_id = ?"; params.push(req.user.branch_id); }
    else if (branch_id) { query += " AND ub.branch_id = ?"; params.push(branch_id); }
    query += " ORDER BY ub.bill_date DESC";
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Utility bills list error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// Delete a utility bill
router.delete('/utility-bills/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM sarga_utility_bills WHERE id = ?", [req.params.id]);
    const { auditLog } = require('../helpers');
    auditLog(req.user.id, 'UTILITY_BILL_DELETE', `Deleted utility bill ${req.params.id}`);
    res.json({ message: 'Utility bill deleted' });
  } catch (err) {
    console.error('Delete utility bill error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

router.get('/reports/rent-statement', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const params = [];
    let filter = " WHERE p.type = 'Rent'";
    filter += buildBranchFilter('p', req, params);
    filter += buildDateFilter('p.payment_date', start_date, end_date, params);

    const [rows] = await pool.query(
      `SELECT p.*, b.name as branch_name
       FROM sarga_payments p
       JOIN sarga_branches b ON p.branch_id = b.id
       ${filter}
       ORDER BY p.payment_date DESC`,
      params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Rent statement error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/emi-statement', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const params = [];
    let filter = ' WHERE 1=1';
    filter += buildBranchFilter('e', req, params);
    filter += buildDateFilter('p.payment_date', start_date, end_date, params);

    const [rows] = await pool.query(
      `SELECT p.*, e.institution_name, e.emi_type
       FROM sarga_emi_payments p
       JOIN sarga_emi_master e ON p.emi_id = e.id
       ${filter}
       ORDER BY p.payment_date DESC`,
      params
    );

    res.json({ rows });
  } catch (error) {
    console.error('EMI statement error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/kuri-statement', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const params = [];
    let filter = ' WHERE 1=1';
    filter += buildBranchFilter('k', req, params);
    filter += buildDateFilter('p.payment_date', start_date, end_date, params);

    const [rows] = await pool.query(
      `SELECT p.*, k.kuri_name
       FROM sarga_kuri_payments p
       JOIN sarga_kuri_master k ON p.kuri_id = k.id
       ${filter}
       ORDER BY p.payment_date DESC`,
      params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Kuri statement error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/cash-vs-bank', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const unionA = buildExpenseUnionQuery(req, start_date, end_date);
    const [rows] = await pool.query(
      `SELECT 
         SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END) as cash_total,
         SUM(CASE WHEN payment_method = 'UPI' THEN amount ELSE 0 END) as upi_total,
         SUM(CASE WHEN payment_method IN ('Cheque', 'Account Transfer', 'Bank Transfer') THEN amount ELSE 0 END) as bank_total,
         SUM(CASE WHEN payment_method NOT IN ('Cash', 'UPI', 'Cheque', 'Account Transfer', 'Bank Transfer') THEN amount ELSE 0 END) as other_total
       FROM (${unionA.query}) x`,
      unionA.params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Cash vs bank error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

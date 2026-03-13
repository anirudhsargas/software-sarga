const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog } = require('../helpers');

// ==================== EMI MASTER ROUTES ====================

// Get all EMI commitments with filters
router.get('/emi-master', authenticateToken, async (req, res) => {
  try {
    const branchId = !['Admin', 'Accountant'].includes(req.user.role)
      ? await getUserBranchId(req.user.id)
      : req.query.branch_id;

    let query = `
      SELECT 
        em.*,
        b.name as branch_name,
        (SELECT SUM(amount) FROM sarga_emi_payments WHERE emi_id = em.id) as total_paid,
        (SELECT COUNT(*) FROM sarga_emi_payments WHERE emi_id = em.id) as payment_count
      FROM sarga_emi_master em
      LEFT JOIN sarga_branches b ON em.branch_id = b.id
      WHERE 1=1
    `;

    const params = [];

    if (branchId) {
      query += ' AND em.branch_id = ?';
      params.push(branchId);
    }

    const { is_active, emi_type } = req.query;

    if (is_active !== undefined) {
      query += ' AND em.is_active = ?';
      params.push(is_active);
    }

    if (emi_type) {
      query += ' AND em.emi_type = ?';
      params.push(emi_type);
    }

    query += ' ORDER BY em.due_day ASC, em.created_at DESC';

    const [emis] = await pool.query(query, params);
    res.json(emis);
  } catch (error) {
    console.error('Error fetching EMIs:', error);
    res.status(500).json({ error: 'Failed to fetch EMIs' });
  }
});

// Get EMI dashboard KPIs
router.get('/emi-dashboard', authenticateToken, async (req, res) => {
  try {
    const branchId = !['Admin', 'Accountant'].includes(req.user.role)
      ? await getUserBranchId(req.user.id)
      : req.query.branch_id;

    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    let branchCondition = '';
    const params = [];

    if (branchId) {
      branchCondition = ' AND branch_id = ?';
      params.push(branchId);
    }

    // Total EMI per month
    const [totalEmi] = await pool.query(`
      SELECT COALESCE(SUM(monthly_emi), 0) as total
      FROM sarga_emi_master
      WHERE is_active = 1 ${branchCondition}
    `, params);

    // Due this month (not yet paid)
    const [dueMonth] = await pool.query(`
      SELECT em.*, b.name as branch_name
      FROM sarga_emi_master em
      LEFT JOIN sarga_branches b ON em.branch_id = b.id
      WHERE em.is_active = 1 
        AND em.id NOT IN (
          SELECT emi_id FROM sarga_emi_payments 
          WHERE MONTH(payment_date) = ? AND YEAR(payment_date) = ?
        )
        ${branchCondition}
      ORDER BY em.due_day ASC
    `, [currentMonth, currentYear, ...params]);

    // Paid this month
    const [paidMonth] = await pool.query(`
      SELECT COALESCE(SUM(ep.amount), 0) as total, COUNT(*) as count
      FROM sarga_emi_payments ep
      INNER JOIN sarga_emi_master em ON ep.emi_id = em.id
      WHERE MONTH(ep.payment_date) = ? 
        AND YEAR(ep.payment_date) = ?
        ${branchCondition ? 'AND em.branch_id = ?' : ''}
    `, branchCondition ? [currentMonth, currentYear, params[0]] : [currentMonth, currentYear]);

    // Upcoming in next 7 days
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const [upcoming] = await pool.query(`
      SELECT em.*, b.name as branch_name
      FROM sarga_emi_master em
      LEFT JOIN sarga_branches b ON em.branch_id = b.id
      WHERE em.is_active = 1 
        AND em.due_day BETWEEN DAY(?) AND DAY(?)
        AND em.id NOT IN (
          SELECT emi_id FROM sarga_emi_payments 
          WHERE MONTH(payment_date) = ? AND YEAR(payment_date) = ?
        )
        ${branchCondition}
      ORDER BY em.due_day ASC
    `, [today, nextWeek, currentMonth, currentYear, ...params]);

    res.json({
      totalEmiPerMonth: totalEmi[0].total,
      dueThisMonth: dueMonth,
      paidThisMonth: {
        amount: paidMonth[0].total,
        count: paidMonth[0].count
      },
      upcomingWeek: upcoming
    });
  } catch (error) {
    console.error('Error fetching EMI dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch EMI dashboard' });
  }
});

// Get single EMI with payment history
router.get('/emi-master/:id', authenticateToken, async (req, res) => {
  try {
    const branchId = !['Admin', 'Accountant'].includes(req.user.role)
      ? await getUserBranchId(req.user.id)
      : null;

    const [emis] = await pool.query(`
      SELECT 
        em.*,
        b.name as branch_name
      FROM sarga_emi_master em
      LEFT JOIN sarga_branches b ON em.branch_id = b.id
      WHERE em.id = ? ${branchId ? 'AND em.branch_id = ?' : ''}
    `, branchId ? [req.params.id, branchId] : [req.params.id]);

    if (emis.length === 0) {
      return res.status(404).json({ error: 'EMI not found' });
    }

    const [payments] = await pool.query(`
      SELECT 
        ep.*,
        s.name as created_by_name
      FROM sarga_emi_payments ep
      LEFT JOIN sarga_staff s ON ep.created_by = s.id
      WHERE ep.emi_id = ?
      ORDER BY ep.payment_date DESC
    `, [req.params.id]);

    res.json({
      emi: emis[0],
      payments
    });
  } catch (error) {
    console.error('Error fetching EMI details:', error);
    res.status(500).json({ error: 'Failed to fetch EMI details' });
  }
});

// Create new EMI
router.post('/emi-master', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Admin and Accountant can add EMI commitments' });
    }

    const {
      emi_type,
      institution_name,
      loan_amount,
      monthly_emi,
      start_date,
      end_date,
      due_day,
      account_number,
      branch_id,
      description
    } = req.body;

    const [result] = await pool.query(`
      INSERT INTO sarga_emi_master (
        emi_type, institution_name, loan_amount, monthly_emi, 
        start_date, end_date, due_day, account_number, 
        branch_id, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      emi_type,
      institution_name,
      loan_amount || 0,
      monthly_emi || 0,
      start_date,
      end_date || null,
      due_day || 5,
      account_number || null,
      branch_id || null,
      description || null
    ]);

    auditLog(req.user.id, 'EMI_CREATE', `Created EMI: ${institution_name} ₹${monthly_emi}/month`, { entity_type: 'emi', entity_id: result.insertId });
    res.status(201).json({
      id: result.insertId,
      message: 'EMI commitment created successfully'
    });
  } catch (error) {
    console.error('Error creating EMI:', error);
    res.status(500).json({ error: 'Failed to create EMI commitment' });
  }
});

// Update EMI
router.put('/emi-master/:id', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Admin and Accountant can update EMI commitments' });
    }

    const {
      emi_type,
      institution_name,
      loan_amount,
      monthly_emi,
      start_date,
      end_date,
      due_day,
      account_number,
      branch_id,
      description,
      is_active
    } = req.body;

    await pool.query(`
      UPDATE sarga_emi_master SET
        emi_type = ?,
        institution_name = ?,
        loan_amount = ?,
        monthly_emi = ?,
        start_date = ?,
        end_date = ?,
        due_day = ?,
        account_number = ?,
        branch_id = ?,
        description = ?,
        is_active = ?
      WHERE id = ?
    `, [
      emi_type,
      institution_name,
      loan_amount,
      monthly_emi,
      start_date,
      end_date || null,
      due_day,
      account_number || null,
      branch_id || null,
      description || null,
      is_active !== undefined ? is_active : 1,
      req.params.id
    ]);

    auditLog(req.user.id, 'EMI_UPDATE', `Updated EMI #${req.params.id}: ${institution_name}`, { entity_type: 'emi', entity_id: req.params.id });
    res.json({ message: 'EMI commitment updated successfully' });
  } catch (error) {
    console.error('Error updating EMI:', error);
    res.status(500).json({ error: 'Failed to update EMI commitment' });
  }
});

// Delete EMI
router.delete('/emi-master/:id', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Admin and Accountant can delete EMI commitments' });
    }

    // Check if payments exist
    const [payments] = await pool.query(
      'SELECT COUNT(*) as count FROM sarga_emi_payments WHERE emi_id = ?',
      [req.params.id]
    );

    if (payments[0].count > 0) {
      return res.status(400).json({
        error: `Cannot delete EMI with ${payments[0].count} payment record(s). Please deactivate instead.`
      });
    }

    await pool.query('DELETE FROM sarga_emi_master WHERE id = ?', [req.params.id]);

    auditLog(req.user.id, 'EMI_DELETE', `Deleted EMI #${req.params.id}`, { entity_type: 'emi', entity_id: req.params.id });
    res.json({ message: 'EMI commitment deleted successfully' });
  } catch (error) {
    console.error('Error deleting EMI:', error);
    res.status(500).json({ error: 'Failed to delete EMI commitment' });
  }
});

// ==================== EMI PAYMENT ROUTES ====================

// Record EMI payment
router.post('/emi-payments', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const {
      emi_id,
      payment_date,
      amount,
      payment_method,
      reference_number,
      notes
    } = req.body;

    // Record EMI payment
    const [result] = await pool.query(`
      INSERT INTO sarga_emi_payments (
        emi_id, payment_date, amount, payment_method,
        reference_number, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      emi_id,
      payment_date || new Date(),
      amount,
      payment_method || null,
      reference_number || null,
      notes || null,
      req.user.id
    ]);

    // SYNC WITH GLOBAL PAYMENTS TABLE
    const [[emiMaster]] = await pool.query('SELECT institution_name, branch_id FROM sarga_emi_master WHERE id = ?', [emi_id]);
    if (emiMaster) {
      await pool.query(`
        INSERT INTO sarga_payments 
        (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date) 
        VALUES (?, 'Other', ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        emiMaster.branch_id,
        emiMaster.institution_name,
        amount,
        payment_method || 'Cash',
        payment_method === 'UPI' ? 0 : amount,
        payment_method === 'UPI' ? amount : 0,
        reference_number,
        `EMI Payment: ${emiMaster.institution_name}${notes ? ' - ' + notes : ''}`,
        payment_date || new Date()
      ]);
    }

    auditLog(req.user.id, 'EMI_PAYMENT', `EMI payment ₹${amount} for EMI #${emi_id}`, { entity_type: 'emi_payment', entity_id: result.insertId });
    res.status(201).json({
      id: result.insertId,
      message: 'EMI payment recorded successfully'
    });
  } catch (error) {
    console.error('Error recording EMI payment:', error);
    res.status(500).json({ error: 'Failed to record EMI payment' });
  }
});

// ==================== KURI MASTER ROUTES ====================

// Get all Kuri commitments with filters
router.get('/kuri-master', authenticateToken, async (req, res) => {
  try {
    const branchId = !['Admin', 'Accountant'].includes(req.user.role)
      ? await getUserBranchId(req.user.id)
      : req.query.branch_id;

    let query = `
      SELECT 
        km.*,
        b.name as branch_name,
        (SELECT SUM(amount) FROM sarga_kuri_payments WHERE kuri_id = km.id) as total_paid,
        (SELECT COUNT(*) FROM sarga_kuri_payments WHERE kuri_id = km.id) as payment_count
      FROM sarga_kuri_master km
      LEFT JOIN sarga_branches b ON km.branch_id = b.id
      WHERE 1=1
    `;

    const params = [];

    if (branchId) {
      query += ' AND (km.branch_id = ? OR km.branch_id IS NULL)';
      params.push(branchId);
    }

    const { is_active, prize_taken } = req.query;

    if (is_active !== undefined) {
      query += ' AND km.is_active = ?';
      params.push(is_active);
    }

    if (prize_taken !== undefined) {
      query += ' AND km.prize_taken = ?';
      params.push(prize_taken);
    }

    query += ' ORDER BY km.due_day ASC, km.created_at DESC';

    const [kuris] = await pool.query(query, params);
    res.json(kuris);
  } catch (error) {
    console.error('Error fetching Kuris:', error);
    res.status(500).json({ error: 'Failed to fetch Kuris' });
  }
});

// Get Kuri dashboard KPIs
router.get('/kuri-dashboard', authenticateToken, async (req, res) => {
  try {
    const branchId = !['Admin', 'Accountant'].includes(req.user.role)
      ? await getUserBranchId(req.user.id)
      : req.query.branch_id;

    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    let branchCondition = '';
    const params = [];

    if (branchId) {
      branchCondition = ' AND (branch_id = ? OR branch_id IS NULL)';
      params.push(branchId);
    }

    // Total Kuri per month
    const [totalKuri] = await pool.query(`
      SELECT COALESCE(SUM(monthly_installment), 0) as total
      FROM sarga_kuri_master
      WHERE is_active = 1 ${branchCondition}
    `, params);

    // Due this month
    const [dueMonth] = await pool.query(`
      SELECT km.*, b.name as branch_name,
        km.monthly_installment - COALESCE((
          SELECT SUM(amount) FROM sarga_kuri_payments 
          WHERE kuri_id = km.id 
            AND MONTH(payment_date) = ? 
            AND YEAR(payment_date) = ?
        ), 0) as remaining_this_month
      FROM sarga_kuri_master km
      LEFT JOIN sarga_branches b ON km.branch_id = b.id
      WHERE km.is_active = 1 ${branchCondition}
      HAVING remaining_this_month > 0
      ORDER BY km.due_day ASC
    `, [currentMonth, currentYear, ...params]);

    // Paid this month
    const [paidMonth] = await pool.query(`
      SELECT COALESCE(SUM(kp.amount), 0) as total, COUNT(*) as count
      FROM sarga_kuri_payments kp
      INNER JOIN sarga_kuri_master km ON kp.kuri_id = km.id
      WHERE MONTH(kp.payment_date) = ? 
        AND YEAR(kp.payment_date) = ?
        ${branchCondition ? 'AND km.branch_id = ?' : ''}
    `, branchCondition ? [currentMonth, currentYear, params[0]] : [currentMonth, currentYear]);

    // Prize information
    const [prizes] = await pool.query(`
      SELECT km.*, b.name as branch_name
      FROM sarga_kuri_master km
      LEFT JOIN sarga_branches b ON km.branch_id = b.id
      WHERE km.is_active = 1 
        AND km.prize_taken = 1
        ${branchCondition}
      ORDER BY km.prize_date DESC
    `, params);

    res.json({
      totalKuriPerMonth: totalKuri[0].total,
      dueThisMonth: dueMonth,
      paidThisMonth: {
        amount: paidMonth[0].total,
        count: paidMonth[0].count
      },
      prizesReceived: prizes
    });
  } catch (error) {
    console.error('Error fetching Kuri dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch Kuri dashboard' });
  }
});

// Get single Kuri with payment history
router.get('/kuri-master/:id', authenticateToken, async (req, res) => {
  try {
    const branchId = !['Admin', 'Accountant'].includes(req.user.role)
      ? await getUserBranchId(req.user.id)
      : null;

    const [kuris] = await pool.query(`
      SELECT 
        km.*,
        b.name as branch_name
      FROM sarga_kuri_master km
      LEFT JOIN sarga_branches b ON km.branch_id = b.id
      WHERE km.id = ? ${branchId ? 'AND km.branch_id = ?' : ''}
    `, branchId ? [req.params.id, branchId] : [req.params.id]);

    if (kuris.length === 0) {
      return res.status(404).json({ error: 'Kuri not found' });
    }

    const [payments] = await pool.query(`
      SELECT 
        kp.*,
        s.name as created_by_name
      FROM sarga_kuri_payments kp
      LEFT JOIN sarga_staff s ON kp.created_by = s.id
      WHERE kp.kuri_id = ?
      ORDER BY kp.payment_date DESC
    `, [req.params.id]);

    res.json({
      kuri: kuris[0],
      payments
    });
  } catch (error) {
    console.error('Error fetching Kuri details:', error);
    res.status(500).json({ error: 'Failed to fetch Kuri details' });
  }
});

// Create new Kuri
router.post('/kuri-master', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Admin and Accountant can add Kuri commitments' });
    }

    const {
      kuri_name,
      organizer_name,
      organizer_phone,
      total_amount,
      monthly_installment,
      start_date,
      end_date,
      due_day,
      prize_taken,
      prize_amount,
      prize_date,
      branch_id,
      description
    } = req.body;

    const [result] = await pool.query(`
      INSERT INTO sarga_kuri_master (
        kuri_name, organizer_name, organizer_phone,
        total_amount, monthly_installment, start_date, end_date,
        due_day, prize_taken, prize_amount, prize_date,
        branch_id, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      kuri_name,
      organizer_name || null,
      organizer_phone || null,
      total_amount || 0,
      monthly_installment || 0,
      start_date,
      end_date || null,
      due_day || 5,
      prize_taken || 0,
      prize_amount || 0,
      prize_date || null,
      branch_id || null,
      description || null
    ]);

    auditLog(req.user.id, 'KURI_CREATE', `Created Kuri: ${kuri_name} ₹${monthly_installment}/month`, { entity_type: 'kuri', entity_id: result.insertId });
    res.status(201).json({
      id: result.insertId,
      message: 'Kuri commitment created successfully'
    });
  } catch (error) {
    console.error('Error creating Kuri:', error);
    res.status(500).json({ error: 'Failed to create Kuri commitment' });
  }
});

// Update Kuri
router.put('/kuri-master/:id', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Admin and Accountant can update Kuri commitments' });
    }

    const {
      kuri_name,
      organizer_name,
      organizer_phone,
      total_amount,
      monthly_installment,
      start_date,
      end_date,
      due_day,
      prize_taken,
      prize_amount,
      prize_date,
      branch_id,
      description,
      is_active
    } = req.body;

    await pool.query(`
      UPDATE sarga_kuri_master SET
        kuri_name = ?,
        organizer_name = ?,
        organizer_phone = ?,
        total_amount = ?,
        monthly_installment = ?,
        start_date = ?,
        end_date = ?,
        due_day = ?,
        prize_taken = ?,
        prize_amount = ?,
        prize_date = ?,
        branch_id = ?,
        description = ?,
        is_active = ?
      WHERE id = ?
    `, [
      kuri_name,
      organizer_name || null,
      organizer_phone || null,
      total_amount,
      monthly_installment,
      start_date,
      end_date || null,
      due_day,
      prize_taken || 0,
      prize_amount || 0,
      prize_date || null,
      branch_id || null,
      description || null,
      is_active !== undefined ? is_active : 1,
      req.params.id
    ]);

    auditLog(req.user.id, 'KURI_UPDATE', `Updated Kuri #${req.params.id}: ${kuri_name}`, { entity_type: 'kuri', entity_id: req.params.id });
    res.json({ message: 'Kuri commitment updated successfully' });
  } catch (error) {
    console.error('Error updating Kuri:', error);
    res.status(500).json({ error: 'Failed to update Kuri commitment' });
  }
});

// Delete Kuri
router.delete('/kuri-master/:id', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Admin and Accountant can delete Kuri commitments' });
    }

    // Check if payments exist
    const [payments] = await pool.query(
      'SELECT COUNT(*) as count FROM sarga_kuri_payments WHERE kuri_id = ?',
      [req.params.id]
    );

    if (payments[0].count > 0) {
      return res.status(400).json({
        error: `Cannot delete Kuri with ${payments[0].count} payment record(s). Please deactivate instead.`
      });
    }

    await pool.query('DELETE FROM sarga_kuri_master WHERE id = ?', [req.params.id]);

    auditLog(req.user.id, 'KURI_DELETE', `Deleted Kuri #${req.params.id}`, { entity_type: 'kuri', entity_id: req.params.id });
    res.json({ message: 'Kuri commitment deleted successfully' });
  } catch (error) {
    console.error('Error deleting Kuri:', error);
    res.status(500).json({ error: 'Failed to delete Kuri commitment' });
  }
});

// ==================== KURI PAYMENT ROUTES ====================

// Record Kuri payment (supports daily small payments)
router.post('/kuri-payments', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const {
      kuri_id,
      payment_date,
      amount,
      payment_method,
      reference_number,
      notes
    } = req.body;

    // Record Kuri payment (supports daily small payments)
    const [result] = await pool.query(`
      INSERT INTO sarga_kuri_payments (
        kuri_id, payment_date, amount, payment_method,
        reference_number, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      kuri_id,
      payment_date || new Date(),
      amount,
      payment_method || null,
      reference_number || null,
      notes || null,
      req.user.id
    ]);

    // SYNC WITH GLOBAL PAYMENTS TABLE
    const [[kuriMaster]] = await pool.query('SELECT kuri_name, branch_id FROM sarga_kuri_master WHERE id = ?', [kuri_id]);
    if (kuriMaster) {
      await pool.query(`
        INSERT INTO sarga_payments 
        (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date) 
        VALUES (?, 'Other', ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        kuriMaster.branch_id,
        kuriMaster.kuri_name,
        amount,
        payment_method || 'Cash',
        payment_method === 'UPI' ? 0 : amount,
        payment_method === 'UPI' ? amount : 0,
        reference_number,
        `Kuri Payment: ${kuriMaster.kuri_name}${notes ? ' - ' + notes : ''}`,
        payment_date || new Date()
      ]);
    }

    auditLog(req.user.id, 'KURI_PAYMENT', `Kuri payment ₹${amount} for Kuri #${kuri_id}`, { entity_type: 'kuri_payment', entity_id: result.insertId });
    res.status(201).json({
      id: result.insertId,
      message: 'Kuri payment recorded successfully'
    });
  } catch (error) {
    console.error('Error recording Kuri payment:', error);
    res.status(500).json({ error: 'Failed to record Kuri payment' });
  }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, normalizeRole } = require('../middleware/auth');

// ─── Helpers ───
const hasShortcutAccess = (user, branchId) => {
  const role = normalizeRole(user.role);
  if (role === 'Admin') return true;
  if (role === 'Front Office' && String(user.branch_id) === String(branchId)) return true;
  return false;
};

// ─── Named routes (must come before /:id to avoid conflicts) ───

// GET /api/shortcuts?branch_id=X
router.get('/', authenticateToken, async (req, res) => {
  try {
    const branchId = parseInt(req.query.branch_id, 10);
    if (!req.query.branch_id || isNaN(branchId) || branchId <= 0) {
      return res.status(400).json({ message: 'branch_id must be a valid positive integer' });
    }

    const [rows] = await pool.query(
      `SELECT * FROM bill_shortcuts
       WHERE branch_id = ? AND is_active = 1
       ORDER BY sort_order ASC, name ASC`,
      [branchId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching bill shortcuts:', err);
    res.status(500).json({ message: 'Failed to fetch shortcuts' });
  }
});

// POST /api/shortcuts
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { shortcuts } = req.body;
    const branch_id = parseInt(req.body.branch_id, 10);
    if (!req.body.branch_id || isNaN(branch_id) || branch_id <= 0 || !shortcuts || !Array.isArray(shortcuts) || shortcuts.length === 0) {
      return res.status(400).json({ message: 'branch_id (integer) and shortcuts array are required' });
    }

    if (!hasShortcutAccess(req.user, branch_id)) {
      return res.status(403).json({ message: 'Access denied for this branch' });
    }

    const created = [];
    for (const sc of shortcuts) {
      const [result] = await pool.query(
        `INSERT INTO bill_shortcuts
         (branch_id, name, product_id, price, unit, customer_type, payment_mode, icon_name, color, sort_order, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          branch_id,
          sc.name,
          sc.product_id || null,
          sc.price || 0,
          sc.unit || 'page',
          sc.customer_type || 'walk_in',
          sc.payment_mode || 'cash',
          sc.icon_name || 'bolt',
          sc.color || 'purple',
          sc.sort_order || 0,
          req.user.id
        ]
      );
      created.push({ id: result.insertId, ...sc });
    }

    res.status(201).json({ message: 'Shortcuts created', shortcuts: created });
  } catch (err) {
    console.error('Error creating bill shortcuts:', err);
    res.status(500).json({ message: 'Failed to create shortcuts' });
  }
});

// PUT /api/shortcuts/reorder  (before /:id)
router.put('/reorder', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required' });
    }

    for (const item of items) {
      if (item.id == null || item.sort_order == null) continue;

      const [existing] = await pool.query('SELECT branch_id FROM bill_shortcuts WHERE id = ?', [item.id]);
      if (existing.length && !hasShortcutAccess(req.user, existing[0].branch_id)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await pool.query('UPDATE bill_shortcuts SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
    }

    res.json({ message: 'Shortcuts reordered' });
  } catch (err) {
    console.error('Error reordering shortcuts:', err);
    res.status(500).json({ message: 'Failed to reorder shortcuts' });
  }
});

// POST /api/shortcuts/suggest  (before /:id)
router.post('/suggest', authenticateToken, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (role !== 'Front Office') {
      return res.status(403).json({ message: 'Only Front Office can suggest shortcuts' });
    }

    const { target_branch_id, shortcut_data } = req.body;
    if (!target_branch_id || !shortcut_data) {
      return res.status(400).json({ message: 'target_branch_id and shortcut_data are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO shortcut_suggestions (source_branch_id, target_branch_id, shortcut_data, suggested_by, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [req.user.branch_id, target_branch_id, JSON.stringify(shortcut_data), req.user.id]
    );

    res.status(201).json({ message: 'Suggestion submitted', id: result.insertId });
  } catch (err) {
    console.error('Error creating shortcut suggestion:', err);
    res.status(500).json({ message: 'Failed to submit suggestion' });
  }
});

// GET /api/shortcuts/suggestions?branch_id=X  (before /:id)
router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const branchId = parseInt(req.query.branch_id, 10);
    if (!req.query.branch_id || isNaN(branchId) || branchId <= 0) {
      return res.status(400).json({ message: 'branch_id must be a valid positive integer' });
    }

    const role = normalizeRole(req.user.role);
    if (role === 'Front Office' && String(req.user.branch_id) !== String(branchId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [rows] = await pool.query(
      `SELECT ss.*, s.name AS suggested_by_name
       FROM shortcut_suggestions ss
       LEFT JOIN sarga_staff s ON s.id = ss.suggested_by
       WHERE ss.target_branch_id = ? AND ss.status = 'pending'
       ORDER BY ss.created_at DESC`,
      [branchId]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error fetching suggestions:', err);
    res.status(500).json({ message: 'Failed to fetch suggestions' });
  }
});

// PUT /api/shortcuts/suggestions/:id/accept  (before /:id)
router.put('/suggestions/:id/accept', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT * FROM shortcut_suggestions WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Suggestion not found' });
    }

    const suggestion = existing[0];
    const role = normalizeRole(req.user.role);
    if (role !== 'Admin' && !(role === 'Front Office' && String(req.user.branch_id) === String(suggestion.target_branch_id))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const data = typeof suggestion.shortcut_data === 'string'
      ? JSON.parse(suggestion.shortcut_data)
      : suggestion.shortcut_data;

    await pool.query(
      `INSERT INTO bill_shortcuts
       (branch_id, name, product_id, price, unit, customer_type, payment_mode, icon_name, color, sort_order, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        suggestion.target_branch_id,
        data.name,
        data.product_id || null,
        data.price || 0,
        data.unit || 'page',
        data.customer_type || 'walk_in',
        data.payment_mode || 'cash',
        data.icon_name || 'bolt',
        data.color || 'purple',
        data.sort_order || 0,
        req.user.id
      ]
    );

    await pool.query("UPDATE shortcut_suggestions SET status = 'accepted' WHERE id = ?", [id]);

    res.json({ message: 'Suggestion accepted and shortcut created' });
  } catch (err) {
    console.error('Error accepting suggestion:', err);
    res.status(500).json({ message: 'Failed to accept suggestion' });
  }
});

// PUT /api/shortcuts/suggestions/:id/reject  (before /:id)
router.put('/suggestions/:id/reject', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT * FROM shortcut_suggestions WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Suggestion not found' });
    }

    const suggestion = existing[0];
    const role = normalizeRole(req.user.role);
    if (role !== 'Admin' && !(role === 'Front Office' && String(req.user.branch_id) === String(suggestion.target_branch_id))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await pool.query("UPDATE shortcut_suggestions SET status = 'rejected' WHERE id = ?", [id]);
    res.json({ message: 'Suggestion rejected' });
  } catch (err) {
    console.error('Error rejecting suggestion:', err);
    res.status(500).json({ message: 'Failed to reject suggestion' });
  }
});

// ─── Parameterized routes (must come after named routes) ───

// PUT /api/shortcuts/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT * FROM bill_shortcuts WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Shortcut not found' });
    }

    const shortcut = existing[0];
    if (!hasShortcutAccess(req.user, shortcut.branch_id)) {
      return res.status(403).json({ message: 'Access denied for this shortcut' });
    }

    const { name, product_id, price, unit, customer_type, payment_mode, icon_name, color, sort_order } = req.body;

    await pool.query(
      `UPDATE bill_shortcuts SET
        name = COALESCE(?, name),
        product_id = COALESCE(?, product_id),
        price = COALESCE(?, price),
        unit = COALESCE(?, unit),
        customer_type = COALESCE(?, customer_type),
        payment_mode = COALESCE(?, payment_mode),
        icon_name = COALESCE(?, icon_name),
        color = COALESCE(?, color),
        sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
      [name, product_id, price, unit, customer_type, payment_mode, icon_name, color, sort_order, id]
    );

    res.json({ message: 'Shortcut updated' });
  } catch (err) {
    console.error('Error updating bill shortcut:', err);
    res.status(500).json({ message: 'Failed to update shortcut' });
  }
});

// DELETE /api/shortcuts/:id  (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT * FROM bill_shortcuts WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ message: 'Shortcut not found' });
    }

    if (!hasShortcutAccess(req.user, existing[0].branch_id)) {
      return res.status(403).json({ message: 'Access denied for this shortcut' });
    }

    await pool.query('UPDATE bill_shortcuts SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Shortcut deleted' });
  } catch (err) {
    console.error('Error deleting bill shortcut:', err);
    res.status(500).json({ message: 'Failed to delete shortcut' });
  }
});

module.exports = router;

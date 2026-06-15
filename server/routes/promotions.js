const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const crypto = require('crypto');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function generateSlug(title) {
  return title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '') + '-' + crypto.randomBytes(3).toString('hex');
}

// ─── PUBLIC: Get active promotions ───
router.get('/website/promotions', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, title, slug, description, banner_image, banner_mobile_image, campaign_type,
            discount_percent, discount_code, link_url, priority,
            start_date, end_date
     FROM sarga_promotions
     WHERE is_active = 1 AND NOW() BETWEEN start_date AND end_date
     ORDER BY priority DESC, start_date DESC
     LIMIT 10`
  );
  res.json({ promotions: rows });
}));

// ─── PUBLIC: Get active banner promotions ───
router.get('/website/promotions/banners', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, title, description, banner_image, banner_mobile_image, campaign_type,
            discount_percent, discount_code, link_url, priority
     FROM sarga_promotions
     WHERE is_active = 1 AND NOW() BETWEEN start_date AND end_date
       AND banner_image IS NOT NULL AND banner_image != ''
     ORDER BY priority DESC, start_date DESC
     LIMIT 5`
  );
  res.json({ banners: rows });
}));

// ─── ADMIN: List all promotions ───
router.get('/promotions', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM sarga_promotions ORDER BY priority DESC, created_at DESC'
  );
  res.json({ promotions: rows });
}));

// ─── ADMIN: Create promotion ───
router.post('/promotions', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { title, description, banner_image, banner_mobile_image, campaign_type, start_date, end_date, discount_percent, discount_code, link_url, priority, is_active } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const slug = generateSlug(title);
  const [result] = await pool.query(
    `INSERT INTO sarga_promotions (title, slug, description, banner_image, banner_mobile_image, campaign_type, start_date, end_date, discount_percent, discount_code, link_url, priority, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, slug, description || '', banner_image || '', banner_mobile_image || '', campaign_type || 'Custom',
     start_date, end_date, discount_percent || 0, discount_code || null, link_url || '', priority || 0, is_active !== undefined ? (is_active ? 1 : 0) : 1]
  );
  res.status(201).json({ id: result.insertId, slug, message: 'Promotion created' });
}));

// ─── ADMIN: Update promotion ───
router.put('/promotions/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const sets = [];
  const params = [];
  const fields = ['title', 'description', 'banner_image', 'banner_mobile_image', 'campaign_type', 'start_date', 'end_date', 'discount_percent', 'discount_code', 'link_url', 'priority', 'is_active'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields' });
  params.push(req.params.id);
  await pool.query(`UPDATE sarga_promotions SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ message: 'Promotion updated' });
}));

// ─── ADMIN: Delete promotion ───
router.delete('/promotions/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM sarga_promotions WHERE id = ?', [req.params.id]);
  res.json({ message: 'Promotion deleted' });
}));

module.exports = router;

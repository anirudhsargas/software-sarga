const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const logger = require('../helpers/logger');
const rateLimit = require('express-rate-limit');

const designLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many requests' } });

// GET /api/website/designs — list user designs
router.get('/designs', async (req, res) => {
  try {
    const { product, customer_id } = req.query;
    let query = 'SELECT id, name, product_id, thumbnail, created_at, updated_at FROM sarga_designs WHERE 1=1';
    const params = [];
    if (product) { query += ' AND product_id = ?'; params.push(product); }
    if (customer_id) { query += ' AND customer_id = ?'; params.push(customer_id); }
    query += ' ORDER BY updated_at DESC LIMIT 50';
    const [rows] = await pool.query(query, params);
    res.json({ success: true, designs: rows });
  } catch (err) {
    logger.error('[Designs] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to load designs' });
  }
});

// GET /api/website/designs/templates — load templates
router.get('/designs/templates', async (req, res) => {
  try {
    const { product } = req.query;
    let query = 'SELECT id, name, product_id, thumbnail, design_data FROM sarga_design_templates WHERE is_active = 1';
    const params = [];
    if (product) { query += ' AND product_id = ?'; params.push(product); }
    query += ' ORDER BY sort_order ASC, name ASC';
    const [rows] = await pool.query(query, params);
    res.json({ success: true, templates: rows });
  } catch (err) {
    logger.error('[Designs] Templates error:', err);
    res.status(500).json({ success: false, error: 'Failed to load templates' });
  }
});

// GET /api/website/designs/:id — load single design
router.get('/designs/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, product_id, design_data, thumbnail FROM sarga_designs WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Design not found' });
    const d = rows[0];
    res.json({ success: true, id: d.id, name: d.name, productId: d.product_id, design: d.design_data, thumbnail: d.thumbnail });
  } catch (err) {
    logger.error('[Designs] Load error:', err);
    res.status(500).json({ success: false, error: 'Failed to load design' });
  }
});

// POST /api/website/designs — save new design
router.post('/designs', designLimiter, async (req, res) => {
  try {
    const { name, productId, designData, thumbnail } = req.body;
    if (!name || !productId || !designData) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const customerId = req.customer?.id || null;
    const [result] = await pool.query(
      'INSERT INTO sarga_designs (customer_id, name, product_id, design_data, thumbnail) VALUES (?, ?, ?, ?, ?)',
      [customerId, name, productId, designData, thumbnail || null]
    );
    res.json({ success: true, id: result.insertId, message: 'Design saved' });
  } catch (err) {
    logger.error('[Designs] Save error:', err);
    res.status(500).json({ success: false, error: 'Failed to save design' });
  }
});

// PUT /api/website/designs/:id — update design
router.put('/designs/:id', designLimiter, async (req, res) => {
  try {
    const { name, designData, thumbnail } = req.body;
    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (designData) { updates.push('design_data = ?'); params.push(designData); }
    if (thumbnail) { updates.push('thumbnail = ?'); params.push(thumbnail); }
    if (!updates.length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    params.push(req.params.id);
    await pool.query(`UPDATE sarga_designs SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    res.json({ success: true, message: 'Design updated' });
  } catch (err) {
    logger.error('[Designs] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update design' });
  }
});

// DELETE /api/website/designs/:id
router.delete('/designs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sarga_designs WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Design deleted' });
  } catch (err) {
    logger.error('[Designs] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete design' });
  }
});

module.exports = router;

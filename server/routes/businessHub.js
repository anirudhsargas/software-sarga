const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const logger = require('../helpers/logger'); // eslint-disable-line no-unused-vars

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function getCustomerId(req) {
  try {
    const jwt = require('jsonwebtoken');
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET || require('../middleware/auth').JWT_SECRET).id;
  } catch { return null; }
}

// GET /api/business/profile - Get or create business profile
router.get('/business/profile', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  if (!customerId) return res.status(401).json({ error: 'Authentication required' });

  let [profiles] = await pool.query(
    'SELECT id, customer_id, company_name, industry, contact_person, contact_phone, contact_email, website, gst_number, billing_address, shipping_address, created_at, updated_at FROM sarga_business_profiles WHERE customer_id = ?',
    [customerId]
  );

  if (profiles.length === 0) {
    // Create minimal profile
    const [cust] = await pool.query('SELECT id, name, mobile, email FROM sarga_customers WHERE id = ?', [customerId]);
    if (cust.length > 0) {
      const [result] = await pool.query(
        'INSERT INTO sarga_business_profiles (customer_id, contact_person, contact_phone, contact_email) VALUES (?, ?, ?, ?)',
        [customerId, cust[0].name, cust[0].mobile, cust[0].email]
      );
      profiles = [{ id: result.insertId, customer_id: customerId }];
    }
  }

  // Get brand assets
  const [assets] = await pool.query(
    'SELECT id, customer_id, asset_type, name, url, file_path, created_at FROM sarga_brand_assets WHERE customer_id = ? ORDER BY asset_type',
    [customerId]
  );

  // Get purchase history
  const [orders] = await pool.query(
    `SELECT order_number, total, status, created_at FROM sarga_orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10`,
    [customerId]
  );

  res.json({ profile: profiles[0] || null, assets, recent_orders: orders });
}));

// PUT /api/business/profile - Update business profile
router.put('/business/profile', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  if (!customerId) return res.status(401).json({ error: 'Authentication required' });

  const { company_name, gst_number, pan_number, contact_person, contact_phone, contact_email, address, city, state, pincode } = req.body;

  // Upsert
  const [existing] = await pool.query('SELECT id FROM sarga_business_profiles WHERE customer_id = ?', [customerId]);
  if (existing.length > 0) {
    const sets = []; const params = [];
    if (company_name !== undefined) { sets.push('company_name = ?'); params.push(company_name); }
    if (gst_number !== undefined) { sets.push('gst_number = ?'); params.push(gst_number); }
    if (pan_number !== undefined) { sets.push('pan_number = ?'); params.push(pan_number); }
    if (contact_person !== undefined) { sets.push('contact_person = ?'); params.push(contact_person); }
    if (contact_phone !== undefined) { sets.push('contact_phone = ?'); params.push(contact_phone); }
    if (contact_email !== undefined) { sets.push('contact_email = ?'); params.push(contact_email); }
    if (address !== undefined) { sets.push('address = ?'); params.push(address); }
    if (city !== undefined) { sets.push('city = ?'); params.push(city); }
    if (state !== undefined) { sets.push('state = ?'); params.push(state); }
    if (pincode !== undefined) { sets.push('pincode = ?'); params.push(pincode); }
    if (sets.length > 0) {
      params.push(existing[0].id);
      await pool.query(`UPDATE sarga_business_profiles SET ${sets.join(', ')} WHERE id = ?`, params);
    }
  } else {
    await pool.query(
      `INSERT INTO sarga_business_profiles (customer_id, company_name, gst_number, pan_number, contact_person, contact_phone, contact_email, address, city, state, pincode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, company_name, gst_number, pan_number, contact_person, contact_phone, contact_email, address, city, state || 'Kerala', pincode]
    );
  }

  res.json({ message: 'Profile updated' });
}));

// ─── BRAND ASSETS ───

// GET /api/business/assets - List brand assets
router.get('/business/assets', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  if (!customerId) return res.status(401).json({ error: 'Authentication required' });

  const [assets] = await pool.query(
    'SELECT id, customer_id, asset_type, name, url, file_path, created_at FROM sarga_brand_assets WHERE customer_id = ? ORDER BY asset_type, name',
    [customerId]
  );
  res.json({ assets });
}));

// POST /api/business/assets - Add brand asset
router.post('/business/assets', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  if (!customerId) return res.status(401).json({ error: 'Authentication required' });

  const { asset_type, name, file_url, color_hex, font_name, font_file_url, template_data, is_locked } = req.body;
  if (!asset_type) return res.status(400).json({ error: 'asset_type required' });

  const validTypes = ['logo', 'font', 'color', 'template'];
  if (!validTypes.includes(asset_type)) return res.status(400).json({ error: 'Invalid asset type' });

  const [result] = await pool.query(
    `INSERT INTO sarga_brand_assets (customer_id, asset_type, name, file_url, color_hex, font_name, font_file_url, template_data, is_locked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, asset_type, name || null, file_url || null, color_hex || null,
     font_name || null, font_file_url || null,
     template_data ? JSON.stringify(template_data) : null, is_locked ? 1 : 0]
  );

  res.status(201).json({ id: result.insertId, message: 'Asset added' });
}));

// DELETE /api/business/assets/:id
router.delete('/business/assets/:id', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  if (!customerId) return res.status(401).json({ error: 'Authentication required' });
  await pool.query('DELETE FROM sarga_brand_assets WHERE id = ? AND customer_id = ? AND is_locked = 0', [req.params.id, customerId]);
  res.json({ message: 'Asset deleted' });
}));

// ─── PURCHASE HISTORY ───

// GET /api/business/orders - Full purchase history
router.get('/business/orders', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  if (!customerId) return res.status(401).json({ error: 'Authentication required' });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const [orders] = await pool.query(
    `SELECT o.*, b.name AS branch_name FROM sarga_orders o
     LEFT JOIN sarga_branches b ON o.branch_id = b.id
     WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [customerId, limit, offset]
  );
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) as total FROM sarga_orders WHERE customer_id = ?', [customerId]
  );

  res.json({ orders, total, page, limit, total_pages: Math.ceil(total / limit) });
}));

// GET /api/business/invoices - Download bulk invoices
router.get('/business/invoices', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  if (!customerId) return res.status(401).json({ error: 'Authentication required' });

  const [orders] = await pool.query(
    `SELECT order_number, total, gst_amount, subtotal, status, created_at
     FROM sarga_orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`,
    [customerId]
  );

  res.json({ invoices: orders.map(o => ({
    invoice_number: `INV-${o.order_number}`,
    amount: o.total,
    ...o
  })) });
}));

module.exports = router;

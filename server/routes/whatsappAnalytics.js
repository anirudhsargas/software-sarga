const express = require('express');
const router = express.Router();
const { pool } = require('../database');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/whatsapp/log', asyncHandler(async (req, res) => {
  const { event, type, productName, quantity, size, variant, orderRef, artworkUrl, options, product_id, customer_id } = req.body || {};
  await pool.query(
    `INSERT INTO sarga_whatsapp_clicks (event_type, type, product_name, product_id, customer_id, quantity, size, variant, order_ref, artwork_url, options)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event || 'whatsapp_click', type || 'order', productName || null,
     product_id || null, customer_id || null,
     quantity || null, size || null, variant || null,
     orderRef || null, artworkUrl || null,
     options ? JSON.stringify(options) : null]
  );
  res.json({ ok: true });
}));

router.get('/whatsapp/stats', asyncHandler(async (req, res) => {
  const { period = '7d' } = req.query;
  let interval;
  if (period === '30d') interval = 'INTERVAL 30 DAY';
  else if (period === '90d') interval = 'INTERVAL 90 DAY';
  else interval = 'INTERVAL 7 DAY';

  const [counts] = await pool.query(
    `SELECT DATE(created_at) as date, COUNT(*) as clicks
     FROM sarga_whatsapp_clicks
     WHERE created_at >= NOW() - ${interval}
     GROUP BY DATE(created_at) ORDER BY date`
  );
  const [topProducts] = await pool.query(
    `SELECT product_name, COUNT(*) as clicks
     FROM sarga_whatsapp_clicks
     WHERE created_at >= NOW() - ${interval} AND product_name IS NOT NULL
     GROUP BY product_name ORDER BY clicks DESC LIMIT 10`
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM sarga_whatsapp_clicks WHERE created_at >= NOW() - ${interval}`
  );

  res.json({ total, daily: counts, topProducts });
}));

module.exports = router;

const express = require('express');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const logger = require('../helpers/logger');

const router = express.Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Simple in-memory cache ───
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getFromCache(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}
function setCache(key, data) { cache[key] = { data, ts: Date.now() }; }
function invalidateCache(key) {
  Object.keys(cache).forEach(k => { if (k.includes(key)) cache[k].ts = 0; });
}

// ─── GET /api/website/reviews — public reviews (cached) ───
router.get('/website/reviews', asyncHandler(async (req, res) => {
  const cached = getFromCache('reviews');
  if (cached) return res.json(cached);

  const [rows] = await pool.query(
    `SELECT id, reviewer_name, profile_image_url, rating, review_text,
            DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date,
            source, is_featured
     FROM sarga_reviews
     WHERE is_active = 1
     ORDER BY is_featured DESC, sort_order ASC, created_at DESC
     LIMIT 50`
  );
  const result = { reviews: rows };
  setCache('reviews', result);
  res.json(result);
}));

// ─── GET /api/website/reviews/stats — aggregate rating stats (cached) ───
router.get('/website/reviews/stats', asyncHandler(async (req, res) => {
  const cached = getFromCache('reviews-stats');
  if (cached) return res.json(cached);

  const [stats] = await pool.query(
    `SELECT COUNT(*) AS total_reviews,
            ROUND(AVG(rating), 1) AS average_rating,
            SUM(CASE WHEN rating >= 5 THEN 1 ELSE 0 END) AS five_star,
            SUM(CASE WHEN rating >= 4 AND rating < 5 THEN 1 ELSE 0 END) AS four_star,
            SUM(CASE WHEN rating >= 3 AND rating < 4 THEN 1 ELSE 0 END) AS three_star,
            SUM(CASE WHEN rating < 3 THEN 1 ELSE 0 END) AS below_three
     FROM sarga_reviews
     WHERE is_active = 1`
  );
  const result = stats[0] || { total_reviews: 0, average_rating: 0, five_star: 0, four_star: 0, three_star: 0, below_three: 0 };
  setCache('reviews-stats', result);
  res.json(result);
}));

// ─── POST /api/website/reviews/fetch-google — admin: trigger Google Places fetch ───
router.post('/website/reviews/fetch-google', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const PLACE_ID = process.env.GOOGLE_PLACE_ID;
  const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

  if (!PLACE_ID || !API_KEY) {
    return res.status(400).json({ error: 'Google Places API not configured. Set GOOGLE_PLACE_ID and GOOGLE_PLACES_API_KEY in .env' });
  }

  try {
    const https = require('https');
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${PLACE_ID}&fields=reviews,rating,user_ratings_total&language=en&key=${API_KEY}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });

    if (data.status !== 'OK' || !data.result) {
      return res.status(502).json({ error: `Google API error: ${data.status}`, detail: data.error_message || '' });
    }

    const googleReviews = data.result.reviews || [];
    let imported = 0;

    for (const gr of googleReviews) {
      const reviewId = gr.author_name + '_' + gr.time;
      const [existing] = await pool.query('SELECT id FROM sarga_reviews WHERE google_review_id = ?', [reviewId]);
      if (existing.length > 0) continue;

      await pool.query(
        `INSERT INTO sarga_reviews (reviewer_name, profile_image_url, rating, review_text, review_date, source, google_review_id, is_active)
         VALUES (?, ?, ?, ?, FROM_UNIXTIME(?), 'google', ?, 1)`,
        [
          gr.author_name || 'Google User',
          gr.profile_photo_url || '',
          Math.min(5, Math.max(1, Math.round(gr.rating || 5))),
          gr.text || '',
          gr.time || Math.floor(Date.now() / 1000),
          reviewId
        ]
      );
      imported++;
    }

    invalidateCache('reviews');
    res.json({ imported, total: googleReviews.length, message: `Imported ${imported} new reviews from Google.` });
  } catch (err) {
    logger.error('[Reviews] Google fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Google reviews.' });
  }
}));

// ─── GET /api/reviews — admin: list all reviews ───
router.get('/reviews', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, reviewer_name, profile_image_url, rating, review_text,
            DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date,
            source, is_featured, is_active, sort_order, created_at
     FROM sarga_reviews
     ORDER BY sort_order ASC, created_at DESC`
  );
  res.json({ reviews: rows });
}));

// ─── POST /api/reviews — admin: create review ───
router.post('/reviews', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { reviewer_name, profile_image_url, rating, review_text, review_date, source, is_featured, is_active, sort_order } = req.body;
  if (!reviewer_name || !rating) {
    return res.status(400).json({ error: 'reviewer_name and rating are required.' });
  }
  const result = await pool.query(
    `INSERT INTO sarga_reviews (reviewer_name, profile_image_url, rating, review_text, review_date, source, is_featured, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reviewer_name,
      profile_image_url || '',
      rating,
      review_text || '',
      review_date || null,
      source || 'manual',
      is_featured ? 1 : 0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      sort_order || 0
    ]
  );
  invalidateCache('reviews');
  res.status(201).json({ id: result[0].insertId, message: 'Review created.' });
}));

// ─── PUT /api/reviews/:id — admin: update review ───
router.put('/reviews/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reviewer_name, profile_image_url, rating, review_text, review_date, source, is_featured, is_active, sort_order } = req.body;

  const sets = [];
  const params = [];
  if (reviewer_name !== undefined) { sets.push('reviewer_name = ?'); params.push(reviewer_name); }
  if (profile_image_url !== undefined) { sets.push('profile_image_url = ?'); params.push(profile_image_url); }
  if (rating !== undefined) { sets.push('rating = ?'); params.push(rating); }
  if (review_text !== undefined) { sets.push('review_text = ?'); params.push(review_text); }
  if (review_date !== undefined) { sets.push('review_date = ?'); params.push(review_date); }
  if (source !== undefined) { sets.push('source = ?'); params.push(source); }
  if (is_featured !== undefined) { sets.push('is_featured = ?'); params.push(is_featured ? 1 : 0); }
  if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (sort_order !== undefined) { sets.push('sort_order = ?'); params.push(sort_order); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  params.push(id);
  await pool.query(`UPDATE sarga_reviews SET ${sets.join(', ')} WHERE id = ?`, params);
  invalidateCache('reviews');
  res.json({ message: 'Review updated.' });
}));

// ─── DELETE /api/reviews/:id — admin: delete review ───
router.delete('/reviews/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM sarga_reviews WHERE id = ?', [id]);
  invalidateCache('reviews');
  res.json({ message: 'Review deleted.' });
}));

// ─── PUT /api/reviews/:id/feature — admin: toggle featured ───
router.put('/reviews/:id/feature', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query('SELECT is_featured FROM sarga_reviews WHERE id = ?', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Review not found.' });
  const newVal = rows[0].is_featured ? 0 : 1;
  await pool.query('UPDATE sarga_reviews SET is_featured = ? WHERE id = ?', [newVal, id]);
  invalidateCache('reviews');
  res.json({ is_featured: newVal, message: newVal ? 'Review featured.' : 'Review unfeatured.' });
}));

module.exports = router;

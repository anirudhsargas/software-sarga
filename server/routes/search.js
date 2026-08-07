const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { searchCache } = require('../middleware/cache');

/**
 * GET /search?q=<query>
 * Universal smart search across customers, jobs, and products.
 * Returns categorised results (max 6 per category).
 *
 * Safe version: uses Promise.allSettled so a single DB failure
 * never causes a 500. Always returns { success, customers, jobs, products }.
 */
router.get('/search', authenticateToken, searchCache(), async (req, res) => {
  try {
    const rawQ = req.query.q;

    // Guard: missing, empty, or whitespace-only query
    if (!rawQ || typeof rawQ !== 'string') {
      return res.json({ success: true, customers: [], jobs: [], products: [] });
    }

    const q = rawQ.trim();

    // Guard: too short or too long
    if (q.length < 2 || q.length > 100) {
      return res.json({ success: true, customers: [], jobs: [], products: [] });
    }

    // Sanitize: keep only printable characters, strip SQL-dangerous chars beyond what parameterization handles
    const safeQ = q.replace(/[^\w\s@.+\-#]/g, '').trim();
    const jobs = jobsResult.status === 'fulfilled'
      ? (jobsResult.value[0] || [])
      : [];
    const products = productsResult.status === 'fulfilled'
      ? (productsResult.value[0] || [])
      : [];

    // Log any partial failures (but don't expose them to client)
    if (customersResult.status === 'rejected') {
      console.error('[Search] customers query failed:', customersResult.reason?.message);
    }
    if (jobsResult.status === 'rejected') {
      console.error('[Search] jobs query failed:', jobsResult.reason?.message);
    }
    if (productsResult.status === 'rejected') {
      console.error('[Search] products query failed:', productsResult.reason?.message);
    }

    return res.json({ success: true, customers, jobs, products });
  } catch (err) {
    // Top-level catch: always return safe empty result, never HTML/500
    console.error('[Search] Unexpected error:', err?.message);
    return res.json({ success: true, customers: [], jobs: [], products: [] });
  }
});

module.exports = router;

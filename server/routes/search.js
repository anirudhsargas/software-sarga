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
    if (!safeQ) {
      return res.json({ success: true, customers: [], jobs: [], products: [] });
    }

    const like = `%${safeQ}%`;

    // Run all three queries with Promise.allSettled — partial failures are safe
    const [customersResult, jobsResult, productsResult] = await Promise.allSettled([
      // ── Customers: search by name, mobile, email ──
      pool.query(
        `SELECT id, name, mobile, email, type,
                (SELECT COUNT(*) FROM sarga_jobs WHERE customer_id = c.id) AS job_count
         FROM sarga_customers c
         WHERE (name LIKE ? OR mobile LIKE ? OR email LIKE ?)
           AND COALESCE(client_type, '') != 'internal'
         ORDER BY name ASC
         LIMIT 6`,
        [like, like, like]
      ),

      // ── Jobs: search by job_number, job_name, customer_name, customer_mobile ──
      pool.query(
        `SELECT j.id, j.job_number, j.job_name, j.status, j.payment_status,
                j.total_amount, j.created_at,
                c.name AS customer_name, c.mobile AS customer_mobile,
                p.name AS product_name
         FROM sarga_jobs j
         LEFT JOIN sarga_customers c ON j.customer_id = c.id
         LEFT JOIN sarga_products p ON j.product_id = p.id
         WHERE j.job_number LIKE ? OR j.job_name LIKE ?
               OR c.name LIKE ? OR c.mobile LIKE ?
         ORDER BY j.created_at DESC
         LIMIT 6`,
        [like, like, like, like]
      ),

      // ── Products: search by name, category, subcategory ──
      pool.query(
        `SELECT p.id, p.name, p.is_active,
                sc.name AS subcategory, c.name AS category
         FROM sarga_products p
         LEFT JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id
         LEFT JOIN sarga_product_categories c ON sc.category_id = c.id
         WHERE (p.name LIKE ? OR sc.name LIKE ? OR c.name LIKE ?)
           AND p.is_active = 1 AND p.is_deleted = 0
         ORDER BY p.name ASC
         LIMIT 6`,
        [like, like, like]
      ),
    ]);

    // Extract results safely — failed queries return empty arrays
    const customers = customersResult.status === 'fulfilled'
      ? (customersResult.value[0] || [])
      : [];
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

const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /search?q=<query>
 * Universal smart search across customers, jobs, and products.
 * Returns categorised results (max 6 per category).
 */
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ customers: [], jobs: [], products: [] });
    }

    const like = `%${q}%`;

    // Run all three queries in parallel
    const [customers, jobs, products] = await Promise.all([
      // ── Customers: search by name, mobile, email ──
      pool.query(
        `SELECT id, name, mobile, email, customer_type,
                (SELECT COUNT(*) FROM sarga_new_jobs WHERE customer_id = c.id) AS job_count
         FROM sarga_customers c
         WHERE name LIKE ? OR mobile LIKE ? OR email LIKE ?
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
         FROM sarga_new_jobs j
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
        `SELECT id, name, category, subcategory, base_price, is_active
         FROM sarga_products
         WHERE name LIKE ? OR category LIKE ? OR subcategory LIKE ?
         ORDER BY name ASC
         LIMIT 6`,
        [like, like, like]
      ),
    ]);

    res.json({
      customers: customers[0] || [],
      jobs: jobs[0] || [],
      products: products[0] || [],
    });
  } catch (err) {
    console.error('[Search] Error:', err.message);
    res.status(500).json({ message: 'Search failed' });
  }
});

module.exports = router;

/**
 * Website Public API Routes
 * 
 * These routes serve the customer-facing Sarga website.
 * They use the SAME database as the management software but expose
 * only public/customer-safe data. No authentication required.
 */
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const logger = require('../helpers/logger');
const chatService = require('../services/chatService');
const chatStore = require('../services/chatStore');
const { v4: uuidv4 } = require('uuid');
const { uuidGuard, chatLimiter, inquiryLimiter } = require('../middleware/websiteSecurity');

// ─── GET /api/website/branches ───
// Returns public branch information (name, address, phone, email)
router.get('/branches', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, address, phone, email FROM sarga_branches ORDER BY id'
    );
    res.json({ branches: rows });
  } catch (err) {
    logger.error('[Website] Error fetching branches:', err.message);
    res.status(500).json({ message: 'Unable to load branches.' });
  }
});

// ─── GET /api/website/categories ───
// Returns product categories with subcategories for public display
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await pool.query(
      `SELECT id, name, image_url
       FROM sarga_product_categories
       WHERE is_active = 1
       ORDER BY position, name`
    );

    const [subcategories] = await pool.query(
      `SELECT sc.id, sc.category_id, sc.name, sc.image_url
       FROM sarga_product_subcategories sc
       JOIN sarga_product_categories c ON sc.category_id = c.id
       WHERE sc.is_active = 1 AND c.is_active = 1
       ORDER BY sc.position, sc.name`
    );

    const result = categories.map((cat) => ({
      ...cat,
      subcategories: subcategories.filter((sc) => sc.category_id === cat.id),
    }));

    res.json({ categories: result });
  } catch (err) {
    logger.error('[Website] Error fetching categories:', err.message);
    res.status(500).json({ message: 'Unable to load categories.' });
  }
});

// ─── GET /api/website/products ───
// Returns active products for public display (with category info)
router.get('/products', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.description, p.image_url,
              sc.name AS subcategory_name,
              c.name AS category_name
       FROM sarga_products p
       JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id
       JOIN sarga_product_categories c ON sc.category_id = c.id
       WHERE p.is_active = 1 AND sc.is_active = 1 AND c.is_active = 1
       ORDER BY c.position, sc.position, p.position
       LIMIT 100`
    );
    res.json({ products: rows });
  } catch (err) {
    logger.error('[Website] Error fetching products:', err.message);
    res.status(500).json({ message: 'Unable to load products.' });
  }
});

// ─── GET /api/website/services ───
// Returns a curated list of services offered (derived from categories)
router.get('/services', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, image_url
       FROM sarga_product_categories
       WHERE is_active = 1
       ORDER BY position, name`
    );
    res.json({ services: rows });
  } catch (err) {
    logger.error('[Website] Error fetching services:', err.message);
    res.status(500).json({ message: 'Unable to load services.' });
  }
});

// ─── GET /api/website/stats ───
// Returns live stats (completed jobs count) for landing page trust signal
router.get('/stats', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS count FROM sarga_jobs WHERE status IN ('Completed', 'Delivered')"
    );
    const liveCount = rows[0]?.count || 0;
    // Pad with baseline 30,000+ to match the 30-year legacy trust signal (1000/year avg minimum)
    const displayCount = Math.max(32450, liveCount);
    res.json({ jobsCompleted: displayCount });
  } catch (err) {
    logger.error('[Website] Error fetching stats:', err.message);
    res.json({ jobsCompleted: 32450 }); // fallback
  }
});

// ─── GET /api/website/track/:jobCode ───
// Allows customers to track their order status by job code or customer mobile number
router.get('/track/:jobCode', async (req, res) => {
  const { jobCode } = req.params;
  if (!jobCode || jobCode.length < 3) {
    return res.status(400).json({ message: 'Invalid tracking input.' });
  }

  try {
    // Search by job_code OR customer mobile number
    const [rows] = await pool.query(
      `SELECT j.id, j.job_code, j.status, j.created_at, j.expected_date,
              j.quantity,
              c.name AS customer_name,
              p.name AS product_name,
              b.name AS branch_name
       FROM sarga_jobs j
       LEFT JOIN sarga_customers c ON j.customer_id = c.id
       LEFT JOIN sarga_products p ON j.product_id = p.id
       LEFT JOIN sarga_branches b ON j.branch_id = b.id
       WHERE j.job_code = ? OR c.mobile = ?
       ORDER BY j.created_at DESC
       LIMIT 1`,
      [jobCode, jobCode]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    // Return limited info (no pricing or internal data)
    const job = rows[0];
    res.json({
      job: {
        id: job.id,
        job_code: job.job_code || `JOB-${job.id}`,
        status: job.status,
        customer_name: job.customer_name || 'Valued Customer',
        product_name: job.product_name || 'Custom Print Job',
        quantity: job.quantity,
        branch_name: job.branch_name || 'Sarga Office',
        created_at: job.created_at,
        expected_date: job.expected_date,
      },
    });
  } catch (err) {
    logger.error('[Website] Error tracking job:', err.message);
    res.status(500).json({ message: 'Unable to track order.' });
  }
});

// ─── POST /api/website/inquiry ───
// Accepts customer inquiries (saved to DB for follow-up)
router.post('/inquiry', inquiryLimiter, async (req, res) => {
  const { name, phone, email, service, message, branch } = req.body;

  if (!name || !phone || !message) {
    return res.status(400).json({ message: 'Name, phone, and message are required.' });
  }

  try {
    // Create inquiries table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sarga_website_inquiries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(100),
        service VARCHAR(100),
        message TEXT NOT NULL,
        branch VARCHAR(50) DEFAULT 'Perambra',
        status ENUM('New', 'Contacted', 'Closed') DEFAULT 'New',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(
      `INSERT INTO sarga_website_inquiries (name, phone, email, service, message, branch)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, phone, email || null, service || null, message, branch || 'Perambra']
    );

    logger.info(`[Website] New inquiry from ${name} (${phone})`);
    res.json({ success: true, message: 'Inquiry received successfully.' });
  } catch (err) {
    logger.error('[Website] Error saving inquiry:', err.message);
    res.status(500).json({ message: 'Unable to submit inquiry. Please try again.' });
  }
});


// ─── POST /api/website/chat ───
// Rule-based chatbot endpoint (fast, no external API required)
router.post('/chat', chatLimiter, uuidGuard, async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.length > 500) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  try {
    const response = await chatService.processMessage(message.trim());

    // Ensure a UUID is present for analytics/tracking
    let uuid = req.headers['x-sarga-uuid'];
    if (!uuid) {
      uuid = uuidv4();
    }

    try {
      await chatStore.saveChat({ uuid, user_message: message, bot_response: response.text, rule_id: response.ruleId });
    } catch (storeErr) {
      logger.warn('[Website] Failed to persist chat message to store:', storeErr.message);
    }

    return res.json({ reply: response.text, confidence: response.confidence, source: response.source, uuid });
  } catch (error) {
    logger.error('[Website] Chat error:', error.message);
    return res.status(500).json({ reply: "Sorry, something went wrong. Please try again or contact us directly.", confidence: 0, source: 'error' });
  }
});

// ─── GET /api/website/chat/history ───
// Optional query param: ?uuid=<uuid>&limit=50
router.get('/chat/history', async (req, res) => {
  const { uuid, limit } = req.query;
  try {
    const history = await chatStore.getHistory({ uuid: uuid || null, limit: limit ? Number(limit) : 50 });
    return res.json({ history });
  } catch (err) {
    logger.error('[Website] Failed to load chat history:', err.message);
    return res.status(500).json({ message: 'Unable to load chat history.' });
  }
});

module.exports = router;

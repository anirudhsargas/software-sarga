/**
 * Website Public API Routes
 * 
 * These routes serve the customer-facing Sarga website.
 * They use the SAME database as the management software but expose
 * only public/customer-safe data. No authentication required.
 */
const express = require('express');
const { pool } = require('../database');
const logger = require('../helpers/logger');
const chatService = require('../services/chatService');
const chatStore = require('../services/chatStore');
const websiteCache = require('../services/websiteCache');
const { v4: uuidv4 } = require('uuid');
const { uuidGuard, chatLimiter, inquiryLimiter } = require('../middleware/websiteSecurity');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, authenticateCustomer, revokeCustomerSessionInCache } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Export a factory so we can accept the multer `upload` instance from index.js
module.exports = (upload) => {
  const router = express.Router();

    // Simple async wrapper to catch errors in async route handlers
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

  // Debugging: log incoming POST paths for website router
  router.use((req, res, next) => {
    if (req.method === 'POST') {
      console.log(`[Website Debug] ${req.method} ${req.path}`);
    }
    next();
  });

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
    const result = await websiteCache.getCategories();
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
    const page = parseInt(req.query.page || '1', 10) || 1;
    const limit = parseInt(req.query.limit || '24', 10) || 24;
    const q = req.query.q && String(req.query.q).trim();

    // If no query and default first page + limit >= 100, return cached snapshot for speed
    if (!q && page === 1 && limit >= 100) {
      const rows = await websiteCache.getProducts();
      return res.json({ products: rows, page: 1, limit: rows.length, total: rows.length, total_pages: 1 });
    }

    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE p.is_active = 1 AND p.is_deleted = 0 AND sc.is_active = 1 AND c.is_active = 1';
    if (q) {
      where += ' AND (p.name LIKE ? OR p.description LIKE ? OR sc.name LIKE ? OR c.name LIKE ?)';
      const like = '%' + q + '%';
      params.push(like, like, like, like);
    }

    try {
      const [countRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM sarga_products p JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id JOIN sarga_product_categories c ON sc.category_id = c.id ${where}`, params);
      const total = countRows[0]?.cnt || 0;
      const total_pages = Math.max(1, Math.ceil(total / limit));

      const [rows] = await pool.query(
        `SELECT p.id, p.name, p.description, p.image_url, sc.name AS subcategory_name, c.name AS category_name
         FROM sarga_products p
         JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id
         JOIN sarga_product_categories c ON sc.category_id = c.id
         ${where}
         ORDER BY c.position, sc.position, p.position
         LIMIT ? OFFSET ?`,
        params.concat([limit, offset])
      );

      res.json({ products: rows, page, limit, total, total_pages });
    } catch (err) {
      logger.error('[Website] Error fetching products paginated:', err.message);
      res.status(500).json({ message: 'Unable to load products.' });
    }
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

    // Include any extra payloads (like categories) returned by chatService
    const payload = { reply: response.text, confidence: response.confidence, source: response.source, uuid };
    if (response.categories) payload.categories = response.categories;
    return res.json(payload);
  } catch (error) {
    logger.error('[Website] Chat error:', error.message);
    return res.status(500).json({ reply: "Sorry, something went wrong. Please try again or contact us directly.", confidence: 0, source: 'error' });
  }
});

// Helper to record a customer session token for revocation support
const recordCustomerSession = async (token, customerId, req) => {
  try {
    await pool.query(
      `INSERT INTO sarga_customer_sessions (customer_id, session_token, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [customerId, token, req.ip, req.headers['user-agent'] || null]
    );
  } catch {
    // non-fatal
  }
};

// Rate limiter for customer auth endpoints
const customerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Legacy phone lookup login (kept for compatibility) — prefer OTP flow below
router.post('/customer/login', customerAuthLimiter, asyncHandler(async (req, res) => {
  const { phone, countryCode } = req.body || {};
  if (!phone) return res.status(400).json({ message: 'Phone number required' });

  // Normalize incoming phone using helpers if available (E.164 preferred)
  const { normalizeMobileWithCountry } = require('../helpers');
  const normalized = normalizeMobileWithCountry(phone, countryCode) || String(phone).replace(/\D/g, '').slice(-10);

  const [rows] = await pool.query('SELECT id, name, mobile, email FROM sarga_customers WHERE mobile = ? OR RIGHT(mobile,10) = ? LIMIT 1', [normalized, String(normalized).slice(-10)]);
  if (!rows || rows.length === 0) {
    // Return a clear payload so frontend can show a Register option and autofill normalized mobile
    return res.status(404).json({ message: 'Customer not found', canRegister: true, suggestedMobile: normalized });
  }
  const customer = rows[0];
  const token = jwt.sign({ id: customer.id, role: 'Customer', name: customer.name }, JWT_SECRET, { expiresIn: '7d' });
  await recordCustomerSession(token, customer.id, req);
  res.json({ message: 'Login successful', token, customerId: customer.id, customerName: customer.name });
}));

// POST /api/website/customer/logout — revoke customer session
router.post('/customer/logout', asyncHandler(async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
    if (token) {
        try {
            await pool.query(
                'UPDATE sarga_customer_sessions SET is_revoked = 1 WHERE session_token = ?',
                [token]
            );
            await revokeCustomerSessionInCache(token);
        } catch (_err) {
            // Non-fatal — still respond with success
        }
    }
    res.json({ message: 'Logged out' });
}));

// Customer lookup for autofill: requires valid customer token
router.get('/customer/lookup', customerAuthLimiter, authenticateCustomer, asyncHandler(async (req, res) => {
  const { mobile, countryCode } = req.query || {};
  if (!mobile) return res.status(400).json({ message: 'mobile query param required' });
  const { normalizeMobileWithCountry } = require('../helpers');
  const normalized = normalizeMobileWithCountry(mobile, countryCode) || String(mobile).replace(/\D/g, '').slice(-10);
  const [rows] = await pool.query('SELECT id, name, mobile, email, address FROM sarga_customers WHERE id = ? AND (mobile = ? OR RIGHT(mobile,10) = ?) LIMIT 1', [req.customer.id, normalized, String(normalized).slice(-10)]);
  if (!rows || rows.length === 0) return res.status(404).json({ message: 'Customer not found' });
  res.json({ customer: rows[0] });
}));

// Register customer from website (mobile-first). Issues token on success.
router.post('/customer/register', customerAuthLimiter, asyncHandler(async (req, res) => {
  const { mobile, countryCode, name, email, address } = req.body || {};
  if (!mobile) return res.status(400).json({ message: 'Mobile is required' });
  const { normalizeMobileWithCountry } = require('../helpers');
  const normalized = normalizeMobileWithCountry(mobile, countryCode) || String(mobile).replace(/\D/g, '').slice(-10);

  // Ensure customers table exists and mobile unique constraint handled by DB
  try {
    const [existing] = await pool.query('SELECT id FROM sarga_customers WHERE mobile = ? OR RIGHT(mobile,10) = ? LIMIT 1', [normalized, String(normalized).slice(-10)]);
    if (existing && existing.length > 0) return res.status(409).json({ message: 'Customer already exists' });

    const branchId = 1; // default public branch — frontend may pass branch later
    const [result] = await pool.query('INSERT INTO sarga_customers (mobile, name, email, address, branch_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())', [normalized, name || null, email || null, address || null, branchId]);
    const newId = result.insertId;
    const [rows] = await pool.query('SELECT id, name, mobile, email FROM sarga_customers WHERE id = ? LIMIT 1', [newId]);
    const customer = rows[0];
    const token = jwt.sign({ id: customer.id, role: 'Customer', name: customer.name }, JWT_SECRET, { expiresIn: '7d' });
    await recordCustomerSession(token, customer.id, req);
    res.status(201).json({ message: 'Registered', token, customer });
  } catch (err) {
    logger.error('[Website] Customer register error:', err.message || err);
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Mobile already exists' });
    res.status(500).json({ message: 'Registration failed' });
  }
}));

// Google Sign-In for website: accept `id_token` from client and verify with Google's tokeninfo endpoint.
router.post('/customer/google-signin', customerAuthLimiter, asyncHandler(async (req, res) => {
  const { id_token } = req.body || {};
  if (!id_token) return res.status(400).json({ message: 'id_token is required' });

  // Verify token via Google's tokeninfo endpoint (use axios, already in dependencies)
  const axios = require('axios');
  try {
    const resp = await axios.get('https://oauth2.googleapis.com/tokeninfo', { params: { id_token } });
    const payload = resp.data;
    // payload contains email, email_verified, name, picture, phone_number (optional)
    const { email, email_verified, name, phone_number, aud } = payload;

    // Verify audience matches our Google Client ID to prevent token reuse from other apps
    if (GOOGLE_CLIENT_ID && aud !== GOOGLE_CLIENT_ID) {
      logger.warn('[Website] Google sign-in aud mismatch', { aud, expected: GOOGLE_CLIENT_ID });
      return res.status(400).json({ message: 'Invalid token audience' });
    }

    if (!email || !email_verified) return res.status(400).json({ message: 'Google account email not available or not verified' });

    // Try find customer by email or phone
    let found = null;
    if (phone_number) {
      const [byPhone] = await pool.query('SELECT id, name, mobile, email FROM sarga_customers WHERE mobile = ? OR RIGHT(mobile,10) = ? LIMIT 1', [phone_number, String(phone_number).slice(-10)]);
      if (byPhone && byPhone.length > 0) found = byPhone[0];
    }
    if (!found) {
      const [byEmail] = await pool.query('SELECT id, name, mobile, email FROM sarga_customers WHERE email = ? LIMIT 1', [email]);
      if (byEmail && byEmail.length > 0) found = byEmail[0];
    }

    if (!found) {
      // Create a minimal customer record
      const branchId = 1;
      const mobileVal = phone_number || null;
      const [ins] = await pool.query('INSERT INTO sarga_customers (mobile, name, email, branch_id, created_at) VALUES (?, ?, ?, ?, NOW())', [mobileVal, name || null, email, branchId]);
      const newId = ins.insertId;
      const [rows] = await pool.query('SELECT id, name, mobile, email FROM sarga_customers WHERE id = ? LIMIT 1', [newId]);
      found = rows[0];
    }

    const token = jwt.sign({ id: found.id, role: 'Customer', name: found.name }, JWT_SECRET, { expiresIn: '7d' });
    await recordCustomerSession(token, found.id, req);
    res.json({ message: 'Authenticated', token, customer: found });
  } catch (err) {
    logger.error('[Website] Google signin error:', err && err.message ? err.message : err);
    res.status(500).json({ message: 'Google signin failed' });
  }
}));

// ─── Email OTP Sign-in Flow ─────────────────────────────────────
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// POST /api/website/customer/send-otp { email }
router.post('/customer/send-otp', inquiryLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email is required' });

  // Find customer by email
  const [rows] = await pool.query('SELECT id, name, email FROM sarga_customers WHERE email = ? LIMIT 1', [email]);
  if (!rows || rows.length === 0) return res.status(404).json({ message: 'Customer not found' });
  const customer = rows[0];


  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expiresAt = new Date(Date.now() + (10 * 60 * 1000)); // 10 minutes

  // Upsert existing OTP for customer (simple approach: delete old ones)
  await pool.query('DELETE FROM sarga_customer_otps WHERE customer_id = ?', [customer.id]);
  await pool.query('INSERT INTO sarga_customer_otps (customer_id, code_hash, expires_at) VALUES (?, ?, ?)', [customer.id, codeHash, expiresAt]);

  // Send email via nodemailer if configured
  const smtpHost = process.env.SMTP_HOST;
  let mailSent = false;
  if (smtpHost && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: customer.email,
        subject: 'Your Sarga OTP',
        text: `Your OTP for Sarga login is: ${otp}. It expires in 10 minutes.`
      });
      mailSent = true;
    } catch (err) {
      console.error('Failed to send OTP email:', err.message);
    }
  }

  const resp = { message: 'OTP sent' };
  if (!mailSent) {
    resp.warning = 'Email not delivered by SMTP; check server SMTP settings.';
  }

  if (!mailSent && process.env.NODE_ENV !== 'production') {
    logger.debug('[OTP Dev] customer otp=%s', otp);
  }

  res.json(resp);
}));

// POST /api/website/customer/verify-otp { email, otp }
router.post('/customer/verify-otp', asyncHandler(async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });
  const [rows] = await pool.query('SELECT id, name, email FROM sarga_customers WHERE email = ? LIMIT 1', [email]);
  if (!rows || rows.length === 0) return res.status(404).json({ message: 'Customer not found' });
  const customer = rows[0];

  const [[otpRow]] = await pool.query('SELECT * FROM sarga_customer_otps WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1', [customer.id]);
  if (!otpRow) return res.status(400).json({ message: 'No OTP found for this customer' });

  const now = new Date();
  if (new Date(otpRow.expires_at) < now) return res.status(400).json({ message: 'OTP expired' });

  const hash = crypto.createHash('sha256').update(String(otp)).digest('hex');
  if (hash !== otpRow.code_hash) return res.status(400).json({ message: 'Invalid OTP' });

  // valid — issue token and cleanup
  await pool.query('DELETE FROM sarga_customer_otps WHERE id = ?', [otpRow.id]);
  const token = jwt.sign({ id: customer.id, role: 'Customer', name: customer.name }, JWT_SECRET, { expiresIn: '7d' });
  await recordCustomerSession(token, customer.id, req);
  res.json({ message: 'Authenticated', token, customerId: customer.id, customerName: customer.name });
}));

// POST /api/website/upload-design (multipart/form-data)
router.post('/upload-design', upload.array('files', 10), asyncHandler(async (req, res) => {
  const files = req.files || [];
  const { needDesign, notes } = req.body || {};

  if ((!files || files.length === 0) && (!needDesign || needDesign === '0')) {
    return res.status(400).json({ message: 'No files uploaded and design support not requested' });
  }

  // For now, just acknowledge receipt and return file info. Files are saved by multer to uploads/.
  const fileInfos = (files || []).map(f => ({ originalName: f.originalname, filename: f.filename, size: f.size, path: `/uploads/${f.filename}` }));

  logger.info('[Website] Received design upload', { count: fileInfos.length, needDesign: !!(needDesign === '1' || needDesign === 'true') });

  // Optionally, persist a record or send to email — left as future enhancement
  res.json({ message: 'Files received', files: fileInfos, needDesign: !!(needDesign === '1' || needDesign === 'true'), notes: notes || '' });
}));

// Customer dashboard proxy: uses token issued above to fetch customer's dashboard
router.get('/customer/dashboard', authenticateCustomer, asyncHandler(async (req, res) => {
  const customerId = req.customer.id;
  if (!customerId) return res.status(400).json({ message: 'Invalid token payload' });

  // Reuse existing customers dashboard query from server/routes/customers.js
  const [jobs] = await pool.query(
    `SELECT j.* FROM sarga_jobs j WHERE j.customer_id = ? ORDER BY j.created_at DESC LIMIT 50`,
    [customerId]
  );

  const [payments] = await pool.query(
    `SELECT p.* FROM sarga_customer_payments p WHERE p.customer_id = ? ORDER BY p.created_at DESC LIMIT 50`,
    [customerId]
  );

  res.json({ customerId, jobs, payments });
}));

// GET /api/website/job/:id — Customer-visible job details (requires customer token)
router.get('/job/:id', authenticateCustomer, asyncHandler(async (req, res) => {
  const customerId = req.customer.id;
  const jobId = req.params.id;

  const [[jobRow]] = await pool.query(
    `SELECT j.*, COALESCE(c.name, 'Customer') as customer_name, c.mobile as customer_mobile, p.name as product_name
     FROM sarga_jobs j
     LEFT JOIN sarga_customers c ON j.customer_id = c.id
     LEFT JOIN sarga_products p ON j.product_id = p.id
     WHERE j.id = ?`,
    [jobId]
  );
  if (!jobRow) return res.status(404).json({ message: 'Job not found' });
  if (Number(jobRow.customer_id) !== Number(customerId)) return res.status(403).json({ message: 'Access denied' });

  // status history
  const [statusHistory] = await pool.query(
    `SELECT ssh.*, s.name as staff_name FROM sarga_job_status_history ssh LEFT JOIN sarga_staff s ON s.id = ssh.staff_id WHERE ssh.job_id = ? ORDER BY ssh.changed_at DESC`,
    [jobId]
  );

  // proofs (job proofs)
  const [proofs] = await pool.query(
    `SELECT p.id, p.version, p.file_url, p.status, p.designer_notes, p.customer_feedback, p.created_at, p.reviewed_at FROM sarga_job_proofs p WHERE p.job_id = ? ORDER BY p.version DESC`,
    [jobId]
  );

  // designs attached to job
  const [designs] = await pool.query(
    `SELECT id, title, file_url, file_type, original_name, created_at FROM sarga_customer_designs WHERE job_id = ? ORDER BY created_at DESC`,
    [jobId]
  );

  // invoices for this customer (limited list)
  const [invoices] = await pool.query(
    `SELECT id, invoice_number, total_amount, status, created_at FROM sarga_invoices WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20`,
    [customerId]
  );

  res.json({ job: jobRow, statusHistory, proofs, designs, invoices });
}));

// POST /api/website/jobs/:id/proofs/:proofId/review-customer — Customer review a proof
router.post('/jobs/:id/proofs/:proofId/review-customer', authenticateCustomer, asyncHandler(async (req, res) => {
  const customerId = req.customer.id;
  const jobId = req.params.id;
  const proofId = req.params.proofId;
  const { status, customer_feedback } = req.body;

  const valid = ['Approved', 'Rejected', 'Revision Requested'];
  if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });

  // verify job belongs to customer
  const [jobRows] = await pool.query('SELECT id, customer_id, status as current_status FROM sarga_jobs WHERE id = ?', [jobId]);
  if (!jobRows || jobRows.length === 0) return res.status(404).json({ message: 'Job not found' });
  if (Number(jobRows[0].customer_id) !== Number(customerId)) return res.status(403).json({ message: 'Access denied' });

  // update proof row: set status, customer_feedback, reviewed_at; reviewed_by left NULL for customer
  await pool.query('UPDATE sarga_job_proofs SET status = ?, customer_feedback = ?, reviewed_at = NOW() WHERE id = ? AND job_id = ?', [status, customer_feedback || null, proofId, jobId]);

  // Update job status based on proof decision (similar to staff flow but with null actor)
  const current = jobRows[0].current_status;
  if (status === 'Approved') {
    if (!['Delivered', 'Cancelled'].includes(current)) {
      await pool.query('UPDATE sarga_jobs SET status = ? WHERE id = ?', ['Processing', jobId]);
      await pool.query('INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)', [jobId, 'Processing', null]);
    }
  } else if (status === 'Rejected' || status === 'Revision Requested') {
    if (!['Delivered', 'Cancelled'].includes(current)) {
      await pool.query('UPDATE sarga_jobs SET status = ? WHERE id = ?', ['Designing', jobId]);
      await pool.query('INSERT INTO sarga_job_status_history (job_id, status, staff_id) VALUES (?, ?, ?)', [jobId, 'Designing', null]);
    }
  }

  res.json({ message: `Proof ${status.toLowerCase()}` });
}));

// GET /api/website/invoices/:invoiceId/download — generate and stream invoice PDF to customer
router.get('/invoices/:invoiceId/download', authenticateCustomer, asyncHandler(async (req, res) => {
  const customerId = req.customer.id;
  const invoiceId = req.params.invoiceId;

  const [[invoice]] = await pool.query('SELECT i.*, c.name as customer_name, c.mobile as customer_mobile FROM sarga_invoices i LEFT JOIN sarga_customers c ON i.customer_id = c.id WHERE i.id = ?', [invoiceId]);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  if (Number(invoice.customer_id) !== Number(customerId)) return res.status(403).json({ message: 'Access denied' });

  // Fetch related payment and job info when available
  let payment = null;
  if (invoice.payment_id) {
    const [pRows] = await pool.query('SELECT * FROM sarga_customer_payments WHERE id = ?', [invoice.payment_id]);
    payment = pRows[0] || null;
  }

  // Generate PDF with pdfkit
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number || invoiceId}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(`Invoice: ${invoice.invoice_number || invoiceId}`, { align: 'left' });
  doc.moveDown();
  doc.fontSize(12).text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`);
  doc.text(`Customer: ${invoice.customer_name || ''} (${invoice.customer_mobile || ''})`);
  doc.moveDown();
  doc.text(`Total: ₹${invoice.total_amount || '0.00'}`);
  doc.text(`Tax: ₹${invoice.tax_amount || '0.00'}`);
  doc.text(`Net: ₹${invoice.net_amount || '0.00'}`);
  if (payment) {
    doc.moveDown();
    doc.text(`Payment ID: ${payment.id} — Mode: ${payment.payment_mode || ''} — Amount: ₹${payment.amount || payment.total_amount || 0}`);
  }

  doc.moveDown();
  doc.fontSize(10).text('Thank you for your business.', { align: 'center' });
  doc.end();
}));

// ─── GET /api/website/chat/history ───
// Optional query param: ?uuid=<uuid>&limit=50
router.get('/chat/history', authenticateCustomer, async (req, res) => {
  const { uuid, limit } = req.query;
  try {
    const history = await chatStore.getHistory({ uuid: uuid || null, limit: limit ? Number(limit) : 50 });
    return res.json({ history });
  } catch (err) {
    logger.error('[Website] Failed to load chat history:', err.message);
    return res.status(500).json({ message: 'Unable to load chat history.' });
  }
});

// ─── POST /api/website/webhook/sync ───
// Secure webhook for software to notify website about product/category changes.
// Set WEBSITE_SYNC_SECRET in environment to a shared secret.
router.post('/webhook/sync', async (req, res) => {
  try {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBSITE_SYNC_SECRET) {
      logger.warn('[Webhook] WEBSITE_SYNC_SECRET not configured — rejecting webhook');
      return res.status(403).json({ message: 'Webhook disabled' });
    }
    if (secret !== process.env.WEBSITE_SYNC_SECRET) {
      logger.warn('[Webhook] Invalid webhook secret attempt');
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { type } = req.body || {};
    if (!type || (type !== 'products' && type !== 'categories' && type !== 'all')) {
      return res.status(400).json({ message: 'Invalid type (expected products|categories|all)' });
    }

    if (type === 'all') websiteCache.invalidate();
    else websiteCache.invalidate(type);

    logger.info('[Webhook] Cache invalidated for', type);
    return res.json({ ok: true });
  } catch (err) {
    logger.error('[Webhook] Error handling sync webhook:', err.message);
    return res.status(500).json({ message: 'Webhook error' });
  }
});

  return router;
};

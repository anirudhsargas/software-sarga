const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('../database');
const { uploadBufferToCloudinary } = require('../helpers/cloudinaryUpload');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'artwork');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_EXTENSIONS = ['.pdf', '.ai', '.psd', '.cdr', '.jpg', '.jpeg', '.png', '.tiff', '.tif'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file

// Cloudinary-only upload: no local disk dependency
const artworkStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
  }
};

const artworkUpload = multer({ storage: artworkStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

function generateOrderNumber() {
  const date = new Date();
  const yymmdd = date.getFullYear().toString().slice(-2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const rand = crypto.randomInt(1000, 9999);
  return `ART-${yymmdd}-${rand}`;
}

function generateTrackingToken() {
  return crypto.randomBytes(16).toString('hex');
}

// ─── PUBLIC: Customer uploads artwork (no auth required) ────────
router.post('/website/artwork/upload', artworkUpload.array('files', 20), asyncHandler(async (req, res) => {
  const {
    customer_name, customer_email, customer_phone,
    product_type, quantity, size, printing_side,
    special_instructions, delivery_requirement, customer_id
  } = req.body;

  if (!customer_name || !customer_name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'At least one file is required' });
  }

  const orderNumber = generateOrderNumber();
  const trackingToken = generateTrackingToken();
  const folder = `artwork-uploads/${orderNumber}`;

  // Upload each file to Cloudinary directly from memory buffer
  const uploadedFiles = [];
  for (const file of req.files) {
    try {
      const result = await uploadBufferToCloudinary(file.buffer, file.originalname, folder);
      uploadedFiles.push({
        public_id: result.public_id,
        secure_url: result.secure_url,
        original_name: file.originalname,
        size: file.size,
        format: path.extname(file.originalname).toLowerCase().replace('.', ''),
        uploaded_at: new Date().toISOString()
      });
    } catch (cloudErr) {
      console.warn(`Cloudinary upload failed for ${file.originalname}:`, cloudErr.message);
      uploadedFiles.push({
        original_name: file.originalname,
        size: file.size,
        format: path.extname(file.originalname).toLowerCase().replace('.', ''),
        error: 'cloudinary_failed',
        uploaded_at: new Date().toISOString()
      });
    }
  }

  try {
    await pool.query(`
      INSERT INTO sarga_artwork_uploads
        (order_number, customer_id, customer_name, customer_email, customer_phone,
         product_type, quantity, size, printing_side, special_instructions,
         delivery_requirement, files, status, tracking_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)
    `, [
      orderNumber, customer_id || null, customer_name.trim(), customer_email || null, customer_phone || null,
      product_type || null, quantity ? Number(quantity) : null, size || null,
      printing_side || 'single', special_instructions || null,
      delivery_requirement || null, JSON.stringify(uploadedFiles), trackingToken
    ]);

    // Alert admins
    await pool.query(`
      INSERT INTO sarga_alerts (type, message, reference_id)
      VALUES ('ARTWORK_UPLOAD', ?, ?)
    `, [`New artwork uploaded: ${orderNumber} by ${customer_name}`, null]);

    res.status(201).json({
      message: 'Artwork uploaded successfully',
      order_number: orderNumber,
      tracking_token: trackingToken,
      files_uploaded: uploadedFiles.filter(f => !f.error).length,
      files_failed: uploadedFiles.filter(f => f.error).length
    });
  } catch (dbErr) {
    console.error('DB insert error:', dbErr);
    res.status(500).json({ error: 'Failed to save artwork upload' });
  }
}));

// ─── PUBLIC: Track artwork by order number ──────────────────────
router.get('/website/artwork/track/:orderNumber', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT a.id, a.order_number, a.customer_name, a.product_type,
           a.quantity, a.size, a.printing_side, a.special_instructions,
           a.delivery_requirement, a.status, a.files, a.notes,
           a.created_at, a.updated_at,
           s.name AS assigned_designer_name
    FROM sarga_artwork_uploads a
    LEFT JOIN sarga_staff s ON a.assigned_designer_id = s.id
    WHERE a.order_number = ?
  `, [req.params.orderNumber]);

  if (rows.length === 0) return res.status(404).json({ error: 'Artwork not found' });

  res.json({ artwork: rows[0] });
}));

// ─── PUBLIC: Track by token (secure single-use link) ────────────
router.get('/website/artwork/token/:token', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT a.id, a.order_number, a.customer_name, a.product_type,
           a.quantity, a.size, a.printing_side, a.special_instructions,
           a.delivery_requirement, a.status, a.files, a.created_at, a.updated_at,
           s.name AS assigned_designer_name
    FROM sarga_artwork_uploads a
    LEFT JOIN sarga_staff s ON a.assigned_designer_id = s.id
    WHERE a.tracking_token = ?
  `, [req.params.token]);

  if (rows.length === 0) return res.status(404).json({ error: 'Artwork not found' });

  res.json({ artwork: rows[0] });
}));

// ─── CUSTOMER: Get my uploads (requires auth) ──────────────────
router.get('/website/artwork/my-uploads', asyncHandler(async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let decoded;
  try {
    const jwt = require('jsonwebtoken');
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const [rows] = await pool.query(`
    SELECT id, order_number, product_type, quantity, size,
           printing_side, status, created_at, updated_at
    FROM sarga_artwork_uploads
    WHERE customer_id = ?
    ORDER BY created_at DESC
  `, [decoded.id]);

  res.json({ uploads: rows });
}));

// ─── ADMIN: List all artwork uploads ────────────────────────────
router.get('/artwork/list', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

  let where = '1=1';
  const params = [];

  if (status) {
    where += ' AND a.status = ?';
    params.push(status);
  }
  if (search) {
    where += ' AND (a.customer_name LIKE ? OR a.order_number LIKE ? OR a.customer_phone LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM sarga_artwork_uploads a WHERE ${where}`, params
  );
  const [rows] = await pool.query(`
    SELECT a.id, a.order_number, a.customer_name, a.customer_phone,
           a.product_type, a.quantity, a.size, a.printing_side,
           a.status, a.created_at, a.updated_at,
           s.name AS assigned_designer_name
    FROM sarga_artwork_uploads a
    LEFT JOIN sarga_staff s ON a.assigned_designer_id = s.id
    WHERE ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, Number(limit), offset]);

  res.json({ reviews: rows, total, page: Number(page), limit: Number(limit) });
}));

// ─── ADMIN: Get single artwork detail ────────────────────────────
router.get('/artwork/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT a.*, s.name AS assigned_designer_name
    FROM sarga_artwork_uploads a
    LEFT JOIN sarga_staff s ON a.assigned_designer_id = s.id
    WHERE a.id = ?
  `, [req.params.id]);

  if (rows.length === 0) return res.status(404).json({ error: 'Artwork not found' });

  res.json({ artwork: rows[0] });
}));

// ─── ADMIN: Update artwork status ───────────────────────────────
router.put('/artwork/:id/status', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['uploaded', 'under_review', 'proof_sent', 'approved', 'printing', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  await pool.query('UPDATE sarga_artwork_uploads SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ message: 'Status updated', status });
}));

// ─── ADMIN: Assign designer ─────────────────────────────────────
router.put('/artwork/:id/assign-designer', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { designer_id } = req.body;

  await pool.query(`
    UPDATE sarga_artwork_uploads
    SET assigned_designer_id = ?, assigned_at = NOW()
    WHERE id = ?
  `, [designer_id || null, req.params.id]);

  res.json({ message: 'Designer assigned' });
}));

// ─── ADMIN: Update notes ────────────────────────────────────────
router.put('/artwork/:id/notes', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { notes } = req.body;
  await pool.query('UPDATE sarga_artwork_uploads SET notes = ? WHERE id = ?', [notes || '', req.params.id]);
  res.json({ message: 'Notes updated' });
}));

// ─── ADMIN: Delete artwork upload ───────────────────────────────
router.delete('/artwork/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT files, order_number FROM sarga_artwork_uploads WHERE id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Artwork not found' });

  // Delete files from Cloudinary
  const files = JSON.parse(rows[0].files || '[]');
  const { deleteFromCloudinary } = require('../helpers/cloudinaryUpload');
  for (const f of files) {
    if (f.public_id) {
      try { await deleteFromCloudinary(f.public_id); } catch (_e) { /* ignore */ }
    }
  }

  await pool.query('DELETE FROM sarga_artwork_uploads WHERE id = ?', [req.params.id]);
  res.json({ message: 'Artwork deleted' });
}));

// ─── ADMIN: List designers for assignment dropdown ──────────────
router.get('/artwork/designers/list', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name FROM sarga_staff WHERE role = 'Designer' AND is_active = 1 ORDER BY name`
  );
  res.json({ designers: rows });
}));

module.exports = router;

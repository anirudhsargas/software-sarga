const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { uploadToCloudinary } = require('../helpers/cloudinaryUpload');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
  if (!token) return null;
  try {
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}

function generateSignature(customerId, proofId) {
  const data = `${customerId}:${proofId}:${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

// ─── PUBLIC: Get proofs for a job ───
router.get('/website/proofs/:jobId', asyncHandler(async (req, res) => {
  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });
  const customerId = decoded.id;

  const [jobs] = await pool.query('SELECT id FROM sarga_jobs WHERE id = ? AND customer_id = ?', [req.params.jobId, customerId]);
  if (jobs.length === 0) return res.status(403).json({ error: 'Access denied' });

  const [proofs] = await pool.query(
    `SELECT id, version, proof_url, preview_image, status, customer_feedback,
            designer_notes, uploaded_by, created_at, reviewed_at, expires_at, digital_signature
     FROM sarga_proofs WHERE job_id = ? ORDER BY version DESC`,
    [req.params.jobId]
  );

  // Add expiry info
  const now = new Date();
  const enriched = proofs.map(p => ({
    ...p,
    is_expired: p.expires_at && new Date(p.expires_at) < now,
    expires_in_hours: p.expires_at ? Math.round((new Date(p.expires_at) - now) / 3600000) : null
  }));

  res.json({ proofs: enriched });
}));

// ─── PUBLIC: Customer reviews/approves a proof ───
router.post('/website/proofs/:id/review', asyncHandler(async (req, res) => {
  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });
  const customerId = decoded.id;
  const { status, customer_feedback } = req.body;
  const validStatuses = ['approved', 'rejected', 'revision_requested'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const [proofs] = await pool.query(
    'SELECT p.id, p.job_id, p.expires_at, j.customer_id FROM sarga_proofs p JOIN sarga_jobs j ON p.job_id = j.id WHERE p.id = ?',
    [req.params.id]
  );
  if (proofs.length === 0) return res.status(404).json({ error: 'Proof not found' });
  if (Number(proofs[0].customer_id) !== Number(customerId)) return res.status(403).json({ error: 'Access denied' });

  // Check expiry
  if (proofs[0].expires_at && new Date(proofs[0].expires_at) < new Date()) {
    return res.status(400).json({ error: 'Proof has expired. Please request a new proof.' });
  }

  // Generate digital signature for approval
  const signature = status === 'approved' ? generateSignature(customerId, req.params.id) : null;

  await pool.query(
    'UPDATE sarga_proofs SET status = ?, customer_feedback = ?, reviewed_at = NOW(), digital_signature = COALESCE(?, digital_signature) WHERE id = ?',
    [status, customer_feedback || null, signature, req.params.id]
  );

  // Update job status
  if (status === 'approved') {
    await pool.query("UPDATE sarga_jobs SET status = 'Processing' WHERE id = ? AND status NOT IN ('Delivered','Cancelled')", [proofs[0].job_id]);
    await pool.query("UPDATE sarga_orders SET proof_approved = 1 WHERE id = (SELECT order_id FROM sarga_jobs WHERE id = ?)", [proofs[0].job_id]);
  } else if (status === 'rejected' || status === 'revision_requested') {
    await pool.query("UPDATE sarga_jobs SET status = 'Designing' WHERE id = ? AND status NOT IN ('Delivered','Cancelled')", [proofs[0].job_id]);
  }

  // Audit trail
  try {
    await pool.query(
      'INSERT INTO sarga_job_status_history (job_id, status, staff_id, notes) VALUES (?, ?, NULL, ?)',
      [proofs[0].job_id, status === 'approved' ? 'Processing' : 'Designing',
       `Customer ${status} proof #${req.params.id}${customer_feedback ? ': ' + customer_feedback : ''}`]
    );
  } catch (_ignored) { /* ignored */ }

  res.json({
    message: `Proof ${status}`,
    digital_signature: signature,
    reviewed_at: new Date().toISOString()
  });
}));

// ─── ADMIN: List proofs for a job ───
router.get('/proofs/:jobId', authenticateToken, asyncHandler(async (req, res) => {
  const [proofs] = await pool.query(
    `SELECT p.*, s.name AS uploaded_by_name FROM sarga_proofs p
     LEFT JOIN sarga_staff s ON p.uploaded_by = s.id
     WHERE p.job_id = ? ORDER BY p.version DESC`,
    [req.params.jobId]
  );
  res.json({ proofs });
}));

// ─── ADMIN: Upload proof for a job ───
router.post('/proofs/:jobId/upload', authenticateToken, asyncHandler(async (req, res) => {
  const multer = require('multer');
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'proofs');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => cb(null, `proof-${req.params.jobId}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`)
    }),
    limits: { fileSize: 50 * 1024 * 1024 }
  }).single('proof');

  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const result = await uploadToCloudinary(req.file.path, `proofs/job-${req.params.jobId}`);
      const [existing] = await pool.query('SELECT MAX(version) as mv FROM sarga_proofs WHERE job_id = ?', [req.params.jobId]);
      const version = (existing[0]?.mv || 0) + 1;

      // Set expiry to 7 days from now
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await pool.query(
        'INSERT INTO sarga_proofs (job_id, version, proof_url, preview_image, status, uploaded_by, designer_notes, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.params.jobId, version, result.secure_url, null, 'pending', req.user.id, req.body.notes || null, expiresAt]
      );

      await pool.query("UPDATE sarga_jobs SET status = 'Approval Pending' WHERE id = ?", [req.params.jobId]);

      res.status(201).json({
        version, url: result.secure_url, expires_at: expiresAt,
        message: 'Proof uploaded. Customer has 7 days to approve.'
      });
    } catch (_e) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });
}));

// ─── ADMIN: Get proof approval history ───
router.get('/proofs/:jobId/history', authenticateToken, asyncHandler(async (req, res) => {
  const [history] = await pool.query(
    `SELECT ps.id, ps.version, ps.status, ps.customer_feedback, ps.designer_notes,
            ps.created_at, ps.reviewed_at, COALESCE(s.name, 'Customer') AS actor_name,
            ps.digital_signature
     FROM sarga_proofs ps
     LEFT JOIN sarga_staff s ON ps.uploaded_by = s.id
     WHERE ps.job_id = ?
     ORDER BY ps.version ASC`,
    [req.params.jobId]
  );
  res.json({ history });
}));

module.exports = router;

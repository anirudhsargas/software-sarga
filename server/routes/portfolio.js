const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { uploadToCloudinary, deleteFromCloudinary } = require('../helpers/cloudinaryUpload');
const { redisCache } = require('../middleware/cache');
const { invalidatePattern } = require('../services/cacheService');
const invalidateCache = (pattern) => invalidatePattern(pattern).catch(() => {});
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function generateSlug(title) {
  return title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '') + '-' + crypto.randomBytes(3).toString('hex');
}

// ─── PUBLIC: Get portfolio projects ───
router.get('/website/portfolio', redisCache(600, 'portfolio'), asyncHandler(async (req, res) => {
  const { category, featured, search, page = 1, limit = 24 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  let where = 'WHERE p.published = 1';
  const params = [];

  if (category && category !== 'All') {
    where += ' AND p.category = ?';
    params.push(category);
  }
  if (featured === 'true') {
    where += ' AND p.featured = 1';
  }
  if (search) {
    where += ' AND (p.title LIKE ? OR p.description LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q);
  }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM sarga_portfolio_projects p ${where}`, params);
  const [rows] = await pool.query(
    `SELECT p.id, p.title, p.slug, p.description, p.category, p.cover_image, p.gallery_images, p.featured, p.created_at
     FROM sarga_portfolio_projects p ${where}
     ORDER BY p.featured DESC, p.position ASC, p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  const projects = rows.map(p => ({
    ...p,
    gallery_images: p.gallery_images ? (typeof p.gallery_images === 'string' ? JSON.parse(p.gallery_images) : p.gallery_images) : []
  }));

  res.json({ projects, total, page: Number(page), limit: Number(limit), total_pages: Math.ceil(total / Number(limit)) });
}));

// ─── PUBLIC: Get single project by slug ───
router.get('/website/portfolio/:slug', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM sarga_portfolio_projects WHERE slug = ? AND published = 1', [req.params.slug]);
  if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
  const project = rows[0];
  project.gallery_images = project.gallery_images ? (typeof project.gallery_images === 'string' ? JSON.parse(project.gallery_images) : project.gallery_images) : [];
  res.json({ project });
}));

// ─── PUBLIC: Get categories ───
router.get('/website/portfolio/categories/list', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT DISTINCT category, COUNT(*) AS count FROM sarga_portfolio_projects WHERE published = 1 GROUP BY category ORDER BY category'
  );
  res.json({ categories: rows });
}));

// ─── ADMIN: List all projects ───
router.get('/portfolio', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  let where = '1=1';
  const params = [];
  if (status === 'published') { where += ' AND published = 1'; }
  else if (status === 'draft') { where += ' AND published = 0'; }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM sarga_portfolio_projects WHERE ${where}`, params);
  const [rows] = await pool.query(
    `SELECT * FROM sarga_portfolio_projects WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  const projects = rows.map(p => ({
    ...p,
    gallery_images: p.gallery_images ? (typeof p.gallery_images === 'string' ? JSON.parse(p.gallery_images) : p.gallery_images) : []
  }));

  res.json({ projects, total, page: Number(page), limit: Number(limit) });
}));

// ─── ADMIN: Get single project ───
router.get('/portfolio/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM sarga_portfolio_projects WHERE id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
  const project = rows[0];
  project.gallery_images = project.gallery_images ? (typeof project.gallery_images === 'string' ? JSON.parse(project.gallery_images) : project.gallery_images) : [];
  res.json({ project });
}));

// ─── ADMIN: Create project ───
router.post('/portfolio', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { title, description, category, cover_image, gallery_images, featured, published, position } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const slug = generateSlug(title);
  const [result] = await pool.query(
    `INSERT INTO sarga_portfolio_projects (title, slug, description, category, cover_image, gallery_images, featured, published, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, slug, description || '', category || 'Custom Projects', cover_image || '',
     gallery_images ? JSON.stringify(gallery_images) : '[]', featured ? 1 : 0, published !== undefined ? (published ? 1 : 0) : 1, position || 0]
  );
  invalidateCache('/api/website/portfolio');
  res.status(201).json({ id: result.insertId, slug, message: 'Project created' });
}));

// ─── ADMIN: Update project ───
router.put('/portfolio/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, category, cover_image, gallery_images, featured, published, position } = req.body;
  const sets = [];
  const params = [];
  if (title !== undefined) { sets.push('title = ?'); params.push(title); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description); }
  if (category !== undefined) { sets.push('category = ?'); params.push(category); }
  if (cover_image !== undefined) { sets.push('cover_image = ?'); params.push(cover_image); }
  if (gallery_images !== undefined) { sets.push('gallery_images = ?'); params.push(JSON.stringify(gallery_images)); }
  if (featured !== undefined) { sets.push('featured = ?'); params.push(featured ? 1 : 0); }
  if (published !== undefined) { sets.push('published = ?'); params.push(published ? 1 : 0); }
  if (position !== undefined) { sets.push('position = ?'); params.push(position); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  await pool.query(`UPDATE sarga_portfolio_projects SET ${sets.join(', ')} WHERE id = ?`, params);
  invalidateCache('/api/website/portfolio');
  res.json({ message: 'Project updated' });
}));

// ─── ADMIN: Delete project ───
router.delete('/portfolio/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT cover_image, gallery_images FROM sarga_portfolio_projects WHERE id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
  await pool.query('DELETE FROM sarga_portfolio_projects WHERE id = ?', [req.params.id]);
  invalidateCache('/api/website/portfolio');
  res.json({ message: 'Project deleted' });
}));

// ─── ADMIN: Upload portfolio image ───
router.post('/portfolio/upload', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const multer = require('multer');
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'portfolio');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
    }),
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext)) return cb(null, true);
      cb(new Error('Only images (JPG, PNG, WEBP, SVG) are allowed'));
    },
    limits: { fileSize: 20 * 1024 * 1024 }
  }).single('image');

  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const result = await uploadToCloudinary(req.file.path, 'portfolio');
      res.json({ url: result.secure_url, public_id: result.public_id });
    } catch (e) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });
}));

module.exports = router;

/**
 * Design Check Routes — AI Design Error Detection
 */
const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const { analyzeDesign } = require('../helpers/designAnalyzer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Upload config for design files (allow larger files & more formats)
const designUploadsDir = path.join(__dirname, '..', 'uploads', 'designs');
if (!fs.existsSync(designUploadsDir)) {
    fs.mkdirSync(designUploadsDir, { recursive: true });
}

const designStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, designUploadsDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `design-${unique}${ext}`);
    }
});

const designUpload = multer({
    storage: designStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for design files
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Invalid file type. Allowed: JPG, PNG, WEBP, TIFF, PDF'));
    }
});

// ─── POST /design-check — Upload and analyze a design file ──
router.post('/design-check', authenticateToken, designUpload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const result = await analyzeDesign(filePath);

    // Save to database
    const [dbResult] = await pool.query(
        `INSERT INTO sarga_design_checks 
            (file_name, file_path, file_type, file_size_kb, result_json, passed, 
             total_issues, critical_issues, warnings, checked_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            req.file.originalname,
            `/uploads/designs/${req.file.filename}`,
            result.file_type,
            Math.round(req.file.size / 1024),
            JSON.stringify(result),
            result.passed ? 1 : 0,
            result.total_issues,
            result.critical_issues,
            result.warnings,
            req.user.id
        ]
    );

    res.json({
        id: dbResult.insertId,
        file_name: req.file.originalname,
        ...result
    });
}));

// ─── GET /design-check/history — List past checks ──────────
router.get('/design-check/history', authenticateToken, asyncHandler(async (req, res) => {
    const { limit = 20, offset = 0 } = req.query;

    const [rows] = await pool.query(
        `SELECT dc.id, dc.file_name, dc.file_type, dc.file_size_kb, dc.passed,
                dc.total_issues, dc.critical_issues, dc.warnings, dc.created_at,
                s.name AS checked_by_name
         FROM sarga_design_checks dc
         LEFT JOIN sarga_staff s ON dc.checked_by = s.id
         ORDER BY dc.created_at DESC
         LIMIT ? OFFSET ?`,
        [parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM sarga_design_checks');

    res.json({ checks: rows, total: countRows[0].total });
}));

// ─── GET /design-check/:id — Get specific check result ─────
router.get('/design-check/:id', authenticateToken, asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT dc.*, s.name AS checked_by_name
         FROM sarga_design_checks dc
         LEFT JOIN sarga_staff s ON dc.checked_by = s.id
         WHERE dc.id = ?`,
        [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ message: 'Design check not found' });

    const check = rows[0];
    try { check.result_json = JSON.parse(check.result_json); } catch { }

    res.json(check);
}));

module.exports = router;

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { auditLog } = require('../helpers');

// ─── Uploads Dir ─────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'uploads', 'designs');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ─── Multer Config (broader file types for design files) ─────
const designStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `design-${unique}${ext}`);
    }
});

const ALLOWED_EXTS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',  // Images
    '.pdf',                                               // PDF
    '.ai', '.eps', '.psd', '.cdr',                        // Design software
    '.tiff', '.tif', '.bmp',                              // Print-ready formats
    '.zip', '.rar'                                        // Archives (bundled designs)
]);

const designFileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) return cb(null, true);
    cb(new Error('Invalid file type. Allowed: Images, PDF, AI, EPS, PSD, CDR, TIFF, ZIP, RAR.'));
};

const uploadDesign = multer({
    storage: designStorage,
    fileFilter: designFileFilter,
    limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max per file
});

// Helper: determine file category
const getFileCategory = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp'].includes(ext)) return 'image';
    if (ext === '.pdf') return 'pdf';
    if (['.ai', '.eps', '.psd', '.cdr'].includes(ext)) return 'design';
    if (['.tiff', '.tif'].includes(ext)) return 'print';
    if (['.zip', '.rar'].includes(ext)) return 'archive';
    return 'other';
};

// Helper: remove uploaded file
const removeFile = async (fileUrl) => {
    if (!fileUrl) return;
    const filePath = path.join(__dirname, '..', fileUrl.replace(/^\//, ''));
    try { await fs.promises.unlink(filePath); } catch { /* ignore */ }
};

// ═══════════════════════════════════════════════════════════════
// GET /customers/:id/designs — List all designs for a customer
// ═══════════════════════════════════════════════════════════════
router.get('/customers/:id/designs', authenticateToken, async (req, res) => {
    try {
        const [designs] = await pool.query(
            `SELECT d.*, s.name as uploaded_by_name, j.job_number, j.job_name
             FROM sarga_customer_designs d
             LEFT JOIN sarga_staff s ON d.uploaded_by = s.id
             LEFT JOIN sarga_jobs j ON d.job_id = j.id
             WHERE d.customer_id = ?
             ORDER BY d.created_at DESC`,
            [req.params.id]
        );
        res.json(designs);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        console.error('Designs list error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /customers/:id/designs — Upload one or more design files
// ═══════════════════════════════════════════════════════════════
router.post('/customers/:id/designs', authenticateToken, uploadDesign.array('files', 10), async (req, res) => {
    const customerId = req.params.id;
    const { title, notes, tags, job_id } = req.body;

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }

    try {
        const insertValues = req.files.map(file => {
            const fileUrl = `/uploads/designs/${file.filename}`;
            const fileType = getFileCategory(file.originalname);
            const originalName = file.originalname;
            const fileSize = file.size;
            return [customerId, job_id || null, title || originalName, fileUrl, fileType, originalName, fileSize, notes || null, tags || null, req.user.id];
        });

        const placeholders = insertValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flatValues = insertValues.flat();

        const [result] = await pool.query(
            `INSERT INTO sarga_customer_designs 
             (customer_id, job_id, title, file_url, file_type, original_name, file_size, notes, tags, uploaded_by)
             VALUES ${placeholders}`,
            flatValues
        );

        auditLog(req.user.id, 'DESIGN_UPLOAD', `Uploaded ${req.files.length} design(s) for customer ${customerId}`);
        res.status(201).json({
            message: `${req.files.length} design(s) uploaded`,
            ids: Array.from({ length: req.files.length }, (_, i) => result.insertId + i)
        });
    } catch (err) {
        // Clean up uploaded files on DB error
        for (const file of req.files) {
            await removeFile(`/uploads/designs/${file.filename}`);
        }
        console.error('Design upload error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /customers/:customerId/designs/:designId — Update metadata
// ═══════════════════════════════════════════════════════════════
router.put('/customers/:customerId/designs/:designId', authenticateToken, async (req, res) => {
    const { title, notes, tags, job_id } = req.body;
    try {
        await pool.query(
            `UPDATE sarga_customer_designs SET title = ?, notes = ?, tags = ?, job_id = ? WHERE id = ? AND customer_id = ?`,
            [title || null, notes || null, tags || null, job_id || null, req.params.designId, req.params.customerId]
        );
        res.json({ message: 'Design updated' });
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /customers/:customerId/designs/:designId — Remove design
// ═══════════════════════════════════════════════════════════════
router.delete('/customers/:customerId/designs/:designId', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT file_url FROM sarga_customer_designs WHERE id = ? AND customer_id = ?',
            [req.params.designId, req.params.customerId]
        );
        if (!rows[0]) return res.status(404).json({ message: 'Design not found' });

        await removeFile(rows[0].file_url);
        await pool.query('DELETE FROM sarga_customer_designs WHERE id = ?', [req.params.designId]);
        auditLog(req.user.id, 'DESIGN_DELETE', `Deleted design ${req.params.designId} for customer ${req.params.customerId}`);
        res.json({ message: 'Design deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /jobs/:jobId/designs — Get designs linked to a specific job
// ═══════════════════════════════════════════════════════════════
router.get('/jobs/:jobId/designs', authenticateToken, async (req, res) => {
    try {
        const [designs] = await pool.query(
            `SELECT d.*, s.name as uploaded_by_name
             FROM sarga_customer_designs d
             LEFT JOIN sarga_staff s ON d.uploaded_by = s.id
             WHERE d.job_id = ?
             ORDER BY d.created_at DESC`,
            [req.params.jobId]
        );
        res.json(designs);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /jobs/:jobId/designs — Upload design files directly from Job page
// ═══════════════════════════════════════════════════════════════
router.post('/jobs/:jobId/designs', authenticateToken, uploadDesign.array('files', 10), async (req, res) => {
    const jobId = req.params.jobId;
    const { title, notes, tags } = req.body;

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }

    try {
        // Look up the job's customer_id
        const [[job]] = await pool.query('SELECT customer_id FROM sarga_jobs WHERE id = ?', [jobId]);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        const customerId = job.customer_id;
        const insertValues = req.files.map(file => {
            const fileUrl = `/uploads/designs/${file.filename}`;
            const fileType = getFileCategory(file.originalname);
            return [customerId, jobId, title || file.originalname, fileUrl, fileType, file.originalname, file.size, notes || null, tags || null, req.user.id];
        });

        const placeholders = insertValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const [result] = await pool.query(
            `INSERT INTO sarga_customer_designs 
             (customer_id, job_id, title, file_url, file_type, original_name, file_size, notes, tags, uploaded_by)
             VALUES ${placeholders}`,
            insertValues.flat()
        );

        auditLog(req.user.id, 'JOB_DESIGN_UPLOAD', `Uploaded ${req.files.length} design(s) for job ${jobId}`);
        res.status(201).json({
            message: `${req.files.length} design(s) uploaded`,
            ids: Array.from({ length: req.files.length }, (_, i) => result.insertId + i)
        });
    } catch (err) {
        for (const file of req.files) {
            await removeFile(`/uploads/designs/${file.filename}`);
        }
        console.error('Job design upload error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /jobs/:jobId/designs/:designId — Remove a design from a job
// ═══════════════════════════════════════════════════════════════
router.delete('/jobs/:jobId/designs/:designId', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT file_url FROM sarga_customer_designs WHERE id = ? AND job_id = ?',
            [req.params.designId, req.params.jobId]
        );
        if (!rows[0]) return res.status(404).json({ message: 'Design not found' });

        await removeFile(rows[0].file_url);
        await pool.query('DELETE FROM sarga_customer_designs WHERE id = ?', [req.params.designId]);
        auditLog(req.user.id, 'JOB_DESIGN_DELETE', `Deleted design ${req.params.designId} from job ${req.params.jobId}`);
        res.json({ message: 'Design deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

module.exports = router;

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
    '.ai', '.eps', '.psd', '.cdr', '.indd',               // Design software (Illustrator, EPS, Photoshop, CorelDRAW, InDesign)
    '.tiff', '.tif', '.bmp',                              // Print-ready formats
    '.zip', '.rar'                                        // Archives (bundled designs)
]);

const designFileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    console.log(`Design file filter - Name: ${file.originalname}, MIME: ${file.mimetype}, Extension: ${ext}`);
    
    if (ALLOWED_EXTS.has(ext)) {
        console.log(`File accepted: ${file.originalname}`);
        return cb(null, true);
    }
    
    const errorMsg = `Invalid file type: ${ext}. Allowed: Images (JPG, PNG, GIF, SVG, WEBP), PDF, Design software (AI, PSD, EPS, CorelDRAW, InDesign), Print formats (TIFF, BMP), Archives (ZIP, RAR).`;
    console.error(`File rejected: ${file.originalname} - ${errorMsg}`);
    cb(new Error(errorMsg));
};

const uploadDesign = multer({
    storage: designStorage,
    fileFilter: designFileFilter,
    limits: { fileSize: 150 * 1024 * 1024 } // 150 MB max per file
});

// Helper: determine file category
const getFileCategory = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp'].includes(ext)) return 'image';
    if (ext === '.pdf') return 'pdf';
    if (['.ai', '.eps', '.psd', '.cdr', '.indd'].includes(ext)) return 'design';
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
        res.status(500).json({ message: 'Database error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /customers/:id/designs — Upload one or more design files
// ═══════════════════════════════════════════════════════════════
router.post('/customers/:id/designs', authenticateToken, (req, res, next) => {
    uploadDesign.array('files', 10)(req, res, (err) => {
        if (err) {
            console.error('Multer error for customer designs:', err.message);
            return res.status(400).json({ message: 'File upload validation failed' });
        }
        next();
    });
}, async (req, res) => {
    const customerId = req.params.id;
    const { title, notes, tags, job_id } = req.body;

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }

    try {
        // Verify customer exists and has valid ID
        const [customerCheck] = await pool.query('SELECT id FROM sarga_customers WHERE id = ?', [customerId]);
        if (customerCheck.length === 0) {
            for (const file of req.files) {
                await removeFile(`/uploads/designs/${file.filename}`);
            }
            console.error(`Customer ${customerId} not found`);
            return res.status(404).json({ message: 'Customer not found. Please check the customer ID.' });
        }

        // If job_id is provided, verify it exists and belongs to this customer
        if (job_id) {
            const [jobCheck] = await pool.query('SELECT id FROM sarga_jobs WHERE id = ? AND customer_id = ?', [job_id, customerId]);
            if (jobCheck.length === 0) {
                for (const file of req.files) {
                    await removeFile(`/uploads/designs/${file.filename}`);
                }
                console.error(`Job ${job_id} not found for customer ${customerId}`);
                return res.status(400).json({ message: 'Invalid job ID for this customer. Please select a valid job.' });
            }
        }

        const insertValues = req.files.map(file => {
            const fileUrl = `/uploads/designs/${file.filename}`;
            const fileType = getFileCategory(file.originalname);
            const originalName = file.originalname;
            const fileSize = file.size;
            return [customerId, job_id || null, title || originalName, fileUrl, fileType, originalName, fileSize, notes || null, tags || null, req.user.id || null];
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
            message: `${req.files.length} design(s) uploaded successfully`,
            ids: Array.from({ length: req.files.length }, (_, i) => result.insertId + i)
        });
    } catch (err) {
        // Clean up uploaded files on DB error
        for (const file of req.files) {
            await removeFile(`/uploads/designs/${file.filename}`);
        }
        console.error('Design upload error:', {
            message: err.message,
            code: err.code,
            sqlState: err.sqlState,
            customerId: req.params.id,
            filesCount: req.files?.length
        });
        
        // More specific error messages
        if (err.code === 'ER_NO_SUCH_TABLE') {
            res.status(500).json({ message: 'Design upload table not initialized. Please contact admin.' });
        } else if (err.code === 'ER_NO_REFERENCED_ROW') {
            res.status(400).json({ message: 'Invalid job ID or customer not found' });
        } else if (err.message && err.message.includes('customer_id') && err.message.includes('cannot be null')) {
            res.status(400).json({ message: 'Customer must be assigned to the job before uploading designs.' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
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
        res.status(500).json({ message: 'Database error' });
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
        res.status(500).json({ message: 'Database error' });
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
        res.status(500).json({ message: 'Database error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /jobs/:jobId/designs — Upload design files directly from Job page
// ═══════════════════════════════════════════════════════════════
router.post('/jobs/:jobId/designs', authenticateToken, (req, res, next) => {
    uploadDesign.array('files', 10)(req, res, (err) => {
        if (err) {
            console.error('Multer error for job designs:', err.message);
            return res.status(400).json({ message: 'File upload validation failed' });
        }
        next();
    });
}, async (req, res) => {
    const jobId = req.params.jobId;
    const { title, notes, tags } = req.body;

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }

    try {
        // Look up the job's customer_id
        const [jobRows] = await pool.query('SELECT id, customer_id, job_number FROM sarga_jobs WHERE id = ?', [jobId]);
        if (!jobRows || jobRows.length === 0) {
            for (const file of req.files) {
                await removeFile(`/uploads/designs/${file.filename}`);
            }
            return res.status(404).json({ message: 'Job not found' });
        }

        const job = jobRows[0];
        if (!job.customer_id) {
            for (const file of req.files) {
                await removeFile(`/uploads/designs/${file.filename}`);
            }
            console.error(`Job ${jobId} has no associated customer`);
            return res.status(400).json({ message: 'This job is not linked to a customer. Please link a customer to this job first.' });
        }

        const customerId = job.customer_id;
        const insertValues = req.files.map(file => {
            const fileUrl = `/uploads/designs/${file.filename}`;
            const fileType = getFileCategory(file.originalname);
            return [customerId, jobId, title || file.originalname, fileUrl, fileType, file.originalname, file.size, notes || null, tags || null, req.user.id || null];
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
            message: `${req.files.length} design(s) uploaded successfully`,
            ids: Array.from({ length: req.files.length }, (_, i) => result.insertId + i)
        });
    } catch (err) {
        for (const file of req.files) {
            await removeFile(`/uploads/designs/${file.filename}`);
        }
        console.error('Job design upload error:', {
            message: err.message,
            code: err.code,
            sqlState: err.sqlState,
            jobId: req.params.jobId,
            filesCount: req.files?.length
        });
        
        if (err.code === 'ER_NO_SUCH_TABLE') {
            res.status(500).json({ message: 'Design upload table not initialized. Please contact admin.' });
        } else if (err.code === 'ER_NO_REFERENCED_ROW') {
            res.status(400).json({ message: 'Invalid job ID or customer not found' });
        } else if (err.message.includes('customer_id') && err.message.includes('cannot be null')) {
            res.status(400).json({ message: 'Job must be linked to a customer before uploading designs.' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
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
        res.status(500).json({ message: 'Database error' });
    }
});

module.exports = router;

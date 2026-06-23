const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { pool: _pool } = require('../database');
const logger = require('../helpers/logger'); // eslint-disable-line no-unused-vars

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function getCustomerId(req) {
  try {
    const jwt = require('jsonwebtoken');
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET || require('../middleware/auth').JWT_SECRET).id;
  } catch { return null; }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'vdp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (['.csv', '.xlsx'].includes(ext)) return cb(null, true);
  cb(new Error('Only CSV and XLSX files allowed'));
}});

function csvParse(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const vals = [];
    let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  });
  return { headers, rows };
}

function buildVDPPDF(rows, fields, designConfig, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: false });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const { page_width = 595.28, _page_height = 841.89, font_size = 12, font_family = 'Helvetica', x_offset = 50, y_offset = 50, _line_height = 20 } = designConfig;

    rows.forEach((row, idx) => {
      if (idx > 0) doc.addPage();
      doc.font(font_family).fontSize(font_size);
      let y = y_offset;
      fields.forEach(f => {
        if (f.type === 'text') {
          doc.fontSize(f.fontSize || font_size);
          doc.text(row[f.field] || '', x_offset, y, { width: page_width - 2 * x_offset, align: f.align || 'left' });
          y += (f.fontSize || font_size) * 1.5;
        } else if (f.type === 'label') {
          doc.fontSize(f.fontSize || 10).font(f.font_family || 'Helvetica-Bold');
          doc.text((f.label || f.field) + ': ', x_offset, y, { continued: true });
          doc.font(font_family).fontSize(f.fontSize || font_size);
          doc.text(row[f.field] || '');
          y += (f.fontSize || font_size) * 1.5;
        }
      });
    });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// POST /api/vdp/preview - Parse CSV and preview data
router.post('/vdp/preview', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });

  const content = fs.readFileSync(req.file.path, 'utf-8');
  const { headers, rows } = csvParse(content);

  fs.unlink(req.file.path, () => {});

  res.json({ headers, preview: rows.slice(0, 5), total_rows: rows.length });
}));

// POST /api/vdp/generate - Generate VDP PDF
router.post('/vdp/generate', upload.single('file'), asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  if (!customerId) return res.status(401).json({ error: 'Authentication required' });

  if (!req.file) return res.status(400).json({ error: 'CSV file required' });

  const { fields, design_config } = req.body;

  let parsedFields;
  try { parsedFields = typeof fields === 'string' ? JSON.parse(fields) : fields; } catch { return res.status(400).json({ error: 'Invalid fields JSON' }); }

  let parsedConfig;
  try { parsedConfig = typeof design_config === 'string' ? JSON.parse(design_config) : (design_config || {}); } catch { return res.status(400).json({ error: 'Invalid design_config JSON' }); }

  const content = fs.readFileSync(req.file.path, 'utf-8');
  const { rows } = csvParse(content);

  const outputFileName = `vdp-${Date.now()}.pdf`;
  const outputPath = path.join(__dirname, '..', 'uploads', 'vdp', outputFileName);

  await buildVDPPDF(rows, parsedFields, parsedConfig, outputPath);

  fs.unlink(req.file.path, () => {});

  res.json({
    file_url: `/uploads/vdp/${outputFileName}`,
    total_pages: rows.length,
    message: `${rows.length} pages generated`
  });
}));

// POST /api/vdp/estimate - Estimate cost for VDP
router.post('/vdp/estimate', asyncHandler(async (req, res) => {
  const { quantity_per_page = 1, total_rows = 0, base_price = 5 } = req.body;
  const pages = Math.ceil(total_rows / quantity_per_page);
  const per_page_vdp = 2; // VDP processing cost per page
  const total = pages * (base_price + per_page_vdp);
  res.json({ pages, per_page_cost: base_price + per_page_vdp, total });
}));

module.exports = router;

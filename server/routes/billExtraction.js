const router = require('express').Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const { extractBillData, queue } = require('../services/billExtractionService');
const logger = require('../helpers/logger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP, and PDF files are allowed'));
    }
  },
});

router.post('/bills/extract-data', authenticateToken, upload.array('billPages', 10), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }

  let totalSize = 0;
  for (const f of req.files) totalSize += f.size;
  if (totalSize > 25 * 1024 * 1024) {
    return res.status(400).json({ success: false, message: 'Combined file size exceeds 25MB limit' });
  }

  const { queueLength, estimatedWaitSeconds } = queue.getQueueStatus();
  logger.info('[BillExtraction] Request received', { queueLength, estimatedWaitSeconds, pageCount: req.files.length, totalSize });

  try {
    const pages = req.files.map(f => ({ buffer: f.buffer, mimeType: f.mimetype }));
    const data = await extractBillData(pages);
    logger.info('[BillExtraction] Extraction successful', { queueLength: queue.getQueueStatus().queueLength });
    return res.json({ success: true, data, queueStatus: { queueLength, estimatedWaitSeconds } });
  } catch (err) {
    const status = err.message === 'Too many pending extractions, please try again in a few minutes' ? 503 : 500;
    logger.error('[BillExtraction] Extraction failed', { error: err.message, queueLength: queue.getQueueStatus().queueLength });
    return res.status(status).json({ success: false, message: err.message, queueStatus: { queueLength, estimatedWaitSeconds } });
  }
}));

module.exports = router;

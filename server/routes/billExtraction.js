const router = require('express').Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const { extractBillDataFromImages, queue } = require('../services/billExtractionService');
const { matchVendorAndProducts, matchVendorAndConsumables } = require('../services/billMatchingService');
const { getIO } = require('../services/socketManager');
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

function emitProgress(socketId, data) {
  if (!socketId) return;
  try {
    const io = getIO();
    io.to(socketId).emit('billExtractionProgress', data);
  } catch (err) {
    logger.warn('[BillExtraction] Socket emit failed', { error: err.message });
  }
}

router.post('/bills/extract-data', authenticateToken, upload.array('billPages', 10), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }

  let totalSize = 0;
  for (const f of req.files) totalSize += f.size;
  if (totalSize > 25 * 1024 * 1024) {
    return res.status(400).json({ success: false, message: 'Combined file size exceeds 25MB limit' });
  }

  const { socketId } = req.body;
  const { queueLength, estimatedWaitSeconds } = queue.getQueueStatus();
  logger.info('[BillExtraction] Request received', { queueLength, estimatedWaitSeconds, pageCount: req.files.length, totalSize, hasSocketId: !!socketId });

  emitProgress(socketId, { stage: 'uploading', percent: 10, label: 'Uploading bill...' });

  try {
    const pages = req.files.map(f => ({ buffer: f.buffer, mimeType: f.mimetype }));
    const target = req.body.target || 'products';

    emitProgress(socketId, { stage: 'preparing', percent: 20, label: 'Preparing pages for AI...' });

    const currentQueue = queue.getQueueStatus();
    emitProgress(socketId, {
      stage: 'ai_extracting',
      percent: 40,
      label: currentQueue.queueLength > 0
        ? `Waiting in queue (${currentQueue.queueLength} ahead, ~${currentQueue.estimatedWaitSeconds}s)...`
        : 'Analyzing invoice with AI...',
      queueStatus: currentQueue,
    });

    const data = await extractBillDataFromImages(pages, target);

    emitProgress(socketId, { stage: 'ai_extracting', percent: 75, label: 'AI extraction complete' });
    emitProgress(socketId, { stage: 'matching', percent: 90, label: 'Matching vendors and products...' });

    let vendorMatch = null;
    let itemMatches = [];
    try {
      if (target === 'consumables') {
        const matchResult = await matchVendorAndConsumables(data);
        vendorMatch = matchResult.vendorMatch;
        itemMatches = matchResult.itemMatches;
      } else {
        const matchResult = await matchVendorAndProducts(data);
        vendorMatch = matchResult.vendorMatch;
        itemMatches = matchResult.itemMatches;
      }
    } catch (matchErr) {
      logger.error('[BillExtraction] Vendor/matching failed', {
        error: matchErr.message,
        stack: matchErr.stack,
        target,
      });
    }

    logger.info('[BillExtraction] Extraction successful', { queueLength: queue.getQueueStatus().queueLength });

    emitProgress(socketId, { stage: 'complete', percent: 100, label: 'Extraction complete!' });

    return res.json({ success: true, data, vendorMatch, itemMatches, queueStatus: { queueLength, estimatedWaitSeconds } });
  } catch (err) {
    const status = err.message.includes('temporarily unavailable') || err.message === 'Too many pending extractions, please try again in a few minutes' ? 503 : 500;
    logger.error('[BillExtraction] Extraction failed', { error: err.message, queueLength: queue.getQueueStatus().queueLength });
    emitProgress(socketId, { stage: 'failed', failedStage: 'ai_extracting', message: err.message });
    return res.status(status).json({ success: false, message: err.message, queueStatus: { queueLength, estimatedWaitSeconds } });
  }
}));

module.exports = router;

const router = require('express').Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const { extractBillData, queue } = require('../services/billExtractionService');
const { matchVendorAndProducts } = require('../services/billMatchingService');
const { extractTextFromImages } = require('../services/ocrService');
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

  let ocrText;
  try {
    const pages = req.files.map(f => ({ buffer: f.buffer, mimeType: f.mimetype }));
    ocrText = await extractTextFromImages(pages, (pageInfo) => {
      emitProgress(socketId, {
        stage: 'ocr_processing',
        percent: 30,
        label: `Reading page ${pageInfo.currentPage} of ${pageInfo.totalPages}...`,
        page: { current: pageInfo.currentPage, total: pageInfo.totalPages },
      });
    });
    logger.info('[BillExtraction] OCR complete', { textLength: ocrText.length });
    emitProgress(socketId, { stage: 'ocr_complete', percent: 50, label: 'Text extracted successfully' });
  } catch (ocrErr) {
    logger.error('[BillExtraction] OCR failed', { message: ocrErr.message, stack: ocrErr.stack });
    emitProgress(socketId, { stage: 'failed', failedStage: 'ocr_processing', message: ocrErr.message });
    return res.status(400).json({ success: false, message: ocrErr.message });
  }

  try {
    const currentQueue = queue.getQueueStatus();
    emitProgress(socketId, {
      stage: 'ai_extracting',
      percent: 60,
      label: currentQueue.queueLength > 0
        ? `Waiting in queue (${currentQueue.queueLength} ahead, ~${currentQueue.estimatedWaitSeconds}s)...`
        : 'Extracting data with AI...',
      queueStatus: currentQueue,
    });

    const data = await extractBillData(ocrText);

    emitProgress(socketId, { stage: 'ai_extracting', percent: 75, label: 'AI extraction complete' });
    emitProgress(socketId, { stage: 'matching', percent: 90, label: 'Matching vendors and products...' });

    let vendorMatch = null;
    let itemMatches = [];
    try {
      const matchResult = await matchVendorAndProducts(data);
      vendorMatch = matchResult.vendorMatch;
      itemMatches = matchResult.itemMatches;
    } catch (matchErr) {
      logger.error('[BillExtraction] Vendor/product matching failed', {
        error: matchErr.message,
        stack: matchErr.stack,
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

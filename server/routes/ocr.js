const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { extractTextFromImage, extractTextFromPDF, parseExtractedText, extractUtilityFields } = require('../utils/ocrExtractor');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database');

const upload = multer({
  dest: '/tmp/sarga_ocr/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP, and PDF files are allowed'));
  }
});

async function classifyBillType(parsed, branchId) {
  const utilityFields = parsed.utilityFields || extractUtilityFields(parsed.rawText || '');
  const hasGst = !!parsed.gstNumber;
  const hasProvider = !!utilityFields.providerName;
  const hasConsumerNo = !!utilityFields.consumerNumber;
  const hasUtilKeywords = utilityFields.hasUtilityKeywords;

  let detectedType = 'vendor';
  let matchedConnection = null;
  let detectionConfidence = 'low';

  // Try to match consumer number against utility connections for this branch
  if (hasConsumerNo && branchId) {
    try {
      const [rows] = await pool.query(
        `SELECT id, utility_type, provider, connection_id, label, billing_cycle
         FROM sarga_utility_connections
         WHERE branch_id = ? AND is_active = 1 AND connection_id = ?`,
        [branchId, utilityFields.consumerNumber]
      );
      if (rows && rows.length > 0) {
        matchedConnection = rows[0];
      }
    } catch (err) {
      console.warn('Utility connection lookup failed:', err.message);
    }
  }

  // Decision logic
  if (matchedConnection) {
    detectedType = 'utility';
    detectionConfidence = 'high';
  } else if (hasProvider && hasUtilKeywords && !hasGst) {
    detectedType = 'utility';
    detectionConfidence = 'medium';
  } else if ((hasProvider || hasUtilKeywords) && !hasGst) {
    detectedType = 'unknown';
    detectionConfidence = 'low';
  } else {
    detectedType = 'vendor';
    detectionConfidence = hasGst ? 'high' : 'medium';
  }

  return {
    detectedType,
    detectionConfidence,
    matchedConnection,
    utilityFields,
  };
}

router.post('/extract', authenticateToken, upload.single('bill'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const isPDF = req.file.mimetype === 'application/pdf';
    let rawText;

    if (isPDF) {
      const pdfPath = filePath + '.pdf';
      await fs.move(filePath, pdfPath);
      rawText = await extractTextFromPDF(pdfPath);
      await fs.remove(pdfPath);
    } else {
      rawText = await extractTextFromImage(filePath);
      await fs.remove(filePath);
    }

    const parsed = parseExtractedText(rawText);
    const branchId = req.body.branch_id || req.user?.branch_id;
    const classification = await classifyBillType(parsed, branchId);

    res.json({
      success: true,
      data: {
        ...parsed,
        detectedType: classification.detectedType,
        detectionConfidence: classification.detectionConfidence,
        matchedConnection: classification.matchedConnection,
        utilityFields: classification.utilityFields,
      }
    });

  } catch (err) {
    console.error('OCR error:', err.message);
    if (filePath) await fs.remove(filePath).catch(() => {});
    res.status(500).json({ success: false, message: 'OCR processing failed: ' + err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { extractTextFromImage, extractTextFromPDF, parseExtractedText } = require('../utils/ocrExtractor');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({
  dest: '/tmp/sarga_ocr/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP, and PDF files are allowed'));
  }
});

router.post('/extract', authenticateToken, upload.single('bill'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const isPDF = req.file.mimetype === 'application/pdf';
    let rawText;

    if (isPDF) {
      // Rename to .pdf so pdf2pic recognises it
      const pdfPath = filePath + '.pdf';
      await fs.move(filePath, pdfPath);
      rawText = await extractTextFromPDF(pdfPath);
      await fs.remove(pdfPath);
    } else {
      rawText = await extractTextFromImage(filePath);
      await fs.remove(filePath);
    }

    const extracted = parseExtractedText(rawText);
    res.json({ success: true, data: extracted });

  } catch (err) {
    console.error('OCR error:', err.message);
    if (filePath) await fs.remove(filePath).catch(() => {});
    res.status(500).json({ success: false, message: 'OCR processing failed: ' + err.message });
  }
});

module.exports = router;

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

const { GoogleGenerativeAI } = require('@google/generative-ai');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const EXPENSE_EXTRACTION_PROMPT = `You are given a bill, receipt, or invoice for a business expense or utility connection. Extract the following fields and return them as a valid JSON object:
- vendor_name: Name of the vendor, service provider, or utility company (e.g., KSEB, Jio Fiber, Airtel, BSNL, water authority, landlord name).
- bill_number: Invoice or bill number.
- bill_date: Date of the bill in YYYY-MM-DD format.
- gst_number: GST identification number (if present, otherwise null).
- amount: The total payable amount (grand total) as a number or string.
- cgst: Central GST amount (if present, otherwise null).
- sgst: State GST amount (if present, otherwise null).
- igst: Integrated GST amount (if present, otherwise null).
- category: Classify the expense into one of: 'Electricity', 'Internet / Broadband', 'Phone', 'Water', 'Rent', 'Office Supplies', 'Fuel', 'Transport', 'Maintenance', 'Food & Refreshments', 'Miscellaneous'.
- consumer_number: Consumer number, connection ID, or customer account ID (crucial for utility bills like electricity, water, internet).
- billing_period: Billing cycle/period if mentioned (e.g., "Jan 2026", "01/01/2026 - 31/01/2026").
- due_date: Payment due date in YYYY-MM-DD format.

If a field is not present or cannot be found, use null. Output ONLY the raw JSON object, without any markdown formatting or extra text.`;

async function extractExpenseWithGemini(filePath, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const fileBuffer = await fs.readFile(filePath);
  const base64Data = fileBuffer.toString('base64');

  const parts = [
    EXPENSE_EXTRACTION_PROMPT,
    {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    },
  ];

  const result = await model.generateContent(parts);
  const responseText = result.response.text();
  const parsed = JSON.parse(responseText);

  return {
    vendorName: parsed.vendor_name || null,
    amount: parsed.amount != null ? parseFloat(String(parsed.amount).replace(/,/g, '')) : null,
    date: parsed.bill_date || null,
    gstNumber: parsed.gst_number || null,
    cgst: parsed.cgst != null ? parseFloat(String(parsed.cgst).replace(/,/g, '')) : null,
    sgst: parsed.sgst != null ? parseFloat(String(parsed.sgst).replace(/,/g, '')) : null,
    igst: parsed.igst != null ? parseFloat(String(parsed.igst).replace(/,/g, '')) : null,
    category: parsed.category || 'Miscellaneous',
    confidence: 4,
    rawText: responseText,
    utilityFields: {
      providerName: parsed.vendor_name || null,
      consumerNumber: parsed.consumer_number || null,
      billingPeriod: parsed.billing_period || null,
      hasUtilityKeywords: !!(parsed.consumer_number || parsed.billing_period),
    }
  };
}

router.post('/extract', authenticateToken, upload.single('bill'), async (req, res) => {
  const filePath = req.file?.path;
  const mimeType = req.file?.mimetype;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    let parsed;
    let geminiUsed = false;

    if (process.env.GEMINI_API_KEY) {
      try {
        console.log('[ocr.js] Attempting AI expense extraction with Gemini...');
        parsed = await extractExpenseWithGemini(filePath, mimeType);
        geminiUsed = true;
        console.log('[ocr.js] Gemini extraction succeeded:', parsed.vendorName, parsed.amount);
      } catch (geminiErr) {
        console.error('[ocr.js] Gemini extraction failed, falling back to local OCR:', geminiErr.message);
      }
    }

    if (!geminiUsed) {
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

      parsed = parseExtractedText(rawText);
    } else {
      await fs.remove(filePath).catch(() => {});
    }

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

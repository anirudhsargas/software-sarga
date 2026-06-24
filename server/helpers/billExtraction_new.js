const Tesseract = require('tesseract.js'); // eslint-disable-line no-unused-vars
const { pool } = require('../database');
let _PDFParse;
try { _PDFParse = require('pdf-parse'); } catch (_e) { _PDFParse = null; }
const fs = require('fs'); // eslint-disable-line no-unused-vars
const sharp = require('sharp'); // eslint-disable-line no-unused-vars

function calculateFieldConfidence(fieldName, value) {
  if (value === null || value === undefined || value === '') return 0.15;
  const str = String(value).trim();
  if (!str) return 0.15;
  switch (fieldName) {
    case 'vendor_name':
      return str.length >= 3 && /[A-Za-z]/.test(str) ? 0.85 : str.length >= 2 ? 0.55 : 0.3;
    case 'bill_number':
      return /^[A-Z0-9][A-Z0-9\/\-]{2,20}$/i.test(str) ? 0.9 : /[\dA-Z]/i.test(str) && str.length >= 2 ? 0.6 : 0.25;
    case 'bill_date':
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) { const d = new Date(str); if (!isNaN(d.getTime())) return 0.95; }
      return /^\d{2}[-/]\d{2}[-/]\d{2,4}$/.test(str) ? 0.65 : 0.2;
    case 'amount':
    case 'total_amount': {
      const num = Number(value) || 0;
      return num > 0 && num < 1e9 ? 0.9 : num > 0 ? 0.7 : 0.2;
    }
    default:
      return str.length > 0 ? 0.6 : 0.1;
  }
}

function computeOverallConfidence(extracted) {
  const fields = ['vendor_name', 'bill_number', 'bill_date', 'total_amount'];
  const scores = fields.map(f => calculateFieldConfidence(f, extracted[f]));
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
}

async function checkDuplicateBill({ vendorName, billNumber, amount, branchId }) {
  try {
    if (!vendorName && !billNumber) return null;
    const [rows] = await pool.query(
      `SELECT id, vendor_name, bill_number, amount, bill_date, created_at
       FROM sarga_bills_documents
       WHERE (? IS NULL OR LOWER(TRIM(vendor_name)) = LOWER(TRIM(?)))
         AND (? IS NULL OR LOWER(TRIM(bill_number)) = LOWER(TRIM(?)))
         AND (? IS NULL OR ABS(COALESCE(amount, 0) - ?) < 0.01)
         AND branch_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [vendorName || null, vendorName || null, billNumber || null, billNumber || null,
       amount ? Number(amount) : null, amount ? Number(amount) : null, branchId || 0]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.warn('[DuplicateCheck] Error:', error.message);
    return null;
  }
}

async function extractTextFromDocument(filePath) { // eslint-disable-line no-unused-vars
  try {
    const ext = filePath.toLowerCase().split('.').pop();
    console.log('[Extraction] File type detected:', ext);
    let result;
    if (ext === 'pdf') {
      result = await extractTextFromPdf(filePath); // eslint-disable-line no-undef
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      result = await extractTextFromImage(filePath); // eslint-disable-line no-undef
      if (!result.text && result.error) return result;
    } else {
      return { text: '', confidence: 0, error: 'Unsupported format: ' + ext };
    }
    result.confidence_scores = {
      overall: result.confidence || 0,
      text_length: result.text ? Math.min(1, result.text.length / 500) : 0
    };
    return result;
  } catch (error) {
    console.error('Error extracting text:', error.message);
    return { text: '', confidence: 0, error: error.message, confidence_scores: { overall: 0, text_length: 0 } };
  }
}
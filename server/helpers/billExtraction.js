const fs = require('fs');
const path = require('path');
const { extractBillData } = require('../utils/ocrParser');
const { pool } = require('../database');

// Load server/.env explicitly so this helper works even when Node is started from workspace root.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ML Service URL for PaddleOCR
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

async function extractWithPaddleOCR(filePath) {
  try {
    console.log('[PaddleOCR] Processing bill:', filePath);
    const imageData = fs.readFileSync(filePath);
    const base64Data = imageData.toString('base64');
    const mimeType = getMimeType(filePath);
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const response = await fetch(`${ML_SERVICE_URL}/ocr/extract-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, return_details: false })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `PaddleOCR service error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.text) {
      throw new Error('PaddleOCR returned no text');
    }

    console.log('[PaddleOCR] Extraction successful');
    return { text: result.text, confidence: result.confidence || 0.85 };
  } catch (error) {
    console.warn('[PaddleOCR] Extraction failed:', error.message);
    throw error;
  }
}

async function extractWithPaddleOCRWithRetry(filePath) {
  const preprocessingSteps = [
    { name: 'none', contrast: 1.0, brightness: 1.0, sharpen: 0 },
    { name: 'high_contrast', contrast: 1.4, brightness: 1.05, sharpen: 1 },
    { name: 'brightened', contrast: 1.0, brightness: 1.2, sharpen: 0 },
    { name: 'sharpened', contrast: 1.2, brightness: 1.0, sharpen: 2 },
    { name: 'grayscale_boost', contrast: 1.5, brightness: 0.95, sharpen: 1 }
  ];

  let lastError = null;

  for (const step of preprocessingSteps) {
    try {
      const imageData = fs.readFileSync(filePath);
      const base64Data = imageData.toString('base64');
      const mimeType = getMimeType(filePath);
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      const response = await fetch(`${ML_SERVICE_URL}/ocr/extract-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          return_details: false,
          preprocessing: step
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `PaddleOCR service error: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.text && result.text.trim().length > 10) {
        console.log(`[PaddleOCR] Extraction successful with preprocessing: ${step.name}`);
        return { text: result.text, confidence: result.confidence || 0.8, preprocessing: step.name };
      }
      lastError = new Error('PaddleOCR returned insufficient text');
    } catch (error) {
      lastError = error;
      console.warn(`[PaddleOCR] Retry ${step.name} failed:`, error.message);
    }
  }

  throw lastError || new Error('PaddleOCR extraction failed after all retries');
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('GEMINI_API_KEY is not configured in server environment');
  }
  return { apiKey: String(apiKey).trim() };
}

function getModelCandidates() {
  const preferred = String(process.env.GEMINI_MODEL || '').trim();
  const fallbackFromEnv = String(process.env.GEMINI_MODEL_FALLBACKS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const defaults = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];

  return [...new Set([preferred, ...fallbackFromEnv, ...defaults].filter(Boolean))];
}

function getMimeType(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function extractJson(text) {
  const raw = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function calculateFieldConfidence(fieldName, value, extractedData = {}) {
  if (value === null || value === undefined || value === '') return 0.15;
  const str = String(value).trim();
  if (!str) return 0.15;

  switch (fieldName) {
    case 'vendor_name':
      if (str.length >= 3 && /[A-Za-z]/.test(str)) return 0.85;
      if (str.length >= 2) return 0.55;
      return 0.3;
    case 'bill_number':
      if (/^[A-Z0-9][A-Z0-9\/\-]{2,20}$/i.test(str)) return 0.9;
      if (/[\dA-Z]/i.test(str) && str.length >= 2) return 0.6;
      return 0.25;
    case 'bill_date':
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return 0.95;
      }
      if (/^\d{2}[-/]\d{2}[-/]\d{2,4}$/.test(str)) return 0.65;
      return 0.2;
    case 'total_amount':
    case 'amount': {
      const num = toNumber(value, 0);
      if (num > 0 && num < 1e9) return 0.9;
      if (num > 0) return 0.7;
      return 0.2;
    }
    case 'tax_amount':
    case 'tax': {
      const num = toNumber(value, 0);
      if (num > 0) return 0.85;
      return 0.5;
    }
    case 'subtotal': {
      const num = toNumber(value, 0);
      if (num > 0) return 0.85;
      return 0.4;
    }
    case 'category':
      if (str.length >= 3) return 0.75;
      return 0.35;
    case 'items': {
      const items = Array.isArray(value) ? value : [];
      if (items.length === 0) return 0.1;
      const validItems = items.filter(i => String(i?.description || i?.item_name || '').trim().length > 0);
      const ratio = validItems.length / Math.max(items.length, 1);
      const hasRates = items.some(i => toNumber(i?.rate || i?.unit_price || i?.cost_price, 0) > 0);
      const hasQty = items.some(i => toNumber(i?.quantity, 0) > 0);
      let score = ratio * 0.5;
      if (hasRates) score += 0.25;
      if (hasQty) score += 0.25;
      return Math.min(score, 1.0);
    }
    case 'vendor_gstin':
      if (/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z]{1}[A-Z\d]{1}$/i.test(str)) return 0.98;
      if (str.length >= 10) return 0.5;
      return 0.2;
    default:
      return str.length > 0 ? 0.6 : 0.1;
  }
}

function computeOverallConfidence(extracted) {
  const fields = ['vendor_name', 'bill_number', 'bill_date', 'total_amount', 'tax_amount', 'subtotal', 'category', 'items'];
  const scores = fields.map(f => calculateFieldConfidence(f, extracted[f] || extracted[mapFieldName(f)], extracted));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 100) / 100;
}

function mapFieldName(field) {
  const map = { total_amount: 'amount', tax_amount: 'tax', items: 'items' };
  return map[field] || field;
}

function buildExtractionLogEntry({ fieldName, value, confidence, ocrEngine, processingTimeMs, error }) {
  return {
    field_name: fieldName,
    extracted_value: value !== null && value !== undefined ? String(value) : null,
    confidence_score: Math.round(confidence * 100) / 100,
    ocr_engine: ocrEngine || 'gemini',
    processing_time_ms: processingTimeMs || 0,
    error_message: error || null
  };
}

async function logExtractionToDatabase({ billDocumentId, extractionType, fieldLogs, overallConfidence, processingTimeMs, error }) {
  try {
    if (!fieldLogs || fieldLogs.length === 0) return;
    for (const log of fieldLogs) {
      await pool.query(
        `INSERT INTO sarga_bill_extraction_logs 
         (bill_document_id, extraction_type, field_name, extracted_value, confidence_score, ocr_engine, processing_time_ms, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billDocumentId || null,
          extractionType || 'auto',
          log.field_name,
          log.extracted_value,
          log.confidence_score,
          log.ocr_engine || 'gemini',
          log.processing_time_ms || 0,
          log.error_message
        ]
      );
    }
    if (billDocumentId) {
      const extractionStatus = error ? 'failed' : (overallConfidence >= 0.7 ? 'completed' : 'completed');
      await pool.query(
        `UPDATE sarga_bills_documents 
         SET extraction_confidence = ?, extraction_status = ?, extraction_errors = ?
         WHERE id = ?`,
        [
          overallConfidence || 0,
          extractionStatus,
          error ? String(error).slice(0, 500) : null,
          billDocumentId
        ]
      );
    }
  } catch (dbError) {
    console.warn('[ExtractionLog] Failed to write extraction log:', dbError.message);
  }
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
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        vendorName || null, vendorName || null,
        billNumber || null, billNumber || null,
        amount ? Number(amount) : null, amount ? Number(amount) : null,
        branchId || 0
      ]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.warn('[DuplicateCheck] Error:', error.message);
    return null;
  }
}

function isQuotaOrRateLimitError(error) {
  const message = String(error?.message || '').toLowerCase();
  return /quota exceeded|rate limit|too many requests|429|free_tier|billing|resource_exhausted/.test(message);
}

function buildSuggestionsFromOcr(ocrData = {}) {
  const items = Array.isArray(ocrData.items) ? ocrData.items : [];
  const normalized = {
    vendor_name: String(ocrData.vendor_name || ''),
    vendor_contact: ocrData.vendor_contact ? String(ocrData.vendor_contact) : null,
    bill_number: ocrData.bill_number ? String(ocrData.bill_number) : null,
    bill_date: ocrData.bill_date ? String(ocrData.bill_date) : null,
    total_amount: toNumber(ocrData.total_amount, 0),
    tax_amount: 0,
    subtotal: 0,
    category: ocrData.category || null,
    line_items: items.map((line) => {
      const qty = toNumber(line?.quantity, 0);
      const costPrice = toNumber(line?.cost_price || line?.unit_price, 0);
      const gstPct = toNumber(line?.gst_rate || line?.gst_percent, 0);
      const taxable = qty * costPrice;
      const gstAmt = gstPct > 0 ? taxable * gstPct / 100 : 0;
      const rawAmount = toNumber(line?.amount, 0);
      const totalAmount = rawAmount > 0 ? rawAmount : (gstAmt > 0 ? taxable + gstAmt : taxable);
      // MRP: prefer bill-stated mrp, fallback to cost+gst per unit
      const billMrp = toNumber(line?.mrp, 0);
      const computedMrp = costPrice > 0 ? costPrice * (1 + gstPct / 100) : 0;
      const mrp = billMrp > 0 ? billMrp : computedMrp;
      return {
        serial_no: toNumber(line?.serial_no, 0) || '',
        description: String(line?.name || line?.description || ''),
        hsn_sac: String(line?.hsn || line?.hsn_sac || ''),
        quantity: qty,
        unit_price: costPrice,
        rate: costPrice,
        gst_percent: gstPct,
        mrp,
        amount: rawAmount,
        total_amount: totalAmount
      };
    }),
    confidence: 0.45
  };

  normalized.subtotal = normalized.line_items.reduce((sum, i) => sum + toNumber(i.amount, 0), 0);
  if (!normalized.total_amount || normalized.total_amount <= 0) {
    normalized.total_amount = normalized.subtotal;
  }

  return {
    extracted_data: {
      amount: normalized.total_amount,
      bill_number: normalized.bill_number,
      bill_date: normalized.bill_date,
      vendor_name: normalized.vendor_name,
      vendor_contact: normalized.vendor_contact || null,
      category: normalized.category || null,
      tax: normalized.tax_amount,
      subtotal: normalized.subtotal,
      items: normalized.line_items,
      detected_type: 'Invoice'
    },
    category_suggestions: suggestCategories(normalized),
    inventory_suggestions: suggestInventory(normalized),
    confidence: normalized.confidence,
    raw_text: String(ocrData.raw_text || '')
  };
}

async function extractWithGemini(filePath) {
  const { apiKey } = getGeminiClient();

  const imageData = fs.readFileSync(filePath);
  const base64Data = imageData.toString('base64');
  const mimeType = getMimeType(filePath);

  const prompt = `
You are a bill/invoice parser for an Indian print/stationery shop.
Extract ALL data from this bill image and return ONLY valid JSON, no extra text:
{
  "vendor_name": "string",
  "vendor_contact": "string or null",
  "bill_number": "string or null",
  "bill_date": "YYYY-MM-DD or null",
  "total_amount": number or 0,
  "tax_amount": number or 0,
  "subtotal": number or 0,
  "category": "one of: Vendor, Utility, Rent, Transport, Office & Admin, Miscellaneous or null",
  "line_items": [
    {
      "serial_no": number,
      "description": "item name string",
      "hsn_sac": "HSN or SAC code string or empty",
      "quantity": number,
      "unit_price": number,
      "gst_percent": number or 0,
      "mrp": number or 0,
      "amount": number
    }
  ],
  "confidence": number between 0 and 1
}

Rules:
- All amounts in INR numbers only, no symbols
- unit_price is the per-unit price BEFORE GST/tax (the cost/rate column)
- mrp is the Maximum Retail Price printed on item label, or the per-unit selling price if shown; if not shown compute as unit_price * (1 + gst_percent/100)
- amount is the line total AFTER adding GST (unit_price * quantity + GST)
- gst_percent is the GST rate (e.g. 18 for 18%), use 0 if not shown
- hsn_sac is the HSN code or SAC code for the item, extract if present
- vendor_contact is phone/mobile number of vendor if visible
- category: guess the expense category from the bill content
- Dates in YYYY-MM-DD format
- serial_no is the row/item number in the bill table
- If a field is not found, use null or 0
- Return ONLY the JSON, nothing else
`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          }
        ]
      }
    ]
  };

  const models = getModelCandidates();
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload?.error?.message || `${response.status} ${response.statusText}`;
        throw new Error(detail);
      }

      const responseText = payload?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
      if (!responseText.trim()) {
        throw new Error('Gemini returned an empty response');
      }

      const cleaned = extractJson(responseText);
      return JSON.parse(cleaned);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '');
      const modelUnavailable = /not found|not supported|unsupported|404/i.test(message);
      if (modelUnavailable) {
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('No compatible Gemini model found for generateContent');
}

function suggestCategories(extracted) {
  const suggestions = [];
  const vendorLower = String(extracted?.vendor_name || '').toLowerCase();
  const items = Array.isArray(extracted?.line_items) ? extracted.line_items : [];
  const allText = `${vendorLower} ${items.map((i) => i?.description || '').join(' ').toLowerCase()}`;

  if (/paper|ink|toner|stationery|print/.test(allText)) {
    suggestions.push({ type: 'Vendor', related_tab: 'vendors', score: 0.95 });
  }
  if (/electricity|power|eb\s|current bill|water|gas/.test(allText)) {
    suggestions.push({ type: 'Utility', related_tab: 'utilities', score: 0.95 });
  }
  if (/rent|lease|property/.test(allText)) {
    suggestions.push({ type: 'Rent', related_tab: 'rent', score: 0.9 });
  }
  if (/transport|delivery|shipping|courier|logistics/.test(allText)) {
    suggestions.push({ type: 'Transport', related_tab: 'other', score: 0.85 });
  }
  if (suggestions.length === 0) {
    suggestions.push({ type: 'Other', related_tab: 'other', score: 0.6 });
  }

  return suggestions;
}

function suggestInventory(extracted) {
  const suggestions = [];
  const items = Array.isArray(extracted?.line_items) ? extracted.line_items : [];

  items.forEach((item) => {
    const description = String(item?.description || '').trim();
    if (!description) return;

    const desc = description.toLowerCase();
    if (/paper|sheet|gsm/.test(desc)) {
      suggestions.push({ name: description, category: 'Paper & Stationery', unit: 'Pack', confidence: 0.9 });
    } else if (/ink|toner|cartridge/.test(desc)) {
      suggestions.push({ name: description, category: 'Consumables', unit: 'Piece', confidence: 0.9 });
    } else if (/label|sticker/.test(desc)) {
      suggestions.push({ name: description, category: 'Labels', unit: 'Roll', confidence: 0.85 });
    }
  });

  return suggestions;
}

async function processBillDocument(filePath, options = {}) {
  const startTime = Date.now();
  const extractionLogs = [];
  let ocrEngine = 'gemini';
  let overallConfidence = 0;
  let extracted = null;

  try {
    console.log('[Gemini] Processing bill:', filePath);

    try {
      extracted = await extractWithGemini(filePath);
      ocrEngine = 'gemini';
    } catch (geminiError) {
      if (!isQuotaOrRateLimitError(geminiError) && !options.forceFallback) {
        throw geminiError;
      }

      console.warn('[Gemini] Quota/rate limit reached. Falling back to PaddleOCR.');
      ocrEngine = 'paddleocr';
      try {
        const paddleResult = await extractWithPaddleOCRWithRetry(filePath);
        const mimeType = getMimeType(filePath);
        const ocrData = { ...await extractBillData(filePath, mimeType), raw_text: paddleResult.text };
        const fallbackSuggestions = buildSuggestionsFromOcr(ocrData);

        extractionLogs.push(buildExtractionLogEntry({
          fieldName: 'raw_text', value: paddleResult.text ? paddleResult.text.slice(0, 500) : null,
          confidence: paddleResult.confidence || 0.7, ocrEngine: 'paddleocr', processingTimeMs: Date.now() - startTime
        }));

        overallConfidence = computeOverallConfidence(fallbackSuggestions.extracted_data);
        fallbackSuggestions.confidence = overallConfidence;
        fallbackSuggestions.extraction_logs = extractionLogs;

        if (options.billDocumentId) {
          await logExtractionToDatabase({
            billDocumentId: options.billDocumentId,
            extractionType: 'auto_fallback',
            fieldLogs: extractionLogs,
            overallConfidence,
            processingTimeMs: Date.now() - startTime
          });
        }

        return { success: true, suggestions: fallbackSuggestions, ocr_engine: 'paddleocr', extraction_logs: extractionLogs };
      } catch (_paddleError) {
        console.warn('[PaddleOCR] Failed. Falling back to Tesseract OCR.');
        ocrEngine = 'tesseract';
        const mimeType = getMimeType(filePath);
        const ocrData = await extractBillData(filePath, mimeType);
        const fallbackSuggestions = buildSuggestionsFromOcr(ocrData);

        overallConfidence = computeOverallConfidence(fallbackSuggestions.extracted_data);
        fallbackSuggestions.confidence = overallConfidence;

        return { success: true, suggestions: fallbackSuggestions, ocr_engine: 'tesseract', extraction_logs: extractionLogs };
      }
    }

    const normalized = {
      vendor_name: String(extracted?.vendor_name || ''),
      vendor_contact: extracted?.vendor_contact ? String(extracted.vendor_contact) : null,
      bill_number: extracted?.bill_number || null,
      bill_date: extracted?.bill_date || null,
      total_amount: toNumber(extracted?.total_amount, 0),
      tax_amount: toNumber(extracted?.tax_amount, 0),
      subtotal: toNumber(extracted?.subtotal, 0),
      category: extracted?.category || null,
      line_items: Array.isArray(extracted?.line_items) ? extracted.line_items.map((line) => {
        const qty = toNumber(line?.quantity, 0);
        const unitPrice = toNumber(line?.unit_price, 0);
        const gstPct = toNumber(line?.gst_percent, 0);
        const taxable = qty * unitPrice;
        const gstAmt = gstPct > 0 ? taxable * gstPct / 100 : 0;
        const lineAmount = toNumber(line?.amount, 0);
        const totalAmount = lineAmount > taxable + 0.01 ? lineAmount : (gstAmt > 0 ? taxable + gstAmt : lineAmount || taxable);
        const billMrp = toNumber(line?.mrp, 0);
        const computedMrp = unitPrice > 0 ? unitPrice * (1 + gstPct / 100) : 0;
        const mrp = billMrp > 0 ? billMrp : computedMrp;
        return {
          serial_no: line?.serial_no || '',
          description: String(line?.description || ''),
          hsn_sac: String(line?.hsn_sac || line?.hsn || ''),
          quantity: qty,
          unit_price: unitPrice,
          rate: unitPrice,
          gst_percent: gstPct,
          mrp,
          amount: lineAmount,
          total_amount: totalAmount
        };
      }) : [],
      confidence: Math.max(0, Math.min(1, toNumber(extracted?.confidence, 0.9)))
    };

    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'vendor_name', value: normalized.vendor_name,
      confidence: calculateFieldConfidence('vendor_name', normalized.vendor_name),
      ocrEngine, processingTimeMs: Date.now() - startTime
    }));
    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'bill_number', value: normalized.bill_number,
      confidence: calculateFieldConfidence('bill_number', normalized.bill_number),
      ocrEngine, processingTimeMs: Date.now() - startTime
    }));
    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'bill_date', value: normalized.bill_date,
      confidence: calculateFieldConfidence('bill_date', normalized.bill_date),
      ocrEngine, processingTimeMs: Date.now() - startTime
    }));
    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'total_amount', value: normalized.total_amount,
      confidence: calculateFieldConfidence('total_amount', normalized.total_amount),
      ocrEngine, processingTimeMs: Date.now() - startTime
    }));
    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'tax_amount', value: normalized.tax_amount,
      confidence: calculateFieldConfidence('tax_amount', normalized.tax_amount),
      ocrEngine, processingTimeMs: Date.now() - startTime
    }));
    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'subtotal', value: normalized.subtotal,
      confidence: calculateFieldConfidence('subtotal', normalized.subtotal),
      ocrEngine, processingTimeMs: Date.now() - startTime
    }));
    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'category', value: normalized.category,
      confidence: calculateFieldConfidence('category', normalized.category),
      ocrEngine, processingTimeMs: Date.now() - startTime
    }));
    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'items', value: normalized.line_items,
      confidence: calculateFieldConfidence('items', normalized.line_items),
      ocrEngine, processingTimeMs: Date.now() - startTime
    }));

    overallConfidence = computeOverallConfidence({
      ...normalized,
      total_amount: normalized.total_amount,
      tax_amount: normalized.tax_amount,
      items: normalized.line_items
    });

    const suggestions = {
      extracted_data: {
        amount: normalized.total_amount,
        bill_number: normalized.bill_number,
        bill_date: normalized.bill_date,
        vendor_name: normalized.vendor_name,
        vendor_contact: normalized.vendor_contact || null,
        category: normalized.category || null,
        tax: normalized.tax_amount,
        subtotal: normalized.subtotal,
        items: normalized.line_items,
        detected_type: 'Invoice'
      },
      category_suggestions: suggestCategories(normalized),
      inventory_suggestions: suggestInventory(normalized),
      confidence: overallConfidence,
      confidence_scores: {
        vendor_name: calculateFieldConfidence('vendor_name', normalized.vendor_name),
        bill_number: calculateFieldConfidence('bill_number', normalized.bill_number),
        bill_date: calculateFieldConfidence('bill_date', normalized.bill_date),
        total_amount: calculateFieldConfidence('total_amount', normalized.total_amount),
        tax_amount: calculateFieldConfidence('tax_amount', normalized.tax_amount),
        subtotal: calculateFieldConfidence('subtotal', normalized.subtotal),
        category: calculateFieldConfidence('category', normalized.category),
        items: calculateFieldConfidence('items', normalized.line_items)
      },
      extraction_logs: extractionLogs,
      ocr_engine: ocrEngine,
      raw_text: JSON.stringify(normalized)
    };

    if (options.billDocumentId) {
      await logExtractionToDatabase({
        billDocumentId: options.billDocumentId,
        extractionType: 'auto',
        fieldLogs: extractionLogs,
        overallConfidence,
        processingTimeMs: Date.now() - startTime
      });
    }

    console.log(`[Gemini] Extraction successful, confidence: ${overallConfidence}, engine: ${ocrEngine}`);
    return { success: true, suggestions, ocr_engine: ocrEngine, extraction_logs: extractionLogs };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    console.error('[Gemini] Extraction failed:', error.message);

    extractionLogs.push(buildExtractionLogEntry({
      fieldName: 'error', value: null,
      confidence: 0, ocrEngine, processingTimeMs,
      error: error.message
    }));

    if (options.billDocumentId) {
      await logExtractionToDatabase({
        billDocumentId: options.billDocumentId,
        extractionType: 'auto',
        fieldLogs: extractionLogs,
        overallConfidence: 0,
        processingTimeMs,
        error: error.message
      });
    }

    return {
      success: false,
      message: `Could not extract bill details: ${error.message}`,
      error: error.message,
      extraction_logs: extractionLogs
    };
  }
}

module.exports = {
  processBillDocument,
  calculateFieldConfidence,
  computeOverallConfidence,
  buildExtractionLogEntry,
  logExtractionToDatabase,
  checkDuplicateBill
};

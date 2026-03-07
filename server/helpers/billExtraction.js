const Tesseract = require('tesseract.js');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const sharp = require('sharp');

/**
 * Extract text from various bill/document formats
 * Supports: PNG, JPG, PDF (multi-page)
 */
async function extractTextFromDocument(filePath) {
  try {
    const ext = filePath.toLowerCase().split('.').pop();
    console.log('[Extraction] File type detected:', ext);

    if (ext === 'pdf') {
      console.log('[Extraction] Processing as PDF (all pages)');
      return await extractTextFromPdf(filePath);
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      console.log('[Extraction] Processing as Image with OCR');
      const result = await extractTextFromImage(filePath);
      if (!result.text && result.error) {
        console.log('[Extraction] OCR failed, error:', result.error);
        return result;
      }
      return result;
    } else {
      return { text: '', confidence: 0, error: 'Unsupported file format: ' + ext };
    }
  } catch (error) {
    console.error('Error extracting text:', error.message);
    return { text: '', confidence: 0, error: error.message };
  }
}

/**
 * Extract text from ALL pages of a PDF
 */
async function extractTextFromPdf(filePath) {
  try {
    const pdfBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    // getText() extracts all pages by default
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text || '';
    console.log('[PDF] Extracted text length:', text.length);
    return { text, confidence: 0.85, source: 'pdf' };
  } catch (error) {
    console.error('PDF extraction error:', error.message);
    throw error;
  }
}

/**
 * Extract text from image using Tesseract OCR
 * Preprocesses image with sharp for better OCR accuracy
 */
async function extractTextFromImage(filePath) {
  let worker;
  let preprocessedPath;
  try {
    console.log('[Tesseract] Preprocessing image with sharp...');
    preprocessedPath = filePath.replace(/\.\w+$/, '_ocr.png');

    // Check image dimensions first
    const meta = await sharp(filePath).metadata();
    console.log('[Tesseract] Original image:', meta.width, 'x', meta.height, meta.format);

    // Build preprocessing pipeline
    let pipeline = sharp(filePath).grayscale().normalize();

    // Upscale small images aggressively for OCR (need ~300 DPI equivalent)
    const minWidth = 2400;
    if (meta.width < minWidth) {
      const scale = Math.ceil(minWidth / meta.width);
      console.log('[Tesseract] Upscaling', scale, 'x for OCR');
      pipeline = pipeline.resize({
        width: meta.width * scale,
        height: meta.height * scale,
        kernel: sharp.kernel.lanczos3
      });
    }

    pipeline = pipeline.sharpen({ sigma: 1.2 }).png();
    await pipeline.toFile(preprocessedPath);
    console.log('[Tesseract] Preprocessed image saved');

    console.log('[Tesseract] Initializing worker...');
    worker = await Promise.race([
      Tesseract.createWorker(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Worker initialization timeout')), 30000)
      )
    ]);

    console.log('[Tesseract] Worker initialized, starting recognition...');
    const normalizedPath = preprocessedPath.replace(/\\/g, '/');

    const result = await Promise.race([
      worker.recognize(normalizedPath),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OCR recognition timeout')), 120000)
      )
    ]);

    let text = result.data?.text || '';
    let confidence = Math.min((result.data?.confidence || 0) / 100, 1);
    console.log('[Tesseract] Recognition complete, text length:', text.length, 'confidence:', confidence);

    // If preprocessed image gave poor results, try original at different threshold
    if (confidence < 0.5 && text.length < 100) {
      console.log('[Tesseract] Low confidence, trying with threshold binarization...');
      const altPath = filePath.replace(/\.\w+$/, '_ocr_alt.png');
      const altScale = Math.ceil(2800 / Math.max(meta.width, 1));
      await sharp(filePath)
        .grayscale()
        .resize({ width: meta.width * Math.max(altScale, 3), height: meta.height * Math.max(altScale, 3), kernel: sharp.kernel.lanczos3 })
        .normalize()
        .threshold(128)
        .sharpen({ sigma: 2 })
        .png()
        .toFile(altPath);

      const result2 = await Promise.race([
        worker.recognize(altPath.replace(/\\/g, '/')),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR recognition timeout')), 120000)
        )
      ]);
      const text2 = result2.data?.text || '';
      const conf2 = Math.min((result2.data?.confidence || 0) / 100, 1);
      console.log('[Tesseract] Alt result:', text2.length, 'chars, conf:', conf2);

      if (text2.length > text.length || conf2 > confidence) {
        text = text2;
        confidence = conf2;
      }
      try { fs.unlinkSync(altPath); } catch (err) { /* ignore */ }
    }

    // If still poor, try original image directly
    if (confidence < 0.4 && text.length < 80) {
      console.log('[Tesseract] Still low, trying original image directly...');
      const origPath = filePath.replace(/\\/g, '/');
      const result3 = await Promise.race([
        worker.recognize(origPath),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR recognition timeout')), 120000)
        )
      ]);
      const text3 = result3.data?.text || '';
      const conf3 = Math.min((result3.data?.confidence || 0) / 100, 1);
      if (text3.length > text.length || conf3 > confidence) {
        text = text3;
        confidence = conf3;
      }
    }

    return { text, confidence, source: 'ocr' };
  } catch (error) {
    console.error('OCR extraction error:', error.message);
    return { text: '', confidence: 0, error: error.message, source: 'ocr' };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch (err) { /* ignore */ }
    }
    if (preprocessedPath) {
      try { fs.unlinkSync(preprocessedPath); } catch (err) { /* ignore */ }
    }
  }
}

// ===================== INTELLIGENT PARSING =====================

/**
 * Parse extracted text to extract structured bill data.
 * Improved logic for Indian GST bills, multi-page PDFs, etc.
 */
function parseExtractedText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const lowerText = rawText.toLowerCase();

  const result = {
    amount: null,
    bill_number: null,
    bill_date: null,
    vendor_name: null,
    tax: null,
    items: [],
    keywords: [],
    detected_type: 'Invoice'
  };

  // --- 1) DETECT DOCUMENT TYPE ---
  result.detected_type = detectDocumentType(lowerText);

  // --- 2) EXTRACT BILL DATE (NOT today's date) ---
  result.bill_date = extractBillDate(rawText, lines);

  // --- 3) EXTRACT BILL NUMBER ---
  result.bill_number = extractBillNumber(rawText, lines);

  // --- 4) EXTRACT VENDOR NAME ---
  result.vendor_name = extractVendorName(rawText, lines);

  // --- 5) EXTRACT AMOUNTS ---
  const amounts = extractAmounts(rawText, lines);
  result.amount = amounts.total;
  result.tax = amounts.tax;

  // --- 6) EXTRACT GST RATES (HSN -> %) + LINE ITEMS ---
  const gstRatesByHsn = extractGstRatesByHsn(rawText, lines);
  result.items = extractLineItems(rawText, lines, gstRatesByHsn);

  // --- 7) EXTRACT KEYWORDS for category matching ---
  result.keywords = extractProductKeywords(lowerText);

  return result;
}

/**
 * Detect document type from text content
 */
function detectDocumentType(lowerText) {
  if (lowerText.includes('tax invoice') || lowerText.includes('gst invoice')) return 'Tax Invoice';
  if (lowerText.includes('proforma') || lowerText.includes('pro forma')) return 'Proforma Invoice';
  if (lowerText.includes('credit note')) return 'Credit Note';
  if (lowerText.includes('debit note')) return 'Debit Note';
  if (lowerText.includes('delivery note') || lowerText.includes('delivery challan')) return 'Delivery Note';
  if (lowerText.includes('quotation') || lowerText.includes('estimate')) return 'Quotation';
  if (lowerText.includes('purchase order') || lowerText.includes('sales order')) return 'Sales Order';
  if (lowerText.includes('receipt') || lowerText.includes('payment receipt')) return 'Receipt';
  if (lowerText.includes('invoice')) return 'Invoice';
  if (lowerText.includes('bill')) return 'Bill';
  return 'Invoice';
}

/**
 * Extract bill date from text. Looks for labeled dates first.
 * Does NOT fall back to today's date.
 */
function extractBillDate(rawText, lines) {
  // 1) Look for explicitly labeled dates first (highest priority)
  const labeledDatePatterns = [
    /(?:invoice\s*date|bill\s*date|date\s*of\s*invoice|dated|dt)\s*(?::|\-|\.|\b)?\s*(\d{1,2}[\s]*[\/\-\.][\s]*\d{1,2}[\s]*[\/\-\.][\s]*\d{2,4})/gi,
    /(?:invoice\s*date|bill\s*date|date\s*of\s*invoice|dated|dt)\s*(?::|\-|\.|\b)?\s*(\d{1,2}[\s\-\/\.]*?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/\.,]*\d{2,4})/gi,
    /(?:date)\s*(?::|\-|\.|\b)?\s*(\d{1,2}[\s]*[\/\-\.][\s]*\d{1,2}[\s]*[\/\-\.][\s]*\d{2,4})/gi,
    /(?:date)\s*(?::|\-|\.|\b)?\s*(\d{1,2}[\s\-\/\.]*?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/\.,]*\d{2,4})/gi,
  ];

  for (const pattern of labeledDatePatterns) {
    const match = pattern.exec(rawText);
    if (match) {
      const normalized = normalizeDateString(match[1].replace(/\s+/g, ''));
      if (normalized) return normalized;
    }
  }

  // 2) Search line-by-line for lines with date label
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if ((lower.includes('date') || lower.includes('dated')) && !lower.includes('due date') && !lower.includes('delivery date')) {
      const dateInLine = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/.exec(line);
      if (dateInLine) {
        const normalized = normalizeDateString(dateInLine[1]);
        if (normalized) return normalized;
      }
      const dateInLine2 = /(\d{1,2}[\s\-\/\.]*?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/\.,]*\d{2,4})/i.exec(line);
      if (dateInLine2) {
        const normalized = normalizeDateString(dateInLine2[1]);
        if (normalized) return normalized;
      }

      // Sometimes label and value are split across columns/next line
      const nextLine = lines[i + 1] || '';
      const nextDate = /(\d{1,2}[\s\-\/\.]*?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/\.,]*\d{2,4}|\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i.exec(nextLine);
      if (nextDate) {
        const normalized = normalizeDateString(nextDate[1]);
        if (normalized) return normalized;
      }
    }
  }

  // 3) Look for any date in the first 15 lines (header area)
  const headerLines = lines.slice(0, 15);
  for (const line of headerLines) {
    const dateInLine = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/.exec(line);
    if (dateInLine) {
      const normalized = normalizeDateString(dateInLine[1]);
      if (normalized) return normalized;
    }
    const monthDateInLine = /(\d{1,2}[\s\-\/\.]*?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/\.,]*\d{2,4})/i.exec(line);
    if (monthDateInLine) {
      const normalized = normalizeDateString(monthDateInLine[1]);
      if (normalized) return normalized;
    }
  }

  // DO NOT fall back to today's date
  return null;
}

/**
 * Extract bill/invoice number
 */
function extractBillNumber(rawText, lines) {
  const isValidBillNo = (value) => {
    if (!value) return false;
    const candidate = value.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (candidate.length < 2 || candidate.length > 25) return false;
    if (!/\d/.test(candidate)) return false;
    if (/^(to|of|no|nos|payment|terms|mode|dated|date|buyer|seller|ship|consignee)$/i.test(candidate)) return false;
    if (/^(GSTIN|PAN|TIN|CIN|FSSAI|HSN|SAC)$/i.test(candidate)) return false;
    return true;
  };

  const extractTokenAfterLabel = (line) => {
    const afterLabel = line
      .replace(/.*?(voucher\s*no\.?|invoice\s*(?:no|number)?\.?|bill\s*(?:no|number)?\.?|order\s*(?:no|number)?\.?|ref\s*(?:no|number)?\.?)/i, '')
      .replace(/^\s*[:\-\.#]?\s*/, '');
    const tokenMatch = afterLabel.match(/([A-Za-z0-9][A-Za-z0-9\-\/\.]{1,24})/);
    return tokenMatch ? tokenMatch[1] : null;
  };

  const labelPattern = /(voucher\s*no\.?|invoice\s*(?:no|number)?\.?|bill\s*(?:no|number)?\.?|order\s*(?:no|number)?\.?|ref\s*(?:no|number)?\.?)/i;

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i] || '';
    if (!labelPattern.test(line)) continue;

    const sameLineToken = extractTokenAfterLabel(line);
    if (isValidBillNo(sameLineToken)) return sameLineToken;

    // Next lines may have multiple tab/space-separated values (e.g., "521    24-Jan-26")
    // Split and check each token individually before checking the whole line
    const next1 = (lines[i + 1] || '').trim();
    const next2 = (lines[i + 2] || '').trim();
    const next1Parts = next1.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
    for (const part of next1Parts) {
      if (isValidBillNo(part)) return part;
    }
    const next2Parts = next2.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
    for (const part of next2Parts) {
      if (isValidBillNo(part)) return part;
    }
  }

  const fallbackPatterns = [
    /(?:invoice\s*(?:no|number|#|num)?|bill\s*(?:no|number|#|num)?|ref\s*(?:no|number)?|voucher\s*(?:no|number)?)\s*[:\-\.#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,25})/gi,
  ];

  for (const pattern of fallbackPatterns) {
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
      if (isValidBillNo(match[1])) return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract vendor/company name — skip generic prefixes like "Sales Order"
 */
function extractVendorName(rawText, lines) {
  const skipPrefixes = [
    'sales order', 'purchase order', 'tax invoice', 'invoice', 'proforma',
    'bill', 'receipt', 'quotation', 'estimate', 'credit note', 'debit note',
    'delivery note', 'delivery challan', 'to', 'from', 'ship to', 'bill to',
    'sold to', 'buyer', 'seller', 'consignee'
  ];

  // 1) Look for explicitly labeled vendor/company
  const vendorLabelPatterns = [
    /(?:vendor|supplier|company|firm|from|seller|billed?\s*by)\s*[:\-]\s*(.+)/gi,
    /(?:m\/s|ms|messrs)\.?\s+(.+)/gi,
  ];

  for (const pattern of vendorLabelPatterns) {
    const match = pattern.exec(rawText);
    if (match) {
      let name = match[1].trim().split('\n')[0].trim();
      name = cleanVendorName(name, skipPrefixes);
      if (isLikelyVendorName(name)) return name;
    }
  }

  // 2) Use first few non-trivial lines (usually company header)
  const headerCandidates = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    const lower = line.toLowerCase().trim();

    // Skip document type headers, dates, phone numbers, GSTIN, addresses
    if (skipPrefixes.some(p => lower.startsWith(p))) continue;
    if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]/.test(line)) continue;
    if (/^(gstin|gst\s*no|pan|tin|cin|fssai|phone|mob|tel|email|address|pin)/i.test(line)) continue;
    if (/^[\d\s\-\+\(\)]{7,}$/.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (line.length < 3) continue;

    if (/[A-Za-z]{2,}/.test(line)) {
      // PDF extraction may merge table columns into one line (e.g. "PAMCO ... Voucher No. Dated ...")
      const segments = line.split(/\t+|\s{2,}/).map(s => s.trim()).filter(Boolean);
      const primary = segments.length > 0 ? segments[0] : line;
      const sanitized = primary
        .replace(/\b(voucher\s*no\.?|dated|buyer'?s\s*ref.*|other\s*references|mode\/terms\s*of\s*payment|destination|terms\s*of\s*delivery)\b.*$/i, '')
        .trim();

      if (isLikelyVendorName(sanitized)) {
        headerCandidates.push(sanitized);
      }
    }
  }

  if (headerCandidates.length > 0) {
    let name = cleanVendorName(headerCandidates[0], skipPrefixes);
    if (isLikelyVendorName(name)) return name;
    if (headerCandidates.length > 1) {
      name = cleanVendorName(headerCandidates[1], skipPrefixes);
      if (isLikelyVendorName(name)) return name;
    }
  }

  // Fallback: first strong company-like line from header region
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const candidate = cleanVendorName(lines[i], skipPrefixes);
    if (isLikelyVendorName(candidate)) return candidate;
  }

  return null;
}

function isLikelyVendorName(name) {
  if (!name) return false;
  const value = String(name).trim();
  if (value.length < 3 || value.length > 120) return false;
  if (!/[A-Za-z]{2,}/.test(value)) return false;
  if (/^[\d\W_]+$/.test(value)) return false;

  const lower = value.toLowerCase();
  if (/^(to|from|of|payment|mode|terms|dated|voucher|no|buyer|consignee|destination)$/i.test(value)) return false;
  if (/(mode\/terms|terms of payment|other references|terms of delivery|destination|buyer'?s ref|consignee|bill to|ship to|of payment)/i.test(lower)) return false;
  if (/^(sl|description|hsn|sac|qty|quantity|rate|amount|disc)/i.test(lower)) return false;
  if (/^(gstin|gst no|pan|cin|fssai|phone|mob|tel|email|address|pin)/i.test(lower)) return false;
  return true;
}

/**
 * Clean vendor name — remove known prefix labels
 */
function cleanVendorName(name, skipPrefixes) {
  if (!name) return null;
  let cleaned = name.trim();

  // Remove leading skip prefixes (case-insensitive)
  for (const prefix of skipPrefixes) {
    const regex = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s:\\-]*', 'i');
    cleaned = cleaned.replace(regex, '').trim();
  }

  // Remove trailing tab/whitespace content after the first meaningful word group
  cleaned = cleaned.split('\t')[0].trim();

  // Remove trailing transactional labels that are often merged into company row
  cleaned = cleaned.replace(/\b(voucher\s*no\.?|dated|buyer'?s\s*ref.*|other\s*references|mode\/terms\s*of\s*payment|destination|terms\s*of\s*delivery)\b.*$/i, '').trim();

  // Remove trailing punctuation
  cleaned = cleaned.replace(/[\s:\-,]+$/, '').trim();

  // Remove year suffixes like "- (2025-2026_"
  cleaned = cleaned.replace(/\s*[\-\(]\s*\(?\d{4}[\-\/]\d{2,4}\)?\s*_?\s*$/, '').trim();
  cleaned = cleaned.replace(/\s*\(\d{4}[\-\/]\d{2,4}_?\)\s*$/, '').trim();

  return cleaned || null;
}

/**
 * Extract amounts — looks for grand total, net total, subtotal, tax amounts
 */
function extractAmounts(rawText, lines) {
  const result = { total: null, subtotal: null, tax: null };

  // 1) Look for labeled grand total / net amount (highest priority)
  const grandTotalPatterns = [
    /(?:grand\s*total|net\s*(?:total|amount|payable)|total\s*(?:amount|payable|due)|amount\s*payable|balance\s*due|bill\s*amount)\s*[:\-₹Rs\.]*\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
    /(?:total)\s*[:\-₹Rs\.]*\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
  ];

  for (const pattern of grandTotalPatterns) {
    let match;
    const allMatches = [];
    while ((match = pattern.exec(rawText)) !== null) {
      const amt = parseAmount(match[1]);
      if (amt > 0) allMatches.push(amt);
    }
    // Take the LAST match for "total" (grand total is usually at bottom)
    if (allMatches.length > 0) {
      result.total = allMatches[allMatches.length - 1];
      break;
    }
  }

  // 2) Look for subtotal
  const subtotalPatterns = [
    /(?:sub\s*total|taxable\s*(?:value|amount))\s*[:\-₹Rs\.]*\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
  ];
  for (const pattern of subtotalPatterns) {
    const match = pattern.exec(rawText);
    if (match) {
      const amt = parseAmount(match[1]);
      if (amt > 0) result.subtotal = amt;
      break;
    }
  }

  // 3) Look for tax
  const taxPatterns = [
    /(?:cgst|sgst|igst|gst|tax)\s*(?:@\s*\d+%?)?\s*[:\-₹Rs\.]*\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
  ];
  let totalTax = 0;
  for (const pattern of taxPatterns) {
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
      const amt = parseAmount(match[1]);
      if (amt > 0 && amt < 500000) totalTax += amt;
    }
  }
  if (totalTax > 0) result.tax = totalTax;

  // 4) If no labeled total found, use largest number in the document
  if (!result.total) {
    const amountRegex = /[₹]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/g;
    let maxAmount = 0;
    let match;
    while ((match = amountRegex.exec(rawText)) !== null) {
      const amt = parseAmount(match[1]);
      if (amt > maxAmount && amt < 10000000) maxAmount = amt;
    }
    if (maxAmount > 0) result.total = maxAmount;
  }

  return result;
}

/**
 * Parse an amount string like "1,23,456.78" or "98469" into a number
 */
function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Extract GST percentage mapping by HSN/SAC from bill text.
 * Handles common summary formats from last pages, e.g.:
 * "442190 ... CGST 9% ... SGST 9%" => 18%
 */
function extractGstRatesByHsn(rawText, lines) {
  const map = {};
  const likelyRates = [0.25, 3, 5, 12, 18, 28];
  const isLikelyGstRate = (rate) => likelyRates.some(v => Math.abs(v - rate) < 0.01);
  const addRate = (hsn, rate) => {
    if (!hsn || !Number.isFinite(rate) || rate <= 0 || rate > 60) return;
    if (!isLikelyGstRate(rate)) return;
    if (!map[hsn] || rate > map[hsn]) map[hsn] = rate;
  };

  const hsnRegex = /\b(\d{4,8})\b/g;
  const percentRegex = /(\d{1,2}(?:\.\d+)?)\s*%/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lower = line.toLowerCase();

    const hsns = [...line.matchAll(hsnRegex)].map(m => m[1]);
    if (hsns.length === 0) continue;

    // Context window helps for split table rows / multi-line summaries
    const context = [lines[i - 1] || '', line, lines[i + 1] || ''].join(' ');
    const contextLower = context.toLowerCase();

    // Pattern 1: explicit GST/IGST rates near HSN
    if (/(gst|cgst|sgst|igst)/i.test(contextLower)) {
      for (const hsn of hsns) {
        const igstMatch = context.match(/igst\s*@?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
        if (igstMatch) {
          addRate(hsn, parseFloat(igstMatch[1]));
          continue;
        }

        const cgstMatches = [...context.matchAll(/cgst\s*@?\s*(\d{1,2}(?:\.\d+)?)\s*%/ig)].map(m => parseFloat(m[1]));
        const sgstMatches = [...context.matchAll(/sgst\s*@?\s*(\d{1,2}(?:\.\d+)?)\s*%/ig)].map(m => parseFloat(m[1]));
        if (cgstMatches.length > 0 || sgstMatches.length > 0) {
          const cgst = cgstMatches[0] || 0;
          const sgst = sgstMatches[0] || 0;
          addRate(hsn, cgst + sgst);
          continue;
        }

        const gstMatch = context.match(/(?:gst|tax)\s*@?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
        if (gstMatch) {
          addRate(hsn, parseFloat(gstMatch[1]));
          continue;
        }
      }
    }

    // Pattern 2: HSN line with two percentages (often CGST+SGST in summary tables)
    const percentages = [...context.matchAll(percentRegex)].map(m => parseFloat(m[1])).filter(v => Number.isFinite(v));
    const hasTaxWords = /(cgst|sgst|igst|\bgst\b|tax)/i.test(contextLower);
    const hasHsnHeader = /(hsn|sac)/i.test(contextLower);
    const hasDiscountWords = /(disc\.?|discount)/i.test(contextLower);

    if (percentages.length >= 2 && hasHsnHeader && (hasTaxWords || /cgst|sgst|igst/i.test(contextLower)) && !hasDiscountWords) {
      const inferred = percentages[0] + percentages[1];
      if (inferred > 0 && inferred <= 60) {
        for (const hsn of hsns) addRate(hsn, inferred);
      }
    } else if (percentages.length === 1 && hasTaxWords && !hasDiscountWords) {
      for (const hsn of hsns) addRate(hsn, percentages[0]);
    }
  }

  return map;
}

/**
 * Extract actual line items from the bill.
 * Handles clean PDF text, OCR text with messy spacing, and tab-separated formats.
 */
function extractLineItems(rawText, lines, gstRatesByHsn = {}) {
  const items = [];
  const seenDescriptions = new Set();

  // Patterns to skip — NOT product items
  const skipPatterns = [
    /^(gstin|gst\s*no|pan|tin|cin|fssai)/i,
    /^(phone|mob|tel|email|address|pin|state)/i,
    /^(date|invoice|bill|receipt|sales\s*order|tax\s*invoice)/i,
    /^(sub\s*total|grand\s*total|total|net|tax|cgst|sgst|igst|round)/i,
    /^(bank|account|ifsc|upi|payment|terms|note|remark|declaration)/i,
    /^(to|from|ship|sold|buyer|seller|consign)/i,
    /^(e\.?\s*&?\s*o\.?\s*e|subject\s*to|authorised|signature|for\s)/i,
    /^\d{6}$/,
    /^mob:\s*\d/i,
    /^[\d\s\-\+\(\)]{7,}$/,
  ];

  const gstinPattern = /\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z]/;
  const unitWords = '(?:nos|pcs|kg|kgs|mtr|ltr|pkt|box|set|pair|doz|each|unit|units|piece|pieces|numbers)';
  const unitRe = new RegExp(unitWords, 'i');

  // Helper: build item with GST calculation
  const buildItem = (desc, hsnSac, quantity, rate, explicitAmount, slNo) => {
    if (!desc || desc.length < 2) return null;
    const key = desc.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenDescriptions.has(key)) return null;
    seenDescriptions.add(key);

    const taxable = Number.isFinite(explicitAmount) && explicitAmount > 0
      ? explicitAmount
      : (Number.isFinite(quantity) && Number.isFinite(rate) ? quantity * rate : null);
    const gstPercent = hsnSac && Number.isFinite(gstRatesByHsn[hsnSac]) ? gstRatesByHsn[hsnSac] : null;
    const gstAmount = Number.isFinite(taxable) && Number.isFinite(gstPercent)
      ? parseFloat((taxable * gstPercent / 100).toFixed(2))
      : null;
    const totalAmount = Number.isFinite(taxable) && Number.isFinite(gstAmount)
      ? parseFloat((taxable + gstAmount).toFixed(2))
      : taxable;

    return {
      sl_no: slNo || null,
      description: desc,
      hsn_sac: hsnSac || null,
      quantity: Number.isFinite(quantity) ? quantity : null,
      unit: 'Nos',
      rate: Number.isFinite(rate) ? rate : null,
      taxable_amount: Number.isFinite(taxable) ? parseFloat(taxable.toFixed(2)) : null,
      gst_percent: Number.isFinite(gstPercent) ? gstPercent : null,
      gst_amount: Number.isFinite(gstAmount) ? gstAmount : null,
      total_amount: Number.isFinite(totalAmount) ? totalAmount : null,
      amount: Number.isFinite(totalAmount) ? totalAmount : (Number.isFinite(taxable) ? taxable : null),
    };
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1: Dynamic header detection — column order varies by biller
  // ═══════════════════════════════════════════════════════════════════════

  // Column type matchers (ordered: more specific first to avoid mis-classification)
  const COLUMN_MATCHERS = [
    ['sl',          /\b(sl\.?|s\.?\s*no|sr\.?\s*no|serial|#)\b/i],
    ['description', /(desc|goods|particular|item|product|material|name)/i],
    ['hsn',         /\b(hsn|sac)\b/i],
    ['avail_qty',   /(avail|stock|bal(?:ance)?)/i],       // Must be before 'quantity'
    ['quantity',    /\b(qty|quantity|qnty)\b/i],
    ['rate',        /\b(rate|price|mrp|unit\s*price)\b/i],
    ['amount',      /\b(amount|value|net\s*amt)\b/i],
    ['discount',    /\b(disc|discount)\b/i],
    ['per',         /\bper\b/i],
    ['gst',         /\b(gst|tax%?|cgst|sgst|igst)\b/i],
    ['total',       /\btotal\b/i],
  ];

  let headerIdx = -1;
  let columnOrder = [];

  // Scan all lines (including repeat headers on later pages) — use first match
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const line = lines[i];
    if (!line || line.trim().length < 10) continue;

    // Split by tabs or 2+ spaces into header cells
    const parts = line.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 3) continue;

    let recognized = 0;
    const mapping = [];

    for (const part of parts) {
      let found = false;
      for (const [colType, regex] of COLUMN_MATCHERS) {
        if (regex.test(part)) {
          mapping.push(colType);
          recognized++;
          found = true;
          break;
        }
      }
      if (!found) mapping.push('unknown');
    }

    // Valid header needs ≥3 recognized columns including description + at least one numeric-type column
    const hasDesc = mapping.includes('description');
    const hasNumeric = mapping.includes('rate') || mapping.includes('quantity') || mapping.includes('amount');

    if (recognized >= 3 && hasDesc && hasNumeric) {
      headerIdx = i;
      columnOrder = mapping;
      console.log(`[LineItems] Header found at line ${i}: ${JSON.stringify(columnOrder)}`);
      console.log(`[LineItems] Header parts: ${JSON.stringify(parts)}`);
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2: Parse data rows using detected column mapping
  // ═══════════════════════════════════════════════════════════════════════

  if (headerIdx >= 0 && columnOrder.length >= 3) {
    const unitPattern = /^(nos|pcs|kg|kgs|mtr|ltr|pkt|box|set|pair|doz|each|unit|units|piece|pieces|numbers)$/i;

    // Classify a cell to a likely column type
    const classifyCell = (cell) => {
      const stripped = cell.replace(/,/g, '').trim();
      if (!stripped) return 'empty';
      if (/^\d{4,8}$/.test(stripped)) return 'hsn';
      if (/%/.test(cell)) return 'discount';
      if (unitPattern.test(stripped)) return 'per';
      if (/^[\(\)\-\+]*\d+(?:[,.]?\d+)*(?:\.\d+)?\s*(nos|pcs|kg|kgs|mtr|ltr|pkt|box|set|pair|doz|each|unit|units|piece|pieces|numbers)/i.test(stripped)) return 'qty_with_unit';
      if (/^\d{1,3}$/.test(stripped) && parseInt(stripped) <= 300) return 'sl_or_number';
      if (/^[\d,]+(?:\.\d{1,2})?$/.test(stripped)) return 'number';
      if (/[a-zA-Z]/.test(cell) && cell.length >= 2) return 'text';
      return 'unknown';
    };

    // Which columns can be absent from a data row
    const optionalCols = new Set(['avail_qty', 'discount', 'per', 'gst', 'total', 'unknown']);

    // Check if column type is compatible with a cell classification
    const isCompatible = (colType, cellType) => {
      if (colType === 'sl') return cellType === 'sl_or_number' || cellType === 'number';
      if (colType === 'description') return cellType === 'text';
      if (colType === 'hsn') return cellType === 'hsn';
      if (colType === 'quantity') return cellType === 'qty_with_unit' || cellType === 'number' || cellType === 'sl_or_number';
      if (colType === 'avail_qty') return cellType === 'qty_with_unit' || cellType === 'number' || cellType === 'sl_or_number';
      if (colType === 'rate') return cellType === 'number' || cellType === 'sl_or_number';
      if (colType === 'amount') return cellType === 'number' || cellType === 'sl_or_number';
      if (colType === 'discount') return cellType === 'discount';
      if (colType === 'per') return cellType === 'per';
      if (colType === 'gst') return cellType === 'number' || cellType === 'discount';
      if (colType === 'total') return cellType === 'number';
      return true; // unknown
    };

    // Detect repeated table headers (for multi-page PDFs)
    const isRepeatedHeader = (line) => {
      let matches = 0;
      for (const [, regex] of COLUMN_MATCHERS) {
        if (regex.test(line)) matches++;
      }
      return matches >= 3;
    };

    let consecutiveNonItems = 0;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length < 3) { consecutiveNonItems++; continue; }
      const trimmed = line.trim();

      // Skip non-data lines
      if (skipPatterns.some(p => p.test(trimmed))) { consecutiveNonItems++; continue; }
      if (gstinPattern.test(line)) { consecutiveNonItems++; continue; }

      // Stop if we've moved well past the table (30 consecutive non-item lines after getting items)
      if (consecutiveNonItems > 30 && items.length > 0) break;

      // Skip repeated headers on subsequent pages — reset gap counter
      if (isRepeatedHeader(trimmed)) { consecutiveNonItems = 0; continue; }

      // Split by tabs or 2+ spaces
      const parts = line.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
      if (parts.length < 3) { consecutiveNonItems++; continue; }

      // Classify each cell
      const classified = parts.map(p => ({ value: p, type: classifyCell(p) }));

      // Sanity: need at least one text cell (description) and first cell should be a number (serial)
      const hasText = classified.some(c => c.type === 'text');
      const firstIsNum = classified[0].type === 'sl_or_number' || classified[0].type === 'number';
      if (!hasText || !firstIsNum) { consecutiveNonItems++; continue; }

      // ── Map parts → columns ──
      const mapped = {};

      if (parts.length === columnOrder.length) {
        // Exact match — direct positional mapping
        for (let j = 0; j < columnOrder.length; j++) {
          mapped[columnOrder[j]] = parts[j];
        }
      } else if (parts.length < columnOrder.length) {
        // Fewer parts than header columns — some optional columns are missing
        // Walk both arrays, skipping optional columns that don't match
        let pi = 0;
        let ci = 0;
        while (pi < parts.length && ci < columnOrder.length) {
          const colType = columnOrder[ci];
          const cellType = classified[pi].type;

          if (isCompatible(colType, cellType)) {
            mapped[colType] = parts[pi];
            pi++;
            ci++;
          } else if (optionalCols.has(colType)) {
            ci++; // skip this optional column (absent in this row)
          } else {
            // Required column doesn't match — skip anyway and hope for the best
            ci++;
          }
        }
      } else {
        // More parts than header columns — description was probably split
        // Merge consecutive text parts in the description position
        const descIdx = columnOrder.indexOf('description');
        const extra = parts.length - columnOrder.length;

        if (descIdx >= 0 && extra > 0) {
          const mergedParts = [];
          const mergedClassified = [];
          let merged = 0;

          for (let j = 0; j < parts.length; j++) {
            if (merged < extra && j > descIdx && classified[j].type === 'text') {
              // Merge with previous description cell
              mergedParts[mergedParts.length - 1] += ' ' + parts[j];
              merged++;
            } else {
              mergedParts.push(parts[j]);
              mergedClassified.push(classified[j]);
            }
          }

          for (let j = 0; j < Math.min(mergedParts.length, columnOrder.length); j++) {
            mapped[columnOrder[j]] = mergedParts[j];
          }
        } else {
          // Can't determine, use positional
          for (let j = 0; j < Math.min(parts.length, columnOrder.length); j++) {
            mapped[columnOrder[j]] = parts[j];
          }
        }
      }

      // ── Extract values from mapped columns ──
      const desc = mapped.description || null;
      if (!desc) { consecutiveNonItems++; continue; }

      const hsnRaw = mapped.hsn || null;
      const hsnSac = hsnRaw ? (hsnRaw.match(/(\d{4,8})/) || [null, null])[1] : null;

      let quantity = null;
      if (mapped.quantity) {
        const qtyMatch = mapped.quantity.match(/([\d,]+(?:\.\d+)?)/);
        if (qtyMatch) quantity = parseAmount(qtyMatch[1]);
      }

      let rate = null;
      if (mapped.rate) {
        rate = parseAmount(mapped.rate);
      }

      let explicitAmount = null;
      if (mapped.amount) {
        explicitAmount = parseAmount(mapped.amount);
      }
      // If 'total' column exists and 'amount' doesn't, use total as amount
      if (!explicitAmount && mapped.total) {
        explicitAmount = parseAmount(mapped.total);
      }

      let slNo = null;
      if (mapped.sl) {
        slNo = parseInt(mapped.sl);
      }

      consecutiveNonItems = 0;
      const item = buildItem(desc, hsnSac, quantity, rate, explicitAmount, slNo);
      if (item) {
        console.log(`[LineItems] Row ${slNo || '?'}: desc="${desc}", hsn=${hsnSac}, qty=${quantity}, rate=${rate}, amt=${explicitAmount}`);
        items.push(item);
      }
    }

    if (items.length > 0) {
      console.log(`[LineItems] Extracted ${items.length} items via dynamic header mapping`);
      return items.slice(0, 50);
    }
    // If dynamic mapping found header but no items, fall through to legacy patterns
    console.log('[LineItems] Header detected but no items extracted; falling back to legacy patterns');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: Legacy fallback — regex patterns for bills without clear headers
  // ═══════════════════════════════════════════════════════════════════════

  // Pattern B: "1  FC-01  442190  5  320.00  1600.00"
  const patternB = /^\s*(\d{1,3})\s+([A-Za-z][A-Za-z0-9\-\/\s]{1,39})\s+(\d{4,8})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+([0-9,]+(?:\.\d{1,2})?)\s*$/;
  // Pattern C: "1  Widget XYZ  5  320.00  1600.00" (no HSN)
  const patternC = /^\s*(\d{1,3})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 5 || line.length > 300) continue;
    const trimmed = line.trim();
    if (skipPatterns.some(p => p.test(trimmed))) continue;
    if (gstinPattern.test(line)) continue;

    let m = patternB.exec(line);
    if (m) {
      const item = buildItem(m[2].trim(), m[3], parseFloat(m[4]), parseFloat(m[5]), parseAmount(m[6]), parseInt(m[1]));
      if (item) items.push(item);
      continue;
    }

    m = patternC.exec(line);
    if (m && m[2].trim().length >= 2) {
      const item = buildItem(m[2].trim(), null, parseFloat(m[3]), parseFloat(m[4]), parseAmount(m[5]), parseInt(m[1]));
      if (item) items.push(item);
      continue;
    }

    // Tab-separated fallback
    const tabParts = line.split('\t').map(p => p.trim()).filter(p => p);
    if (tabParts.length >= 3) {
      const descPart = tabParts.find(p => /[A-Za-z]{2,}/.test(p) && p.length >= 2);
      if (descPart && !skipPatterns.some(pat => pat.test(descPart)) && !gstinPattern.test(descPart)) {
        const numParts = tabParts.filter(p => /^\d+(?:[,.]?\d+)*$/.test(p.replace(/,/g, '')));
        const hsnSac = tabParts.find(p => /^\d{4,8}$/.test(p)) || null;
        const pureNums = numParts.filter(p => p !== hsnSac);
        if (pureNums.length >= 2) {
          const item = buildItem(descPart, hsnSac, parseFloat(pureNums[0]), parseFloat(pureNums[1]),
            pureNums.length >= 3 ? parseFloat(pureNums[pureNums.length - 1]) : null, null);
          if (item) items.push(item);
        }
      }
      continue;
    }

    // Space-separated OCR fallback
    const spaceParts = line.split(/\s{2,}/).map(p => p.trim()).filter(p => p);
    if (spaceParts.length >= 3) {
      const descCandidate = spaceParts.find(p => /[A-Za-z]{2,}/.test(p) && p.length >= 2);
      if (descCandidate && !skipPatterns.some(pat => pat.test(descCandidate)) && !gstinPattern.test(descCandidate)) {
        const nums = spaceParts.filter(p => /^\d+(?:[,.]?\d+)*$/.test(p.replace(/,/g, '')));
        const hsnSac = spaceParts.find(p => /^\d{4,8}$/.test(p)) || null;
        const pureNums = nums.filter(p => p !== hsnSac);
        if (pureNums.length >= 2) {
          const item = buildItem(descCandidate, hsnSac, parseFloat(pureNums[0]), parseFloat(pureNums[1]),
            pureNums.length >= 3 ? parseFloat(pureNums[pureNums.length - 1]) : null, null);
          if (item) items.push(item);
        }
      }
    }
  }

  // ─── Last-resort fallback: extract product-like descriptions ───
  if (items.length === 0) {
    for (const line of lines) {
      if (line.length < 5 || line.length > 200) continue;
      if (skipPatterns.some(p => p.test(line.trim()))) continue;
      if (gstinPattern.test(line)) continue;

      const hasLetters = /[A-Za-z]{3,}/.test(line);
      const hasAmount = /\d{2,}(?:\.\d{1,2})?/.test(line);
      const isNotHeader = !/^(sl|sr|s\.?\s*no|item|description|particular|hsn|qty|rate|amount|gst)/i.test(line);

      if (hasLetters && hasAmount && isNotHeader && !seenDescriptions.has(line.toLowerCase())) {
        seenDescriptions.add(line.toLowerCase());
        const desc = line.replace(/[\t]+/g, ' ').replace(/\s{2,}/g, ' ')
          .replace(/\s+\d+(?:[.,]\d+)*(?:\.\d{1,2})?\s*(?:nos|pcs|kg|mtr|ltr|pkt|box|set|pair|doz)?\s*$/gi, '')
          .trim();

        if (desc.length >= 3 && desc.length <= 120) {
          items.push({ description: desc, raw: line });
        }
      }
    }
  }

  return items.slice(0, 50);
}

/**
 * Extract product keywords for category matching
 */
function extractProductKeywords(lowerText) {
  const keywords = [];
  const productKeywords = [
    'paper', 'ink', 'toner', 'ribbon', 'film', 'label', 'sticker', 'vinyl',
    'printing', 'laser', 'offset', 'digital', 'copy', 'print', 'flex',
    'laminate', 'binding', 'cutting', 'lamination', 'finishing',
    'card', 'cardboard', 'board', 'stock', 'banner', 'poster',
    'gsm', 'sheets', 'reams', 'rolls', 'coils',
    'trophy', 'trophies', 'memento', 'shield', 'medal', 'cup', 'award',
    'plate', 'plaque', 'acrylic', 'wooden', 'crystal'
  ];
  productKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) keywords.push(keyword);
  });
  return keywords;
}

/**
 * Normalize date string to YYYY-MM-DD format
 */
function normalizeDateString(dateStr) {
  try {
    if (!dateStr) return null;

    // Handle "DD Mon YYYY" or "DD-Mon-YYYY" format
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const monthMatch = dateStr.match(/(\d{1,2})[\s\-\.\/,]*([a-z]{3})[a-z]*[\s\-\.\/,]*(\d{2,4})/i);
    if (monthMatch) {
      const day = parseInt(monthMatch[1]);
      const month = months[monthMatch[2].toLowerCase().substring(0, 3)];
      let year = parseInt(monthMatch[3]);
      if (year < 100) year += year < 50 ? 2000 : 1900;
      if (month && day >= 1 && day <= 31 && year >= 1990 && year <= 2050) {
        return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      }
    }

    // Handle DD/MM/YYYY or DD-MM-YYYY
    const numMatch = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (numMatch) {
      let part1 = parseInt(numMatch[1]);
      let part2 = parseInt(numMatch[2]);
      let part3 = parseInt(numMatch[3]);

      let day, month, year;

      if (part3 > 100) {
        // DD/MM/YYYY format
        year = part3;
        if (part1 > 12) {
          day = part1; month = part2;
        } else if (part2 > 12) {
          day = part2; month = part1;
        } else {
          // Assume DD/MM (Indian standard)
          day = part1; month = part2;
        }
      } else if (part1 > 100) {
        // YYYY/MM/DD format
        year = part1; month = part2; day = part3;
      } else {
        // Two-digit year — assume DD/MM/YY
        day = part1; month = part2;
        year = part3 < 50 ? 2000 + part3 : 1900 + part3;
      }

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2050) {
        return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

// ===================== SUGGESTION ENGINES =====================

/**
 * Suggest related categories and expense types
 */
function suggestExpenseCategories(suggestions) {
  const categories = [];
  const lowerVendor = (suggestions.vendor_name || '').toLowerCase();
  const lowerKeywords = suggestions.keywords.join(' ');
  const combined = lowerVendor + ' ' + lowerKeywords;

  if (/paper|stock|stationery/.test(combined)) {
    categories.push({ type: 'Vendor', related_tab: 'vendors', score: 0.95 });
  }
  if (/ink|toner|ribbon|consumable/.test(combined)) {
    categories.push({ type: 'Vendor', related_tab: 'vendors', score: 0.90 });
  }
  if (/trophy|trophies|memento|shield|medal|award|cup|plaque/.test(combined)) {
    categories.push({ type: 'Memento & Trophies', related_tab: 'vendors', score: 0.98 });
  }
  if (/utility|electricity|water|gas/.test(combined)) {
    categories.push({ type: 'Utilities', related_tab: 'utilities', score: 0.99 });
  }
  if (/transport|delivery|shipping|courier|freight/.test(combined)) {
    categories.push({ type: 'Transport', related_tab: 'transport', score: 0.90 });
  }
  if (/rent|lease|property/.test(combined)) {
    categories.push({ type: 'Rent', related_tab: 'rent', score: 0.95 });
  }
  if (/office|medical|supplies|maintenance/.test(combined)) {
    categories.push({ type: 'Office', related_tab: 'office', score: 0.85 });
  }
  if (/printing|offset|digital|laser|flex|banner/.test(combined)) {
    categories.push({ type: 'Vendor', related_tab: 'vendors', score: 0.85 });
  }

  if (categories.length === 0) {
    categories.push({ type: 'Other', related_tab: 'misc', score: 0.60 });
  }

  const deduped = new Map();
  for (const category of categories) {
    if (!deduped.has(category.type) || deduped.get(category.type).score < category.score) {
      deduped.set(category.type, category);
    }
  }

  return [...deduped.values()].sort((a, b) => b.score - a.score);
}

/**
 * Suggest products to add to inventory based on extracted text
 */
function suggestInventoryItems(suggestions) {
  const items = [];
  const productMappings = {
    'paper': [{ name: 'A4 Paper 500 sheets', category: 'Paper & Stationery', unit: 'Pack' }],
    'ink': [{ name: 'Ink Cartridge', category: 'Consumables', unit: 'Piece' }],
    'toner': [{ name: 'Toner Cartridge', category: 'Consumables', unit: 'Piece' }],
    'label': [{ name: 'Label Stickers', category: 'Labels & Stickers', unit: 'Pack' }],
    'film': [{ name: 'Lamination Film', category: 'Finishing Materials', unit: 'Roll' }],
    'trophy': [{ name: 'Trophy', category: 'Trophies & Awards', unit: 'Piece' }],
    'trophies': [{ name: 'Trophies', category: 'Trophies & Awards', unit: 'Piece' }],
    'shield': [{ name: 'Shield Award', category: 'Trophies & Awards', unit: 'Piece' }],
    'medal': [{ name: 'Medal', category: 'Trophies & Awards', unit: 'Piece' }],
  };

  suggestions.keywords.forEach(keyword => {
    if (productMappings[keyword.toLowerCase()]) {
      items.push(...productMappings[keyword.toLowerCase()].map(p => ({
        ...p,
        matched_keyword: keyword,
        confidence: 0.80
      })));
    }
  });

  return items.slice(0, 5).map((item, idx) => ({
    ...item,
    score: 1 - (idx * 0.1)
  }));
}

// ===================== MAIN ORCHESTRATOR =====================

/**
 * Main function to process bill and get all suggestions
 */
async function processBillDocument(filePath) {
  try {
    const extraction = await extractTextFromDocument(filePath);

    if (!extraction.text) {
      return {
        success: false,
        message: 'Could not extract text from document',
        error: extraction.error
      };
    }

    console.log('[Bill Processing] Raw text (first 500 chars):', extraction.text.substring(0, 500));
    console.log('[Bill Processing] Full raw text (lines):');
    extraction.text.split('\n').forEach((line, idx) => {
      if (line.trim()) console.log(`  [${idx}] "${line}"`);
    });

    const parsed = parseExtractedText(extraction.text);

    console.log('[Bill Processing] Parsed result:', JSON.stringify({
      amount: parsed.amount,
      bill_number: parsed.bill_number,
      bill_date: parsed.bill_date,
      vendor_name: parsed.vendor_name,
      tax: parsed.tax,
      items_count: parsed.items.length,
      items: parsed.items.map(it => ({ desc: it.description, hsn: it.hsn_sac, qty: it.quantity, rate: it.rate, gst: it.gst_percent, total: it.total_amount })),
      keywords: parsed.keywords
    }, null, 2));

    const suggestions = {
      extracted_data: {
        amount: parsed.amount,
        bill_number: parsed.bill_number,
        bill_date: parsed.bill_date,
        vendor_name: parsed.vendor_name,
        tax: parsed.tax,
        items: parsed.items,
        detected_type: parsed.detected_type
      },
      category_suggestions: suggestExpenseCategories(parsed),
      inventory_suggestions: suggestInventoryItems(parsed),
      raw_text: extraction.text.substring(0, 3000),
      confidence: extraction.confidence
    };

    return { success: true, suggestions };
  } catch (error) {
    console.error('Bill processing error:', error);
    return { success: false, message: error.message, error: error.message };
  }
}

module.exports = {
  extractTextFromDocument,
  parseExtractedText,
  suggestExpenseCategories,
  suggestInventoryItems,
  processBillDocument,
  normalizeDateString
};

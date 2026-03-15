const fs = require('fs');
const path = require('path');
const { extractBillData } = require('../utils/ocrParser');

// Load server/.env explicitly so this helper works even when Node is started from workspace root.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

function isQuotaOrRateLimitError(error) {
  const message = String(error?.message || '').toLowerCase();
  return /quota exceeded|rate limit|too many requests|429|free_tier|billing|resource_exhausted/.test(message);
}

function buildSuggestionsFromOcr(ocrData = {}) {
  const items = Array.isArray(ocrData.items) ? ocrData.items : [];
  const normalized = {
    vendor_name: String(ocrData.vendor_name || ''),
    bill_number: ocrData.bill_number ? String(ocrData.bill_number) : null,
    bill_date: ocrData.bill_date ? String(ocrData.bill_date) : null,
    total_amount: toNumber(ocrData.total_amount, 0),
    tax_amount: 0,
    subtotal: 0,
    line_items: items.map((line) => ({
      description: String(line?.name || ''),
      hsn_sac: String(line?.hsn || ''),
      quantity: toNumber(line?.quantity, 0),
      unit_price: toNumber(line?.cost_price, 0),
      rate: toNumber(line?.cost_price, 0),
      gst_percent: toNumber(line?.gst_rate, 0),
      total_amount: toNumber(line?.amount, toNumber(line?.quantity, 0) * toNumber(line?.cost_price, 0)),
      amount: toNumber(line?.amount, toNumber(line?.quantity, 0) * toNumber(line?.cost_price, 0))
    })),
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
You are a bill/invoice parser for an Indian print shop.
Extract data from this bill image and return ONLY valid JSON, no extra text:
{
  "vendor_name": "string",
  "bill_number": "string or null",
  "bill_date": "YYYY-MM-DD or null",
  "total_amount": number or 0,
  "tax_amount": number or 0,
  "subtotal": number or 0,
  "line_items": [
    {
      "description": "string",
      "quantity": number,
      "unit_price": number,
      "amount": number
    }
  ],
  "confidence": number between 0 and 1
}

Rules:
- All amounts in INR numbers only, no symbols
- Dates in YYYY-MM-DD format
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

async function processBillDocument(filePath) {
  try {
    console.log('[Gemini] Processing bill:', filePath);
    let extracted;
    try {
      extracted = await extractWithGemini(filePath);
    } catch (geminiError) {
      if (!isQuotaOrRateLimitError(geminiError)) {
        throw geminiError;
      }

      console.warn('[Gemini] Quota/rate limit reached. Falling back to local OCR.');
      const mimeType = getMimeType(filePath);
      const ocrData = await extractBillData(filePath, mimeType);
      const fallbackSuggestions = buildSuggestionsFromOcr(ocrData);
      return { success: true, suggestions: fallbackSuggestions };
    }

    const normalized = {
      vendor_name: String(extracted?.vendor_name || ''),
      bill_number: extracted?.bill_number || null,
      bill_date: extracted?.bill_date || null,
      total_amount: toNumber(extracted?.total_amount, 0),
      tax_amount: toNumber(extracted?.tax_amount, 0),
      subtotal: toNumber(extracted?.subtotal, 0),
      line_items: Array.isArray(extracted?.line_items) ? extracted.line_items.map((line) => ({
        description: String(line?.description || ''),
        quantity: toNumber(line?.quantity, 0),
        unit_price: toNumber(line?.unit_price, 0),
        amount: toNumber(line?.amount, 0)
      })) : [],
      confidence: Math.max(0, Math.min(1, toNumber(extracted?.confidence, 0.9)))
    };

    const suggestions = {
      extracted_data: {
        amount: normalized.total_amount,
        bill_number: normalized.bill_number,
        bill_date: normalized.bill_date,
        vendor_name: normalized.vendor_name,
        tax: normalized.tax_amount,
        subtotal: normalized.subtotal,
        items: normalized.line_items,
        detected_type: 'Invoice'
      },
      category_suggestions: suggestCategories(normalized),
      inventory_suggestions: suggestInventory(normalized),
      confidence: normalized.confidence,
      raw_text: JSON.stringify(normalized)
    };

    console.log('[Gemini] Extraction successful, confidence:', normalized.confidence);
    return { success: true, suggestions };
  } catch (error) {
    console.error('[Gemini] Extraction failed:', error.message);
    return {
      success: false,
      message: `Could not extract bill details: ${error.message}`,
      error: error.message
    };
  }
}

module.exports = { processBillDocument };

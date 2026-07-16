const { GoogleGenerativeAI } = require('@google/generative-ai');
const sharp = require('sharp');
const RequestQueue = require('../utils/requestQueue');
const logger = require('../helpers/logger');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const EXTRACTION_PROMPT = `You are given images of one or more pages of a bill or invoice. Combine information across all pages into a single structured JSON result — for example, an invoice header on page 1 and itemized list on page 2 should merge into one result, not two.

CRITICAL — Table structure analysis: The invoice contains a printed TABLE with columns like SI No, Description, HSN/SAC, Quantity, Rate, Per, Disc%, Amount. Use your visual understanding of the table layout (grid lines, spacing, alignment, indentation) to correctly associate each value with its column and row. Do not rely on reading order alone — visually trace each row across its columns.

- Use SI No (serial number) as a strong row anchor — sequential counters are the most reliable signal for where a new line item begins.
- Unit words like "Nos", "Pcs", "Kg", "Ltr", "Mtr" typically appear in or near the quantity column.
- Larger round numbers are typically amounts; smaller decimals like xxx.xx are usually rates.
- Arithmetic cross-check per item: quantity × rate should approximately equal the amount (allowing for rounding or a discount %). Use this sanity check to detect and correct misaligned values.

Extract the following fields and return them as JSON:
- vendor_name: the vendor or supplier name
- bill_number: the invoice or bill number
- bill_date: date in YYYY-MM-DD format
- gst_number: GST identification number (if present, otherwise null)
- items: array of line items, each with {description, quantity, rate, amount, hsn_sac}
- subtotal: before-tax amount
- tax_amount: total tax amount
- total_amount: grand total

If a field is not found, use null. For items, return an empty array if no line items are clearly identified.

Totals cross-check: After extracting all items, verify that SUM(item amounts) approximately equals subtotal, and that subtotal + tax_amount approximately equals total_amount. If these don't reconcile, re-examine your line items and totals — do not default total_amount to 0 or leave it blank.`;

const queue = new RequestQueue();

let genAIInstance = null;
function getGenAI() {
  if (!genAIInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    genAIInstance = new GoogleGenerativeAI(apiKey);
  }
  return genAIInstance;
}

async function callGeminiWithRetry(ocrText) {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  logger.info('[BillExtraction] Calling Gemini', {
    model: GEMINI_MODEL,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    ocrTextLength: ocrText.length,
  });

  let result;
  try {
    result = await model.generateContent([EXTRACTION_PROMPT, ocrText]);
  } catch (geminiErr) {
    logger.error('[BillExtraction] RAW GEMINI ERROR', {
      message: geminiErr.message,
      status: geminiErr.status,
      statusText: geminiErr.statusText,
      code: geminiErr.code,
      details: geminiErr.errorDetails || geminiErr.details,
      responseData: geminiErr.response?.data,
      stack: geminiErr.stack,
    });
    throw geminiErr;
  }

  const response = result.response;
  const text = response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    logger.error('[BillExtraction] RAW JSON PARSE ERROR', {
      message: parseErr.message,
      stack: parseErr.stack,
      preview: text.slice(0, 500),
    });
    throw new Error(`Gemini returned invalid JSON: ${parseErr.message}`);
  }

  return parsed;
}

async function extractBillData(ocrText) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI extraction temporarily unavailable, please enter manually');
  }

  if (typeof ocrText !== 'string' || ocrText.trim().length === 0) {
    throw new Error('No text data provided');
  }

  try {
    return await queue.enqueue(async () => {
      try {
        return await callGeminiWithRetry(ocrText);
      } catch (err) {
        if (err.status === 429 || (err.message && err.message.includes('429'))) {
          logger.warn('[BillExtraction] 429 rate limit hit, retrying after 5s');
          await new Promise(resolve => setTimeout(resolve, 5000));
          return await callGeminiWithRetry(ocrText);
        }
        throw err;
      }
    });
  } catch (err) {
    if (err.message === 'Too many pending extractions, please try again in a few minutes') {
      throw err;
    }
    logger.error('[BillExtraction] RAW ERROR (before generic message)', {
      message: err.message,
      status: err.status,
      code: err.code,
      statusText: err.statusText,
      details: err.errorDetails || err.details,
      responseData: err.response?.data,
      stack: err.stack,
    });
    throw new Error('AI extraction temporarily unavailable, please enter manually');
  }
}

async function pdfToImages(pdfBuffer) {
  const pdfParse = require('pdf-parse');
  const pdfData = await pdfParse(pdfBuffer);
  const pageCount = pdfData.numpages || 1;
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const imgBuffer = await sharp(pdfBuffer, { page: i }).png().toBuffer();
    pages.push({ buffer: imgBuffer, mimeType: 'image/png' });
  }

  logger.info('[BillExtraction] PDF converted to images', { pageCount });
  return pages;
}

async function callGeminiWithImages(pages) {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const parts = [EXTRACTION_PROMPT];
  for (let i = 0; i < pages.length; i++) {
    parts.push({
      inlineData: {
        data: pages[i].buffer.toString('base64'),
        mimeType: pages[i].mimeType,
      },
    });
  }

  logger.info('[BillExtraction] Calling Gemini with images', {
    model: GEMINI_MODEL,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    pageCount: pages.length,
  });

  let result;
  try {
    result = await model.generateContent(parts);
  } catch (geminiErr) {
    logger.error('[BillExtraction] RAW GEMINI ERROR', {
      message: geminiErr.message,
      status: geminiErr.status,
      statusText: geminiErr.statusText,
      code: geminiErr.code,
      details: geminiErr.errorDetails || geminiErr.details,
      responseData: geminiErr.response?.data,
      stack: geminiErr.stack,
    });
    throw geminiErr;
  }

  const response = result.response;
  const text = response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    logger.error('[BillExtraction] RAW JSON PARSE ERROR', {
      message: parseErr.message,
      stack: parseErr.stack,
      preview: text.slice(0, 500),
    });
    throw new Error(`Gemini returned invalid JSON: ${parseErr.message}`);
  }

  return parsed;
}

async function extractBillDataFromImages(pages) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI extraction temporarily unavailable, please enter manually');
  }

  if (!pages || pages.length === 0) {
    throw new Error('No images provided');
  }

  const resolved = [];
  for (const page of pages) {
    if (page.mimeType === 'application/pdf') {
      const converted = await pdfToImages(page.buffer);
      resolved.push(...converted);
    } else {
      resolved.push(page);
    }
  }

  return await queue.enqueue(async () => {
    try {
      return await callGeminiWithImages(resolved);
    } catch (err) {
      if (err.status === 429 || (err.message && err.message.includes('429'))) {
        logger.warn('[BillExtraction] 429 rate limit hit, retrying after 5s');
        await new Promise(resolve => setTimeout(resolve, 5000));
        return await callGeminiWithImages(resolved);
      }
      throw err;
    }
  });
}

module.exports = { extractBillData, extractBillDataFromImages, queue };

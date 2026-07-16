const { GoogleGenerativeAI } = require('@google/generative-ai');
const RequestQueue = require('../utils/requestQueue');
const logger = require('../helpers/logger');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const EXTRACTION_PROMPT = `You are given RAW OCR text extracted from one or more pages of a bill or invoice. The pages are separated with "--- Page N ---" markers. Combine information across all pages into a single structured JSON result — for example, an invoice header on page 1 and itemized list on page 2 should merge into one result, not two.

The text may contain OCR errors (e.g. "l" vs "1", "O" vs "0", garbled characters, missing spaces). Use your best judgement to correct obvious OCR mistakes and infer the correct values.

Extract the following fields and return them as JSON:
- vendor_name: the vendor or supplier name
- bill_number: the invoice or bill number
- bill_date: date in YYYY-MM-DD format
- gst_number: GST identification number (if present, otherwise null)
- items: array of line items, each with {description, quantity, rate, amount}
- subtotal: before-tax amount
- tax_amount: total tax amount
- total_amount: grand total

If a field is not found, use null. For items, return an empty array if no line items are clearly identified.`;

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

module.exports = { extractBillData, queue };

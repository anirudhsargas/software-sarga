const { GoogleGenerativeAI } = require('@google/generative-ai');
const RequestQueue = require('../utils/requestQueue');
const logger = require('../helpers/logger');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const EXTRACTION_PROMPT = `You are given one or more images that are different pages or sides of the SAME bill or invoice. Combine information across all images into a single structured JSON result — for example, an invoice header on page 1 and itemized list on page 2 should merge into one result, not two.

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

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    vendor_name: { type: 'string', nullable: true },
    bill_number: { type: 'string', nullable: true },
    bill_date: { type: 'string', nullable: true },
    gst_number: { type: 'string', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number', nullable: true },
          rate: { type: 'number', nullable: true },
          amount: { type: 'number', nullable: true },
        },
        required: ['description'],
      },
    },
    subtotal: { type: 'number', nullable: true },
    tax_amount: { type: 'number', nullable: true },
    total_amount: { type: 'number', nullable: true },
  },
  required: ['vendor_name', 'bill_number', 'bill_date', 'gst_number', 'items', 'subtotal', 'tax_amount', 'total_amount'],
};

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

function buildImageParts(pages) {
  return pages.map(p => ({
    inlineData: {
      data: p.buffer.toString('base64'),
      mimeType: p.mimeType,
    },
  }));
}

async function callGeminiWithRetry(pages) {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const parts = [EXTRACTION_PROMPT, ...buildImageParts(pages)];

  const result = await model.generateContent(parts);
  const response = result.response;
  const text = response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    throw new Error(`Gemini returned invalid JSON: ${parseErr.message}`);
  }

  return parsed;
}

async function extractBillData(pages) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI extraction temporarily unavailable, please enter manually');
  }

  if (!Array.isArray(pages)) {
    pages = [pages];
  }

  if (pages.length === 0) {
    throw new Error('No image data provided');
  }

  try {
    return await queue.enqueue(async () => {
      try {
        return await callGeminiWithRetry(pages);
      } catch (err) {
        if (err.status === 429 || (err.message && err.message.includes('429'))) {
          logger.warn('[BillExtraction] 429 rate limit hit, retrying after 5s');
          await new Promise(resolve => setTimeout(resolve, 5000));
          return await callGeminiWithRetry(pages);
        }
        throw err;
      }
    });
  } catch (err) {
    if (err.message === 'Too many pending extractions, please try again in a few minutes') {
      throw err;
    }
    logger.error('[BillExtraction] AI extraction failed', { error: err.message });
    throw new Error('AI extraction temporarily unavailable, please enter manually');
  }
}

module.exports = { extractBillData, queue };

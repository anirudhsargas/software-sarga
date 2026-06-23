const Tesseract = require('tesseract.js'); // eslint-disable-line no-unused-vars
let _PDFParse;
try { _PDFParse = require('pdf-parse'); } catch (_e) { _PDFParse = null; }
const fs = require('fs'); // eslint-disable-line no-unused-vars
const sharp = require('sharp'); // eslint-disable-line no-unused-vars

async function extractTextFromDocument(filePath) { // eslint-disable-line no-unused-vars
  try {
    const ext = filePath.toLowerCase().split('.').pop();
    console.log('[Extraction] File type detected:', ext);
    if (ext === 'pdf') {
      return await extractTextFromPdf(filePath); // eslint-disable-line no-undef
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      const result = await extractTextFromImage(filePath); // eslint-disable-line no-undef
      if (!result.text && result.error) return result;
      return result;
    } else {
      return { text: '', confidence: 0, error: 'Unsupported format: ' + ext };
    }
  } catch (error) {
    console.error('Error extracting text:', error.message);
    return { text: '', confidence: 0, error: error.message };
  }
}
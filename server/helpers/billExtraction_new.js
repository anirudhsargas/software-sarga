const Tesseract = require('tesseract.js');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const sharp = require('sharp');

async function extractTextFromDocument(filePath) {
  try {
    const ext = filePath.toLowerCase().split('.').pop();
    console.log('[Extraction] File type detected:', ext);
    if (ext === 'pdf') {
      return await extractTextFromPdf(filePath);
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      const result = await extractTextFromImage(filePath);
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
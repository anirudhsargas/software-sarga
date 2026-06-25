const Tesseract = require('tesseract.js');
const { fromPath } = require('pdf2pic');
const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');

async function extractTextFromImage(imagePath) {
  // Pre-process with sharp: grayscale + increase contrast for better OCR
  const processedPath = imagePath + '_processed.png';
  await sharp(imagePath)
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toFile(processedPath);

  const { data: { text } } = await Tesseract.recognize(processedPath, 'eng', {
    logger: () => {}
  });

  await fs.remove(processedPath);
  return text;
}

async function extractTextFromPDF(pdfPath) {
  const outputDir = path.dirname(pdfPath);
  const baseName = path.basename(pdfPath, '.pdf');

  const converter = fromPath(pdfPath, {
    density: 200,
    saveFilename: baseName,
    savePath: outputDir,
    format: 'png',
    width: 1654,
    height: 2339
  });

  // Convert first page only (bills are single page)
  const result = await converter(1);
  const imagePath = result.path;

  const text = await extractTextFromImage(imagePath);
  await fs.remove(imagePath);
  return text;
}

function parseExtractedText(rawText) {
  const text = rawText || '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // --- Amount extraction ---
  // Matches: ₹1,234.56 or Rs.1234 or Total: 1234.00
  const amountPatterns = [
    /(?:total|grand total|net amount|amount|payable)[^\d]*[\₹Rs\.]*\s*([\d,]+\.?\d*)/i,
    /[\₹Rs\.]+\s*([\d,]+\.?\d{2})/,
    /([\d,]+\.?\d{2})\s*(?:\/\-|only)/i
  ];
  let amount = null;
  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // --- Date extraction ---
  // Matches DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const datePattern = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
  let date = null;
  const dateMatch = text.match(datePattern);
  if (dateMatch) {
    const [_, d, m, y] = dateMatch;
    const year = y.length === 2 ? '20' + y : y;
    date = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // --- GST Number extraction ---
  const gstPattern = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/;
  const gstMatch = text.match(gstPattern);
  const gstNumber = gstMatch ? gstMatch[1] : null;

  // --- CGST / SGST extraction ---
  const cgstMatch = text.match(/CGST[^\d]*([\d,]+\.?\d*)/i);
  const sgstMatch = text.match(/SGST[^\d]*([\d,]+\.?\d*)/i);
  const igstMatch = text.match(/IGST[^\d]*([\d,]+\.?\d*)/i);

  // --- Vendor name: first meaningful non-numeric line ---
  const vendorName = lines.find(l =>
    l.length > 3 &&
    !/^(invoice|bill|receipt|date|gst|tax|total|phone|email|address)/i.test(l) &&
    /[a-zA-Z]/.test(l)
  ) || null;

  // --- Category classification by keyword ---
  const categoryKeywords = {
    'Printing Materials': ['paper', 'ink', 'toner', 'plate', 'chemical', 'blanket', 'offset'],
    'Office Supplies': ['stationery', 'pen', 'staple', 'file', 'folder', 'tape'],
    'Electricity': ['electricity', 'current', 'kseb', 'power', 'energy', 'units'],
    'Fuel': ['petrol', 'diesel', 'fuel', 'pump', 'litre', 'liter'],
    'Transport': ['transport', 'freight', 'courier', 'delivery', 'logistics', 'shipping'],
    'Maintenance': ['repair', 'maintenance', 'service', 'spare', 'parts'],
    'Food & Refreshments': ['hotel', 'restaurant', 'food', 'tea', 'coffee', 'snacks', 'canteen'],
    'Rent': ['rent', 'lease', 'building'],
    'Salary Advance': ['advance', 'salary'],
    'Miscellaneous': []
  };

  let category = 'Miscellaneous';
  const lowerText = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      category = cat;
      break;
    }
  }

  // --- Confidence score ---
  const confidence = [amount, date, vendorName, gstNumber].filter(Boolean).length;

  return {
    vendorName,
    amount,
    date,
    gstNumber,
    cgst: cgstMatch ? parseFloat(cgstMatch[1].replace(/,/g, '')) : null,
    sgst: sgstMatch ? parseFloat(sgstMatch[1].replace(/,/g, '')) : null,
    igst: igstMatch ? parseFloat(igstMatch[1].replace(/,/g, '')) : null,
    category,
    confidence, // 0-4, show warning in UI if < 2
    rawText: text.substring(0, 500) // for debugging
  };
}

module.exports = { extractTextFromImage, extractTextFromPDF, parseExtractedText };

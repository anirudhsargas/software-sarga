const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const pdfParse = require('pdf-parse');
const logger = require('../helpers/logger');

const MIN_TEXT_LENGTH = 20;
const MAX_DIMENSION = 2000;

async function checkImageQuality(imageBuffer, label) {
  try {
    const stats = await sharp(imageBuffer).stats();

    const channels = stats.channels;
    const meanBrightness = channels.reduce((sum, c) => sum + c.mean, 0) / channels.length;
    const meanStdev = channels.reduce((sum, c) => sum + c.stdev, 0) / channels.length;

    if (meanBrightness < 30) {
      logger.warn('[OCR] Image quality: very dark', { label, meanBrightness });
    } else if (meanStdev < 20) {
      logger.warn('[OCR] Image quality: low contrast', { label, meanBrightness, meanStdev });
    }
  } catch (err) {
    logger.warn('[OCR] Could not compute image stats', { label, error: err.message });
  }
}

async function preprocessImageForOCR(imageBuffer, label) {
  const originalInfo = await sharp(imageBuffer).metadata();
  const originalSizeKB = Math.round(imageBuffer.length / 1024);

  let pipeline = sharp(imageBuffer);

  if (originalInfo.width > MAX_DIMENSION || originalInfo.height > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: originalInfo.width > originalInfo.height ? MAX_DIMENSION : undefined,
      height: originalInfo.height >= originalInfo.width ? MAX_DIMENSION : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  pipeline = pipeline
    .grayscale()
    .normalize()
    .sharpen({ sigma: 0.8, m1: 0, m2: 2, x1: 1, y2: 20, y3: 0 });

  const processedBuffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
  const processedInfo = await sharp(processedBuffer).metadata();
  const processedSizeKB = Math.round(processedBuffer.length / 1024);

  logger.info('[OCR] Preprocessed image', {
    label,
    original: `${originalInfo.width}x${originalInfo.height} ${originalSizeKB}KB`,
    processed: `${processedInfo.width}x${processedInfo.height} ${processedSizeKB}KB`,
  });

  return processedBuffer;
}

async function pdfToImages(pdfBuffer) {
  const pdfData = await pdfParse(pdfBuffer);
  const pageCount = pdfData.numpages || 1;
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const imgBuffer = await sharp(pdfBuffer, { page: i }).png().toBuffer();
    pages.push(imgBuffer);
  }

  logger.info('[OCR] PDF converted to images', { pageCount });
  return pages;
}

async function extractTextFromImages(files) {
  const allPageTexts = [];
  const allConfidences = [];

  for (let i = 0; i < files.length; i++) {
    const { buffer, mimeType } = files[i];
    const isPdf = mimeType === 'application/pdf';

    let imagesToOcr;
    if (isPdf) {
      imagesToOcr = await pdfToImages(buffer);
    } else {
      imagesToOcr = [buffer];
    }

    for (let j = 0; j < imagesToOcr.length; j++) {
      const imgBuffer = imagesToOcr[j];
      const count = isPdf ? `PDF page ${i + 1}.${j + 1}` : `Page ${i + 1}`;

      await checkImageQuality(imgBuffer, count);

      let ocrBuffer = imgBuffer;
      try {
        ocrBuffer = await preprocessImageForOCR(imgBuffer, count);
      } catch (prepErr) {
        logger.warn('[OCR] Preprocessing failed, using original', { page: count, error: prepErr.message });
      }

      const result = await Tesseract.recognize(ocrBuffer, 'eng');

      allPageTexts.push(`--- ${count} ---\n${result.data.text}`);
      allConfidences.push({ page: count, confidence: result.data.confidence });
    }
  }

  logger.info('[OCR] Extraction complete', {
    pageCount: allConfidences.length,
    confidences: allConfidences,
  });

  const combined = allPageTexts.join('\n\n');

  if (combined.trim().length < MIN_TEXT_LENGTH) {
    logger.warn('[OCR] Near-empty result', { text: combined.trim().slice(0, 200) });
    throw new Error('Could not read text from the image, please retake the photo with better lighting/focus');
  }

  return combined;
}

module.exports = { extractTextFromImages };

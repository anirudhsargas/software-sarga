/**
 * AI Design Error Detection Helper
 * Uses sharp (image metadata) and pdf-parse (PDF analysis) to check:
 * - Resolution (DPI)
 * - Color mode (RGB vs CMYK)
 * - Bleed area
 * - Image quality estimation
 */
const sharp = require('sharp');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

// ─── Constants ─────────────────────────────────────────────────

const MIN_DPI = 300;
const REQUIRED_COLOR_MODE = 'cmyk';
const MIN_BLEED_MM = 3;
const MM_PER_INCH = 25.4;

// Standard print sizes in mm
const STANDARD_SIZES = {
    'A5': { width: 148, height: 210 },
    'A4': { width: 210, height: 297 },
    'A3': { width: 297, height: 420 },
    'A2': { width: 420, height: 594 },
    'Letter': { width: 216, height: 279 },
    'Legal': { width: 216, height: 356 },
    'Business Card': { width: 89, height: 51 },
    'Visiting Card': { width: 90, height: 50 },
};

// ─── Image Analysis ────────────────────────────────────────────

async function analyzeImage(filePath) {
    const issues = [];
    const info = {};

    try {
        const metadata = await sharp(filePath).metadata();

        info.width = metadata.width;
        info.height = metadata.height;
        info.format = metadata.format;
        info.colorSpace = metadata.space || 'unknown';
        info.channels = metadata.channels;
        info.hasAlpha = metadata.hasAlpha || false;
        info.fileSize = (await fs.promises.stat(filePath)).size;
        info.fileSizeKB = Math.round(info.fileSize / 1024);

        // DPI check
        info.dpi = metadata.density || 72; // Default to 72 if not available
        if (info.dpi < MIN_DPI) {
            issues.push({
                type: 'LOW_RESOLUTION',
                severity: info.dpi < 150 ? 'CRITICAL' : 'WARNING',
                message: `Resolution: ${info.dpi} DPI (Minimum required: ${MIN_DPI} DPI)`,
                current: `${info.dpi} DPI`,
                required: `${MIN_DPI} DPI`,
                fix: 'Re-export or recreate the design at 300 DPI or higher'
            });
        }

        // Color mode check
        if (metadata.space && metadata.space !== 'cmyk') {
            issues.push({
                type: 'WRONG_COLOR_MODE',
                severity: 'WARNING',
                message: `Color Mode: ${metadata.space.toUpperCase()} (Should be CMYK for print)`,
                current: metadata.space.toUpperCase(),
                required: 'CMYK',
                fix: 'Convert to CMYK color mode in your design software before printing'
            });
        }

        // Image dimensions check (for very small images)
        const widthInch = metadata.width / (info.dpi || 72);
        const heightInch = metadata.height / (info.dpi || 72);
        info.widthMM = Math.round(widthInch * MM_PER_INCH);
        info.heightMM = Math.round(heightInch * MM_PER_INCH);

        if (metadata.width < 300 || metadata.height < 300) {
            issues.push({
                type: 'TOO_SMALL',
                severity: 'WARNING',
                message: `Image dimensions very small: ${metadata.width}×${metadata.height}px`,
                current: `${metadata.width}×${metadata.height}px`,
                fix: 'Use a higher resolution source image'
            });
        }

        // Quality estimation based on file size vs dimensions
        const pixelCount = metadata.width * metadata.height;
        const bytesPerPixel = info.fileSize / pixelCount;
        info.qualityEstimate = bytesPerPixel > 0.5 ? 'High' : bytesPerPixel > 0.2 ? 'Medium' : 'Low';

        if (info.qualityEstimate === 'Low') {
            issues.push({
                type: 'LOW_QUALITY',
                severity: 'WARNING',
                message: 'Image quality appears low (high compression detected)',
                current: 'Low quality / High compression',
                fix: 'Use a less compressed version of the image (PNG or high-quality JPEG)'
            });
        }

    } catch (err) {
        issues.push({
            type: 'ANALYSIS_ERROR',
            severity: 'CRITICAL',
            message: `Could not analyze image: ${err.message}`,
            fix: 'Ensure the file is a valid image format (JPG, PNG, WEBP, TIFF)'
        });
    }

    return {
        file_type: 'image',
        info,
        issues,
        passed: issues.filter(i => i.severity === 'CRITICAL').length === 0,
        total_issues: issues.length,
        critical_issues: issues.filter(i => i.severity === 'CRITICAL').length,
        warnings: issues.filter(i => i.severity === 'WARNING').length,
    };
}

// ─── PDF Analysis ──────────────────────────────────────────────

async function analyzePDF(filePath) {
    const issues = [];
    const info = {};

    try {
        const dataBuffer = await fs.promises.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);

        info.pageCount = pdfData.numpages;
        info.version = pdfData.info?.PDFFormatVersion || 'Unknown';
        info.title = pdfData.info?.Title || '';
        info.creator = pdfData.info?.Creator || '';
        info.producer = pdfData.info?.Producer || '';
        info.fileSize = dataBuffer.length;
        info.fileSizeKB = Math.round(dataBuffer.length / 1024);
        info.hasText = (pdfData.text || '').trim().length > 0;

        // Check for common PDF issues
        const rawText = pdfData.text || '';

        // Font embedding check (heuristic: check if Creator mentions common authoring tools)
        const creator = (info.creator || '').toLowerCase();
        const producer = (info.producer || '').toLowerCase();

        // If it has text, fonts should be embedded for print
        if (info.hasText) {
            info.fontsLikelyEmbedded = producer.includes('acrobat') ||
                producer.includes('illustrator') ||
                producer.includes('indesign') ||
                creator.includes('corel');
            if (!info.fontsLikelyEmbedded && !producer.includes('pdf')) {
                issues.push({
                    type: 'FONT_WARNING',
                    severity: 'WARNING',
                    message: 'Fonts may not be embedded. Convert all fonts to outlines for safe printing.',
                    fix: 'Open in your design software and convert all text to outlines/curves before exporting'
                });
            }
        }

        // Page size analysis (look for MediaBox in raw PDF)
        const mediaBoxMatch = dataBuffer.toString('ascii', 0, Math.min(dataBuffer.length, 50000))
            .match(/\/MediaBox\s*\[\s*(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s*\]/);

        if (mediaBoxMatch) {
            const pdfWidth = parseFloat(mediaBoxMatch[3]) - parseFloat(mediaBoxMatch[1]);
            const pdfHeight = parseFloat(mediaBoxMatch[4]) - parseFloat(mediaBoxMatch[2]);
            // PDF units are 1/72 inch
            info.widthMM = Math.round(pdfWidth / 72 * MM_PER_INCH);
            info.heightMM = Math.round(pdfHeight / 72 * MM_PER_INCH);
            info.widthInch = (pdfWidth / 72).toFixed(2);
            info.heightInch = (pdfHeight / 72).toFixed(2);

            // Check for bleed (compare to nearest standard size)
            let closestSize = null;
            let closestDiff = Infinity;
            for (const [name, size] of Object.entries(STANDARD_SIZES)) {
                const diff = Math.abs(info.widthMM - size.width) + Math.abs(info.heightMM - size.height);
                const diffRotated = Math.abs(info.widthMM - size.height) + Math.abs(info.heightMM - size.width);
                const minDiff = Math.min(diff, diffRotated);
                if (minDiff < closestDiff) {
                    closestDiff = minDiff;
                    closestSize = { name, ...size };
                }
            }

            if (closestSize && closestDiff < 20) {
                info.detectedSize = closestSize.name;
                // Check if bleed is included
                const expectedWidth = closestSize.width + (MIN_BLEED_MM * 2);
                const expectedHeight = closestSize.height + (MIN_BLEED_MM * 2);

                const hasBleed = info.widthMM >= expectedWidth || info.heightMM >= expectedHeight;
                info.hasBleed = hasBleed;

                if (!hasBleed) {
                    issues.push({
                        type: 'MISSING_BLEED',
                        severity: 'WARNING',
                        message: `Bleed area missing. Page is ${info.widthMM}×${info.heightMM}mm, expected ${expectedWidth}×${expectedHeight}mm for ${closestSize.name} with ${MIN_BLEED_MM}mm bleed.`,
                        current: `${info.widthMM}×${info.heightMM}mm`,
                        required: `${expectedWidth}×${expectedHeight}mm (with ${MIN_BLEED_MM}mm bleed)`,
                        fix: `Add ${MIN_BLEED_MM}mm bleed on all sides in your design software`
                    });
                }
            }
        }

        // TrimBox / BleedBox check
        const hasTrimBox = dataBuffer.toString('ascii', 0, Math.min(dataBuffer.length, 50000)).includes('/TrimBox');
        const hasBleedBox = dataBuffer.toString('ascii', 0, Math.min(dataBuffer.length, 50000)).includes('/BleedBox');
        info.hasTrimBox = hasTrimBox;
        info.hasBleedBox = hasBleedBox;

        if (!hasTrimBox && !hasBleedBox) {
            issues.push({
                type: 'NO_TRIM_BLEED_BOX',
                severity: 'INFO',
                message: 'No TrimBox or BleedBox defined. These help printers identify cut and bleed boundaries.',
                fix: 'Set trim and bleed marks when exporting your PDF'
            });
        }

    } catch (err) {
        issues.push({
            type: 'ANALYSIS_ERROR',
            severity: 'CRITICAL',
            message: `Could not analyze PDF: ${err.message}`,
            fix: 'Ensure the file is a valid PDF'
        });
    }

    return {
        file_type: 'pdf',
        info,
        issues,
        passed: issues.filter(i => i.severity === 'CRITICAL').length === 0,
        total_issues: issues.length,
        critical_issues: issues.filter(i => i.severity === 'CRITICAL').length,
        warnings: issues.filter(i => i.severity === 'WARNING').length,
    };
}

// ─── Unified Analyzer ─────────────────────────────────────────

async function analyzeDesign(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
        case '.jpg':
        case '.jpeg':
        case '.png':
        case '.webp':
        case '.tiff':
        case '.tif':
            return analyzeImage(filePath);

        case '.pdf':
            return analyzePDF(filePath);

        default:
            return {
                file_type: 'unsupported',
                info: { format: ext },
                issues: [{
                    type: 'UNSUPPORTED_FORMAT',
                    severity: 'CRITICAL',
                    message: `File format ${ext} is not supported. Supported: JPG, PNG, WEBP, TIFF, PDF`,
                    fix: 'Convert or export your design to a supported format'
                }],
                passed: false,
                total_issues: 1,
                critical_issues: 1,
                warnings: 0
            };
    }
}

module.exports = {
    analyzeDesign,
    analyzeImage,
    analyzePDF,
    STANDARD_SIZES,
    MIN_DPI,
    MIN_BLEED_MM
};

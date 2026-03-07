/**
 * AI Paper Layout Optimizer
 * Rectangle-packing algorithm to minimize paper waste.
 * Generates optimal layouts with cut marks using PDFKit.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Constants ─────────────────────────────────────────────────

const MM_TO_PT = 72 / 25.4;  // 1mm = 2.8346 points
const INCH_TO_MM = 25.4;

// Standard paper sizes in mm
const PAPER_SIZES = {
    'A5': { width: 148, height: 210 },
    'A4': { width: 210, height: 297 },
    'A3': { width: 297, height: 420 },
    'A2': { width: 420, height: 594 },
    'A1': { width: 594, height: 841 },
    'SRA3': { width: 320, height: 450 },
    'SRA4': { width: 225, height: 320 },
    'Letter': { width: 216, height: 279 },
    'Legal': { width: 216, height: 356 },
    'Tabloid': { width: 279, height: 432 },
    '12x18': { width: 305, height: 457 },
    '13x19': { width: 330, height: 483 },
};

// ─── Layout Calculation ────────────────────────────────────────

/**
 * Calculate how many items fit in a single orientation.
 */
function fitInOrientation(sheetW, sheetH, itemW, itemH, margin) {
    const usableW = sheetW - (margin * 2);
    const usableH = sheetH - (margin * 2);

    if (itemW <= 0 || itemH <= 0 || usableW <= 0 || usableH <= 0) return { cols: 0, rows: 0, count: 0 };

    const cols = Math.floor(usableW / itemW);
    const rows = Math.floor(usableH / itemH);

    return { cols, rows, count: cols * rows };
}

/**
 * Calculate the optimal layout for placing design cards on a sheet.
 * Tries both orientations (portrait and landscape) of the design
 * and also mixed layouts.
 */
function calculateLayout(sheetSize, designSize, bleed = 0, margin = 5, gutter = 2) {
    // Effective design size including bleed
    const designW = designSize.width + (bleed * 2);
    const designH = designSize.height + (bleed * 2);

    // Item size including gutter
    const itemW = designW + gutter;
    const itemH = designH + gutter;

    // Try design in normal orientation
    const normal = fitInOrientation(sheetSize.width, sheetSize.height, itemW, itemH, margin);

    // Try design rotated 90°
    const rotated = fitInOrientation(sheetSize.width, sheetSize.height, itemH, itemW, margin);

    // Choose the best option
    let best;
    let isRotated = false;

    if (rotated.count > normal.count) {
        best = rotated;
        isRotated = true;
    } else {
        best = normal;
    }

    // Calculate placements
    const placements = [];
    const actualItemW = isRotated ? itemH : itemW;
    const actualItemH = isRotated ? itemW : itemH;
    const actualDesignW = isRotated ? designH : designW;
    const actualDesignH = isRotated ? designW : designH;

    for (let row = 0; row < best.rows; row++) {
        for (let col = 0; col < best.cols; col++) {
            placements.push({
                x: margin + (col * actualItemW),
                y: margin + (row * actualItemH),
                width: actualDesignW,
                height: actualDesignH,
                rotated: isRotated
            });
        }
    }

    // Calculate waste
    const sheetArea = sheetSize.width * sheetSize.height;
    const usedArea = best.count * designW * designH;
    const wastePercent = ((sheetArea - usedArea) / sheetArea * 100).toFixed(1);

    return {
        sheet: { ...sheetSize },
        design: { ...designSize },
        bleed,
        margin,
        gutter,
        effective_design: { width: designW, height: designH },
        cards_per_sheet: best.count,
        rows: best.rows,
        cols: best.cols,
        is_rotated: isRotated,
        waste_percent: parseFloat(wastePercent),
        placements,
        usable_area: {
            width: sheetSize.width - (margin * 2),
            height: sheetSize.height - (margin * 2)
        }
    };
}

/**
 * Calculate total sheets needed for a given quantity.
 */
function calculateSheetsNeeded(cardsPerSheet, totalQuantity) {
    if (cardsPerSheet <= 0) return { sheets: 0, extra_cards: 0 };
    const sheets = Math.ceil(totalQuantity / cardsPerSheet);
    const extraCards = (sheets * cardsPerSheet) - totalQuantity;
    return { sheets, extra_cards: extraCards };
}

/**
 * Compare multiple sheet sizes to find the most efficient.
 */
function compareSizes(sheetSizes, designSize, bleed = 0, margin = 5, gutter = 2, quantity = 100) {
    const results = [];

    for (const [name, size] of Object.entries(sheetSizes)) {
        const layout = calculateLayout(size, designSize, bleed, margin, gutter);
        const sheetsInfo = calculateSheetsNeeded(layout.cards_per_sheet, quantity);

        results.push({
            paper_name: name,
            ...layout,
            ...sheetsInfo,
            total_quantity: quantity
        });
    }

    // Sort by waste percentage (ascending)
    results.sort((a, b) => a.waste_percent - b.waste_percent);

    return results;
}

// ─── PDF Generation ────────────────────────────────────────────

/**
 * Generate a print-ready layout PDF with cut marks.
 */
function generateLayoutPDF(layout, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: [layout.sheet.width * MM_TO_PT, layout.sheet.height * MM_TO_PT],
            margin: 0
        });

        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        const MARK_LENGTH = 5 * MM_TO_PT;  // 5mm crop marks
        const MARK_OFFSET = 1 * MM_TO_PT;   // 1mm offset from design edge

        // Draw background grid (light gray)
        doc.strokeColor('#e0e0e0').lineWidth(0.25);
        for (let x = 0; x <= layout.sheet.width; x += 10) {
            doc.moveTo(x * MM_TO_PT, 0).lineTo(x * MM_TO_PT, layout.sheet.height * MM_TO_PT).stroke();
        }
        for (let y = 0; y <= layout.sheet.height; y += 10) {
            doc.moveTo(0, y * MM_TO_PT).lineTo(layout.sheet.width * MM_TO_PT, y * MM_TO_PT).stroke();
        }

        // Draw sheet border
        doc.strokeColor('#999999').lineWidth(0.5)
            .rect(0, 0, layout.sheet.width * MM_TO_PT, layout.sheet.height * MM_TO_PT)
            .stroke();

        // Safe area border
        doc.strokeColor('#cccccc').lineWidth(0.3)
            .rect(
                layout.margin * MM_TO_PT,
                layout.margin * MM_TO_PT,
                (layout.sheet.width - layout.margin * 2) * MM_TO_PT,
                (layout.sheet.height - layout.margin * 2) * MM_TO_PT
            ).stroke();

        // Draw each design placement
        for (const p of layout.placements) {
            const px = p.x * MM_TO_PT;
            const py = p.y * MM_TO_PT;
            const pw = p.width * MM_TO_PT;
            const ph = p.height * MM_TO_PT;

            // Design area (light blue fill)
            doc.fillColor('#e3f2fd').strokeColor('#2196F3').lineWidth(0.5)
                .rect(px, py, pw, ph).fillAndStroke();

            // Draw crop marks at corners
            doc.strokeColor('#000000').lineWidth(0.3);

            // Top-left
            doc.moveTo(px - MARK_OFFSET, py).lineTo(px - MARK_OFFSET - MARK_LENGTH, py).stroke();
            doc.moveTo(px, py - MARK_OFFSET).lineTo(px, py - MARK_OFFSET - MARK_LENGTH).stroke();

            // Top-right
            doc.moveTo(px + pw + MARK_OFFSET, py).lineTo(px + pw + MARK_OFFSET + MARK_LENGTH, py).stroke();
            doc.moveTo(px + pw, py - MARK_OFFSET).lineTo(px + pw, py - MARK_OFFSET - MARK_LENGTH).stroke();

            // Bottom-left
            doc.moveTo(px - MARK_OFFSET, py + ph).lineTo(px - MARK_OFFSET - MARK_LENGTH, py + ph).stroke();
            doc.moveTo(px, py + ph + MARK_OFFSET).lineTo(px, py + ph + MARK_OFFSET + MARK_LENGTH).stroke();

            // Bottom-right
            doc.moveTo(px + pw + MARK_OFFSET, py + ph).lineTo(px + pw + MARK_OFFSET + MARK_LENGTH, py + ph).stroke();
            doc.moveTo(px + pw, py + ph + MARK_OFFSET).lineTo(px + pw, py + ph + MARK_OFFSET + MARK_LENGTH).stroke();

            // Label inside each card
            doc.fillColor('#1565C0').fontSize(6);
            const label = `${Math.round(p.width)}×${Math.round(p.height)}mm`;
            doc.text(label, px + 2, py + 2, { width: pw - 4, align: 'left' });
        }

        // Info text at bottom
        doc.fillColor('#333333').fontSize(8);
        const infoY = (layout.sheet.height - 3) * MM_TO_PT;
        doc.text(
            `Sheet: ${layout.sheet.width}×${layout.sheet.height}mm | ` +
            `Design: ${layout.design.width}×${layout.design.height}mm | ` +
            `Cards: ${layout.cards_per_sheet} | ` +
            `Waste: ${layout.waste_percent}% | ` +
            `Bleed: ${layout.bleed}mm | Margin: ${layout.margin}mm`,
            5 * MM_TO_PT, infoY,
            { width: (layout.sheet.width - 10) * MM_TO_PT, align: 'center' }
        );

        doc.end();

        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

// ─── Unit Conversion ───────────────────────────────────────────

function parseSize(input, unit = 'mm') {
    // Accept formats: "297x420", "297 x 420", "11.7x16.5 inch", object { width, height }
    if (typeof input === 'object' && input.width && input.height) {
        let w = parseFloat(input.width);
        let h = parseFloat(input.height);
        if (unit === 'inch' || unit === 'in') {
            w *= INCH_TO_MM;
            h *= INCH_TO_MM;
        }
        return { width: Math.round(w * 10) / 10, height: Math.round(h * 10) / 10 };
    }

    if (typeof input === 'string') {
        // Check paper size name first
        const upper = input.toUpperCase().trim();
        if (PAPER_SIZES[upper] || PAPER_SIZES[input.trim()]) {
            return PAPER_SIZES[upper] || PAPER_SIZES[input.trim()];
        }

        const match = input.match(/(\d+\.?\d*)\s*[x×]\s*(\d+\.?\d*)/i);
        if (match) {
            let w = parseFloat(match[1]);
            let h = parseFloat(match[2]);
            if (input.toLowerCase().includes('inch') || input.toLowerCase().includes('in') || unit === 'inch') {
                w *= INCH_TO_MM;
                h *= INCH_TO_MM;
            }
            return { width: Math.round(w * 10) / 10, height: Math.round(h * 10) / 10 };
        }
    }

    return null;
}

module.exports = {
    PAPER_SIZES,
    calculateLayout,
    calculateSheetsNeeded,
    compareSizes,
    generateLayoutPDF,
    parseSize,
    MM_TO_PT,
    INCH_TO_MM
};

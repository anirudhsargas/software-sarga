/**
 * Paper Size Optimization Utility for Printing Shops
 *
 * Calculates the optimal way to fit smaller print items on larger sheets,
 * minimizing paper waste. Supports standard sizes + custom dimensions.
 *
 * Usage:
 *   import { optimizePaperUsage, PAPER_SIZES } from '../utils/paperOptimizer';
 *   const result = optimizePaperUsage({ sheetSize: 'A3', itemSize: 'A5', itemCount: 100 });
 *   // result = { sheetsNeeded, itemsPerSheet, totalPrinted, waste%, layout, ... }
 */

// All dimensions in mm (width × height, portrait orientation)
export const PAPER_SIZES = {
  // ISO A Series
  'A0': { w: 841, h: 1189, label: 'A0 (841×1189 mm)' },
  'A1': { w: 594, h: 841,  label: 'A1 (594×841 mm)' },
  'A2': { w: 420, h: 594,  label: 'A2 (420×594 mm)' },
  'A3': { w: 297, h: 420,  label: 'A3 (297×420 mm)' },
  'A4': { w: 210, h: 297,  label: 'A4 (210×297 mm)' },
  'A5': { w: 148, h: 210,  label: 'A5 (148×210 mm)' },
  'A6': { w: 105, h: 148,  label: 'A6 (105×148 mm)' },
  'A7': { w: 74,  h: 105,  label: 'A7 (74×105 mm)' },
  // ISO B Series
  'B3': { w: 353, h: 500,  label: 'B3 (353×500 mm)' },
  'B4': { w: 250, h: 353,  label: 'B4 (250×353 mm)' },
  'B5': { w: 176, h: 250,  label: 'B5 (176×250 mm)' },
  // US Sizes
  'Letter':  { w: 216, h: 279, label: 'Letter (8.5×11 in)' },
  'Legal':   { w: 216, h: 356, label: 'Legal (8.5×14 in)' },
  'Tabloid': { w: 279, h: 432, label: 'Tabloid (11×17 in)' },
  // Indian common sizes
  '1/4 Demy':  { w: 254, h: 381, label: '1/4 Demy (10×15 in)' },
  '1/8 Demy':  { w: 190, h: 254, label: '1/8 Demy (7.5×10 in)' },
  'Demy':      { w: 508, h: 762, label: 'Demy (20×30 in)' },
  'Double Demy': { w: 508, h: 762, label: 'Double Demy (20×30 in)' },
  'Crown':     { w: 381, h: 508, label: 'Crown (15×20 in)' },
  // Business card & envelope
  'Business Card': { w: 89, h: 51, label: 'Business Card (89×51 mm)' },
  'DL Envelope':   { w: 110, h: 220, label: 'DL Envelope (110×220 mm)' },
  // Common printing press sheet sizes
  'SRA3': { w: 320, h: 450, label: 'SRA3 (320×450 mm)' },
  'SRA2': { w: 450, h: 640, label: 'SRA2 (450×640 mm)' },
  'SRA1': { w: 640, h: 900, label: 'SRA1 (640×900 mm)' },
};

// Common sheet sizes used as source paper
export const SHEET_SIZES = ['SRA1', 'SRA2', 'SRA3', 'A0', 'A1', 'A2', 'A3', 'Demy', 'Crown', 'Double Demy', 'Tabloid', 'Legal', 'Letter', 'A4'];

// Common item sizes to print on
export const ITEM_SIZES = ['A3', 'A4', 'A5', 'A6', 'A7', 'B4', 'B5', 'Letter', 'Legal', '1/4 Demy', '1/8 Demy', 'Business Card', 'DL Envelope'];

/**
 * Count how many items of (iw × ih) fit on a sheet of (sw × sh).
 * Tries both portrait and landscape orientations of the item.
 * Includes optional bleed/gutter margin.
 */
function countFit(sw, sh, iw, ih, bleed = 0) {
  const ew = iw + bleed; // effective item width with bleed
  const eh = ih + bleed;

  // Portrait placement
  const colsP = Math.floor(sw / ew);
  const rowsP = Math.floor(sh / eh);
  const fitPortrait = colsP * rowsP;

  // Landscape placement (rotate item 90°)
  const colsL = Math.floor(sw / eh);
  const rowsL = Math.floor(sh / ew);
  const fitLandscape = colsL * rowsL;

  // Mixed: portrait fill + landscape in remaining strip
  // Horizontal remaining strip after portrait placement
  const remainW_h = sw - colsP * ew;
  const remainH_v = sh - rowsP * eh;

  // Try fitting rotated items in the right strip
  const fitRightStrip = remainW_h >= eh ? Math.floor(remainW_h / eh) * Math.floor(sh / ew) : 0;
  // Try fitting rotated items in the bottom strip
  const fitBottomStrip = remainH_v >= ew ? Math.floor(sw / eh) * Math.floor(remainH_v / ew) : 0;

  const fitMixed1 = fitPortrait + Math.max(fitRightStrip, fitBottomStrip);

  // Reverse: landscape fill + portrait in remaining
  const remainW_h2 = sw - colsL * eh;
  const remainH_v2 = sh - rowsL * ew;
  const fitRightStrip2 = remainW_h2 >= ew ? Math.floor(remainW_h2 / ew) * Math.floor(sh / eh) : 0;
  const fitBottomStrip2 = remainH_v2 >= ih ? Math.floor(sw / ew) * Math.floor(remainH_v2 / eh) : 0;
  const fitMixed2 = fitLandscape + Math.max(fitRightStrip2, fitBottomStrip2);

  const results = [
    { count: fitPortrait, layout: 'portrait', cols: colsP, rows: rowsP },
    { count: fitLandscape, layout: 'landscape', cols: colsL, rows: rowsL },
    { count: fitMixed1, layout: 'mixed', cols: colsP, rows: rowsP },
    { count: fitMixed2, layout: 'mixed-alt', cols: colsL, rows: rowsL },
  ];

  return results.reduce((best, r) => r.count > best.count ? r : best, results[0]);
}

/**
 * Main optimization function.
 *
 * @param {Object} params
 * @param {string}  params.sheetSize   - Standard size name OR 'Custom'
 * @param {number} [params.sheetW]     - Custom sheet width (mm)
 * @param {number} [params.sheetH]     - Custom sheet height (mm)
 * @param {string}  params.itemSize    - Standard size name OR 'Custom'
 * @param {number} [params.itemW]      - Custom item width (mm)
 * @param {number} [params.itemH]      - Custom item height (mm)
 * @param {number}  params.itemCount   - How many items to print
 * @param {number} [params.bleed=0]    - Bleed/gutter margin in mm
 * @param {boolean}[params.doubleSide=false] - If true, items are printed both sides
 * @returns {Object} Optimization result
 */
export function optimizePaperUsage({
  sheetSize,
  sheetW,
  sheetH,
  itemSize,
  itemW,
  itemH,
  itemCount,
  bleed = 0,
  doubleSide = false,
}) {
  // Resolve sheet dimensions
  let sw, sh;
  if (sheetSize === 'Custom') {
    sw = Number(sheetW) || 0;
    sh = Number(sheetH) || 0;
  } else {
    const s = PAPER_SIZES[sheetSize];
    if (!s) return { error: 'Unknown sheet size' };
    sw = s.w;
    sh = s.h;
  }

  // Resolve item dimensions
  let iw, ih;
  if (itemSize === 'Custom') {
    iw = Number(itemW) || 0;
    ih = Number(itemH) || 0;
  } else {
    const s = PAPER_SIZES[itemSize];
    if (!s) return { error: 'Unknown item size' };
    iw = s.w;
    ih = s.h;
  }

  if (sw <= 0 || sh <= 0 || iw <= 0 || ih <= 0) {
    return { error: 'Dimensions must be positive' };
  }
  if (iw > sw && iw > sh && ih > sw && ih > sh) {
    return { error: 'Item is larger than the sheet' };
  }

  const count = Math.max(1, Math.round(Number(itemCount) || 1));
  const best = countFit(sw, sh, iw, ih, Number(bleed) || 0);
  const itemsPerSheet = best.count;

  if (itemsPerSheet === 0) {
    return { error: 'Item does not fit on this sheet' };
  }

  // If double-sided, each physical sheet prints 2× items
  const effectivePerSheet = doubleSide ? itemsPerSheet * 2 : itemsPerSheet;
  const sheetsNeeded = Math.ceil(count / effectivePerSheet);
  const totalPrinted = sheetsNeeded * effectivePerSheet;
  const extraPrints = totalPrinted - count;

  // Area calculations
  const sheetArea = sw * sh;
  const itemArea = iw * ih;
  const usedAreaPerSheet = itemsPerSheet * itemArea;
  const wasteAreaPerSheet = sheetArea - usedAreaPerSheet;
  const wastePercent = ((wasteAreaPerSheet / sheetArea) * 100);
  const utilizationPercent = 100 - wastePercent;

  return {
    // Core results
    sheetsNeeded,
    itemsPerSheet,
    effectivePerSheet,
    totalPrinted,
    extraPrints,
    layout: best.layout,
    cols: best.cols,
    rows: best.rows,

    // Dimensions used
    sheetW: sw,
    sheetH: sh,
    itemW: iw,
    itemH: ih,

    // Waste analysis
    sheetArea,
    usedAreaPerSheet,
    wasteAreaPerSheet,
    wastePercent: Math.round(wastePercent * 10) / 10,
    utilizationPercent: Math.round(utilizationPercent * 10) / 10,

    // Display helpers
    summary: `${count} × ${itemSize === 'Custom' ? `${iw}×${ih}mm` : itemSize} on ${sheetSize === 'Custom' ? `${sw}×${sh}mm` : sheetSize}`,
    breakdown: `${itemsPerSheet} per sheet${doubleSide ? ' (×2 double-side)' : ''} → ${sheetsNeeded} sheet${sheetsNeeded !== 1 ? 's' : ''} needed`,
  };
}

/**
 * Find the best sheet size for a given item + quantity.
 * Returns an array of options sorted by waste% ascending.
 */
export function findBestSheetSize({ itemSize, itemW, itemH, itemCount, bleed = 0, doubleSide = false }) {
  const results = [];

  for (const size of SHEET_SIZES) {
    const r = optimizePaperUsage({
      sheetSize: size,
      itemSize,
      itemW,
      itemH,
      itemCount,
      bleed,
      doubleSide,
    });
    if (!r.error) {
      results.push({ sheetSize: size, label: PAPER_SIZES[size].label, ...r });
    }
  }

  return results.sort((a, b) => a.wastePercent - b.wastePercent);
}

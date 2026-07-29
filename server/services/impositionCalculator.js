function calculateImposition({ sheetWidth, sheetHeight, gripperMargin, sideMargin, trimWidth, trimHeight, bleed, gutter }) {
  const usableWidth = sheetWidth - (2 * sideMargin);
  const usableHeight = sheetHeight - gripperMargin - sideMargin;

  const slotW = trimWidth + (2 * bleed) + gutter;
  const slotH = trimHeight + (2 * bleed) + gutter;

  const portrait = {
    orientation: 'portrait',
    cols: Math.floor(usableWidth / slotW),
    rows: Math.floor(usableHeight / slotH),
  };
  portrait.nUp = portrait.cols * portrait.rows;
  portrait.leftoverWidth = usableWidth - (portrait.cols * slotW);
  portrait.leftoverHeight = usableHeight - (portrait.rows * slotH);

  const landscape = {
    orientation: 'landscape',
    cols: Math.floor(usableWidth / slotH),
    rows: Math.floor(usableHeight / slotW),
  };
  landscape.nUp = landscape.cols * landscape.rows;
  landscape.leftoverWidth = usableWidth - (landscape.cols * slotH);
  landscape.leftoverHeight = usableHeight - (landscape.rows * slotW);

  const best = portrait.nUp >= landscape.nUp ? portrait : landscape;
  return { portrait, landscape, best };
}

function suggestQuantityBreakpoints({ nUp, orderQty, breakpoints = [500, 1000, 1500, 2000, 3000, 5000] }) {
  const currentSheets = Math.ceil(orderQty / nUp);
  const currentYield = currentSheets * nUp;

  const nextBreakpoint = breakpoints.find(b => b > orderQty);
  let upsell = null;
  if (nextBreakpoint) {
    const nextSheets = Math.ceil(nextBreakpoint / nUp);
    const nextYield = nextSheets * nUp;
    upsell = {
      targetQty: nextBreakpoint,
      extraSheets: nextSheets - currentSheets,
      yieldQty: nextYield,
    };
  }

  return { currentSheets, currentYield, spoilage: currentYield - orderQty, upsell };
}

module.exports = { calculateImposition, suggestQuantityBreakpoints };

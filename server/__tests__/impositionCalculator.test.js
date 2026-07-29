const { calculateImposition, suggestQuantityBreakpoints } = require('../services/impositionCalculator');

describe('calculateImposition', () => {
  // Fixture 1: A4 notice (210x297mm) on SRA3 (320x450mm)
  // Usable: 320-10 = 310w, 450-10-5 = 435h
  // Slot: 210+6+4=220w, 297+6+4=307h
  // Portrait: cols=floor(310/220)=1, rows=floor(435/307)=1 => 1-up
  // Landscape: cols=floor(310/307)=1, rows=floor(435/220)=1 => 1-up
  test('A4 notice on SRA3 — 1-up both orientations', () => {
    const result = calculateImposition({
      sheetWidth: 320, sheetHeight: 450,
      gripperMargin: 10, sideMargin: 5,
      trimWidth: 210, trimHeight: 297,
      bleed: 3, gutter: 4,
    });

    expect(result.portrait.cols).toBe(1);
    expect(result.portrait.rows).toBe(1);
    expect(result.portrait.nUp).toBe(1);
    expect(result.landscape.cols).toBe(1);
    expect(result.landscape.rows).toBe(1);
    expect(result.landscape.nUp).toBe(1);
    expect(result.best.nUp).toBe(1);
  });

  // Fixture 2: A5 (148x210mm) on SRA3 (320x450mm)
  // Slot: 148+6+4=158w, 210+6+4=220h
  // Portrait: cols=floor(310/158)=1, rows=floor(435/220)=1 => 1-up
  // Actually let me recalculate: 
  // Usable: 320-10=310w, 450-10-5=435h
  // Portrait slot: 148+6+4=158, 210+6+4=220
  //   cols=floor(310/158)=1, rows=floor(435/220)=1 => 1
  // Landscape slot: 220w, 158h
  //   cols=floor(310/220)=1, rows=floor(435/158)=2 => 2-up
  test('A5 on SRA3 — landscape gives 2-up', () => {
    const result = calculateImposition({
      sheetWidth: 320, sheetHeight: 450,
      gripperMargin: 10, sideMargin: 5,
      trimWidth: 148, trimHeight: 210,
      bleed: 3, gutter: 4,
    });

    expect(result.portrait.nUp).toBe(1);
    expect(result.landscape.nUp).toBe(2);
    expect(result.best.orientation).toBe('landscape');
    expect(result.best.nUp).toBe(2);
  });

  // Fixture 3: Standard visiting card (90x50mm) on 19x25" (482.6x635mm)
  // Convert: sheet 482.6x635mm
  // Usable: 482.6-10=472.6w, 635-10-5=620h
  // Slot: 90+6+4=100w, 50+6+4=60h
  // Portrait: cols=floor(472.6/100)=4, rows=floor(620/60)=10 => 40
  // Landscape: cols=floor(472.6/60)=7, rows=floor(620/100)=6 => 42
  test('visiting card 90x50 on 19x25 — landscape 42-up beats portrait 40-up', () => {
    const result = calculateImposition({
      sheetWidth: 482.6, sheetHeight: 635,
      gripperMargin: 10, sideMargin: 5,
      trimWidth: 90, trimHeight: 50,
      bleed: 3, gutter: 4,
    });

    expect(result.portrait.nUp).toBe(40);
    expect(result.landscape.nUp).toBe(42);
    expect(result.best.orientation).toBe('landscape');
    expect(result.best.nUp).toBe(42);
  });

  // Fixture 4: Square card (150x150mm) on SRA3
  test('square 150x150 on SRA3', () => {
    const result = calculateImposition({
      sheetWidth: 320, sheetHeight: 450,
      gripperMargin: 10, sideMargin: 5,
      trimWidth: 150, trimHeight: 150,
      bleed: 3, gutter: 4,
    });

    // Slot: 150+6+4=160 x 160
    // Portrait: cols=floor(310/160)=1, rows=floor(435/160)=2 => 2
    // Landscape: same => 2
    expect(result.portrait.nUp).toBe(2);
    expect(result.landscape.nUp).toBe(2);
    expect(result.best.nUp).toBe(2);
  });
});

describe('suggestQuantityBreakpoints', () => {
  test('500 cards at 42-up', () => {
    const result = suggestQuantityBreakpoints({ nUp: 42, orderQty: 500 });

    expect(result.currentSheets).toBe(12);   // ceil(500/42) = 12
    expect(result.currentYield).toBe(504);    // 12*42
    expect(result.spoilage).toBe(4);          // 504-500
    expect(result.upsell).not.toBeNull();
    expect(result.upsell.targetQty).toBe(1000);
    expect(result.upsell.extraSheets).toBe(12); // ceil(1000/42)=24, 24-12=12
    expect(result.upsell.yieldQty).toBe(1008);  // 24*42
  });

  test('2000 cards at 4-up — no upsell above max breakpoint', () => {
    const result = suggestQuantityBreakpoints({
      nUp: 4, orderQty: 2000,
      breakpoints: [500, 1000, 1500, 2000],
    });

    expect(result.currentSheets).toBe(500);
    expect(result.currentYield).toBe(2000);
    expect(result.spoilage).toBe(0);
    expect(result.upsell).toBeNull();
  });

  test('exact breakpoint — upsell to next above', () => {
    const result = suggestQuantityBreakpoints({ nUp: 10, orderQty: 1000 });

    expect(result.currentSheets).toBe(100);
    expect(result.currentYield).toBe(1000);
    expect(result.spoilage).toBe(0);
    expect(result.upsell).not.toBeNull();
    expect(result.upsell.targetQty).toBe(1500);
  });

  test('below first breakpoint', () => {
    const result = suggestQuantityBreakpoints({ nUp: 10, orderQty: 50 });

    expect(result.currentSheets).toBe(5);
    expect(result.currentYield).toBe(50);
    expect(result.spoilage).toBe(0);
    expect(result.upsell).not.toBeNull();
    expect(result.upsell.targetQty).toBe(500);
  });
});

/**
 * Paper Layout Routes — AI Paper Layout Generator
 */
const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const {
    PAPER_SIZES,
    calculateLayout,
    calculateSheetsNeeded,
    compareSizes,
    generateLayoutPDF,
    parseSize
} = require('../helpers/layoutOptimizer');
const path = require('path');
const fs = require('fs');

// Ensure output directory exists
const layoutOutputDir = path.join(__dirname, '..', 'uploads', 'layouts');
if (!fs.existsSync(layoutOutputDir)) {
    fs.mkdirSync(layoutOutputDir, { recursive: true });
}

// ─── POST /calculate — Calculate optimal layout ─────────────
router.post('/calculate', authenticateToken, asyncHandler(async (req, res) => {
    const { sheet_size, design_size, bleed = 0, margin = 5, gutter = 2, quantity = 100, unit = 'mm' } = req.body;

    if (!sheet_size || !design_size) {
        return res.status(400).json({
            message: 'Both sheet_size and design_size are required. Provide as {width, height} or string like "A3"'
        });
    }

    const sheet = parseSize(sheet_size, unit);
    const design = parseSize(design_size, unit);

    if (!sheet || !design) {
        return res.status(400).json({ message: 'Invalid size format. Use {width, height} or standard name (A3, A4, etc.)' });
    }

    const layout = calculateLayout(sheet, design, bleed, margin, gutter);
    const sheetsNeeded = calculateSheetsNeeded(layout.cards_per_sheet, quantity);

    res.json({
        ...layout,
        ...sheetsNeeded,
        total_quantity: quantity,
        unit: 'mm'
    });
}));

// ─── POST /compare — Compare multiple sheet sizes ───────────
router.post('/compare', authenticateToken, asyncHandler(async (req, res) => {
    const { design_size, bleed = 0, margin = 5, gutter = 2, quantity = 100, unit = 'mm', paper_sizes } = req.body;

    if (!design_size) {
        return res.status(400).json({ message: 'design_size is required' });
    }

    const design = parseSize(design_size, unit);
    if (!design) {
        return res.status(400).json({ message: 'Invalid design size format' });
    }

    // Use custom paper sizes or defaults
    let sizesToCompare = PAPER_SIZES;
    if (paper_sizes && typeof paper_sizes === 'object') {
        sizesToCompare = {};
        for (const [name, size] of Object.entries(paper_sizes)) {
            const parsed = parseSize(size, unit);
            if (parsed) sizesToCompare[name] = parsed;
        }
    }

    const results = compareSizes(sizesToCompare, design, bleed, margin, gutter, quantity);

    res.json({
        design,
        quantity,
        comparisons: results,
        best: results[0] || null
    });
}));

// ─── POST /generate-pdf — Generate print-ready layout PDF ──
router.post('/generate-pdf', authenticateToken, asyncHandler(async (req, res) => {
    const { sheet_size, design_size, bleed = 0, margin = 5, gutter = 2, unit = 'mm' } = req.body;

    if (!sheet_size || !design_size) {
        return res.status(400).json({ message: 'Both sheet_size and design_size are required' });
    }

    const sheet = parseSize(sheet_size, unit);
    const design = parseSize(design_size, unit);

    if (!sheet || !design) {
        return res.status(400).json({ message: 'Invalid size format' });
    }

    const layout = calculateLayout(sheet, design, bleed, margin, gutter);

    if (layout.cards_per_sheet === 0) {
        return res.status(400).json({ message: 'Design is too large for the selected sheet size' });
    }

    const filename = `layout-${Date.now()}.pdf`;
    const outputPath = path.join(layoutOutputDir, filename);

    await generateLayoutPDF(layout, outputPath);

    res.json({
        ...layout,
        pdf_url: `/uploads/layouts/${filename}`,
        message: 'Layout PDF generated successfully'
    });
}));

// ─── GET /paper-sizes — List standard paper sizes ───────────
router.get('/paper-sizes', authenticateToken, asyncHandler(async (req, res) => {
    const sizes = Object.entries(PAPER_SIZES).map(([name, size]) => ({
        name,
        width: size.width,
        height: size.height,
        label: `${name} (${size.width}×${size.height}mm)`
    }));

    res.json({ sizes });
}));

module.exports = router;

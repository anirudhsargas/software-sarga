/**
 * AI Search Routes — Smart Natural Language Search
 */
const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const { unifiedSearch, autocomplete } = require('../helpers/smartSearch');

// ─── GET /search — Unified search endpoint ──────────────────
router.get('/search', authenticateToken, asyncHandler(async (req, res) => {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
        return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const results = await unifiedSearch(q.trim());
    res.json(results);
}));

// ─── GET /search/suggestions — Autocomplete ─────────────────
router.get('/search/suggestions', authenticateToken, asyncHandler(async (req, res) => {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
        return res.json({ suggestions: [] });
    }

    const suggestions = await autocomplete(q.trim());
    res.json({ suggestions });
}));

module.exports = router;

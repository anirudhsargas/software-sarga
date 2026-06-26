/**
 * /api/ai/seasonal — Seasonal analysis route
 *
 * GET /api/ai/seasonal — return cached or freshly-generated seasonal data
 *
 * Calls the Python ML service for STL decomposition, caches in sarga_ai_cache
 * for 30 days (recomputed monthly). Never returns 500.
 */
const router = require('express').Router();
const axios = require('axios');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 30_000; // 30 s — STL can be slow on large datasets
const CACHE_KEY = 'seasonal_analysis';
const CACHE_TTL_HOURS = 30 * 24; // 30 days

// ── Cache helpers (reuse ai_cache table) ─────────────────────────────────────

async function getCached() {
    try {
        const [rows] = await pool.query(
            `SELECT cache_value, expires_at FROM sarga_ai_cache
             WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1`,
            [CACHE_KEY]
        );
        if (rows.length > 0) {
            return typeof rows[0].cache_value === 'string'
                ? JSON.parse(rows[0].cache_value)
                : rows[0].cache_value;
        }
    } catch (err) {
        console.error('[Seasonal] Cache read error:', err.message);
    }
    return null;
}

async function setCache(data) {
    try {
        const value = JSON.stringify(data);
        await pool.query(
            `INSERT INTO sarga_ai_cache (cache_key, cache_value, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
             ON DUPLICATE KEY UPDATE cache_value = VALUES(cache_value),
                                     expires_at  = VALUES(expires_at)`,
            [CACHE_KEY, value, CACHE_TTL_HOURS]
        );
    } catch (err) {
        console.error('[Seasonal] Cache write error:', err.message);
    }
}

// ── Call Python ML service ───────────────────────────────────────────────────

async function computeSeasonal() {
    if (process.env.ENABLE_ML === 'false') {
        console.log('[AI_DISABLED] ML skipped');
        return {
            enabled: false,
            peak_months: [], slow_months: [],
            best_day_of_week: 'N/A', worst_day_of_week: 'N/A',
            seasonal_index: {}, yoy_growth_percent: 0,
            trend_direction: 'stable', source: 'unavailable',
        };
    }
    try {
        const res = await axios.post(`${ML_URL}/seasonal-analysis`, {}, {
            timeout: ML_TIMEOUT,
            headers: { 'Content-Type': 'application/json' },
        });
        const data = res.data || {};
        data.generated_at = data.generated_at || new Date().toISOString();
        await setCache(data);
        console.log(`[Seasonal] Analysis computed — trend: ${data.trend_direction}, peak: ${(data.peak_months || []).join(', ')}`);
        return data;
    } catch (err) {
        console.error('[Seasonal] ML service error:', err.message);
        const cached = await getCached();
        return cached || {
            peak_months: [], slow_months: [],
            best_day_of_week: 'N/A', worst_day_of_week: 'N/A',
            seasonal_index: {}, yoy_growth_percent: 0,
            trend_direction: 'stable', source: 'unavailable',
        };
    }
}

// ── GET /api/ai/seasonal ────────────────────────────────────────────────────

router.get(
    '/seasonal',
    authenticateToken,
    authorizeRoles('Admin', 'Accountant', 'Front Office'),
    async (req, res) => {
        try {
            if (req.query.refresh === '1') {
                const data = await computeSeasonal();
                return res.json(data);
            }

            const cached = await getCached();
            if (cached) return res.json(cached);

            const data = await computeSeasonal();
            res.json(data);
        } catch (err) {
            console.error('[GET /ai/seasonal]', err.message);
            res.json({
                peak_months: [], slow_months: [],
                best_day_of_week: 'N/A', worst_day_of_week: 'N/A',
                seasonal_index: {}, yoy_growth_percent: 0,
                trend_direction: 'stable', source: 'error',
            });
        }
    }
);

module.exports = router;
module.exports.computeSeasonal = computeSeasonal;

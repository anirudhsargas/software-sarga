/**
 * /api/ai/order-forecast — ML-based order forecast route
 *
 * GET /api/ai/order-forecast?branch=all&horizon=7
 *
 * Calls the Python ML service (/predict-orders) and caches the result
 * for 6 hours. Falls back to cache if the ML service is unreachable.
 */
const router = require('express').Router();
const axios = require('../helpers/mlAxios');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 20_000; // shorten timeout so page load remains responsive
const CACHE_TTL_HOURS = 6;

function cacheKey(branch, horizon) {
    return `order_forecast_${branch}_${horizon}`;
}

async function getCached(key) {
    try {
        const [rows] = await pool.query(
            `SELECT cache_value FROM sarga_ai_cache
             WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1`,
            [key]
        );
        if (rows.length > 0) {
            return typeof rows[0].cache_value === 'string'
                ? JSON.parse(rows[0].cache_value)
                : rows[0].cache_value;
        }
    } catch (err) {
        console.error('[OrderForecast] Cache read error:', err.message);
    }
    return null;
}

async function setCache(key, data) {
    try {
        const value = JSON.stringify(data);
        await pool.query(
            `INSERT INTO sarga_ai_cache (cache_key, cache_value, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
             ON DUPLICATE KEY UPDATE cache_value = VALUES(cache_value),
                                     expires_at  = VALUES(expires_at)`,
            [key, value, CACHE_TTL_HOURS]
        );
    } catch (err) {
        console.error('[OrderForecast] Cache write error:', err.message);
    }
}

// ── GET /api/ai/order-forecast ───────────────────────────────────────────────

router.get('/',
    authenticateToken,
    authorizeRoles('Admin', 'Front Office', 'Accountant'),
    async (req, res) => {
        try {
            const branch = req.query.branch || 'all';
            const horizon = parseInt(req.query.horizon, 10) || 7;
            const refresh = req.query.refresh === 'true';
            const key = cacheKey(branch, horizon);

            if (!refresh) {
                const cached = await getCached(key);
                if (cached) return res.json({ ...cached, _fromCache: true });
            }

            // Fetch branch names for enrichment
            const [branches] = await pool.query('SELECT id, name, short_name FROM sarga_branches');
            const branchMap = {};
            for (const b of branches) branchMap[b.id] = b;

            const mlRes = await axios.post(`${ML_URL}/predict-orders`, {
                branch, horizon,
            }, {
                timeout: ML_TIMEOUT,
                headers: { 'Content-Type': 'application/json' },
            });

            const data = mlRes.data;

            // Enrich predictions with branch names
            if (data.predictions) {
                for (const p of data.predictions) {
                    const b = branchMap[p.branch_id];
                    if (b) {
                        p.branch_name = b.name;
                        p.branch_short = b.short_name;
                    }
                }
            }
            if (data.peak_day_this_week) {
                const b = branchMap[data.peak_day_this_week.branch_id];
                if (b) {
                    data.peak_day_this_week.branch_name = b.name;
                    data.peak_day_this_week.branch_short = b.short_name;
                }
            }

            data.generated_at = new Date().toISOString();
            await setCache(key, data);
            res.json(data);

        } catch (err) {
            console.error('[OrderForecast] Error:', err.message);

            // Fallback to any cached version
            const key = cacheKey(req.query.branch || 'all', parseInt(req.query.horizon, 10) || 7);
            try {
                const [rows] = await pool.query(
                    'SELECT cache_value FROM sarga_ai_cache WHERE cache_key = ? LIMIT 1',
                    [key]
                );
                if (rows.length > 0) {
                    const fallback = typeof rows[0].cache_value === 'string'
                        ? JSON.parse(rows[0].cache_value) : rows[0].cache_value;
                    fallback._fromCache = true;
                    return res.json(fallback);
                }
            } catch (_) { /* ignore */ }

            return res.json({
                predictions: [],
                peak_day_this_week: null,
                model_type: 'unavailable',
                model_accuracy: null,
                error: 'Order forecast service unavailable',
            });
        }
    }
);

module.exports = router;

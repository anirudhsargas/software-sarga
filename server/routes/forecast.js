/**
 * /api/ai/forecast — ML-powered daily revenue forecast
 *
 * GET /api/ai/forecast?branch=all&days=30
 *
 * Calls Python Flask service POST /predict-sales on port 5001.
 * If the ML service is down, returns cached / fallback data — never 500.
 */
const router = require('express').Router();
const axios = require('../helpers/mlAxios');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 30_000; // 30 s — training can be slow

// ── In-memory cache ──────────────────────────────────────────────────────────
let cachedForecast = {
    forecast: [],
    model_accuracy: 0,
    model_type: 'none',
    top_features: [],
    actual_revenue: [],
    fetchedAt: null,
};

// ── Gather recent actual revenue for the chart overlay ───────────────────────
async function getActualRevenue(days = 30) {
    const [rows] = await pool.query(`
        SELECT DATE(created_at) AS date,
               branch_id,
               SUM(total_amount) AS revenue
        FROM sarga_jobs
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND status != 'Cancelled'
        GROUP BY DATE(created_at), branch_id
        ORDER BY date
    `, [days]);
    return rows.map(r => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
        revenue: Number(r.revenue),
        branch_id: r.branch_id,
    }));
}

// ── GET /api/ai/forecast ─────────────────────────────────────────────────────
router.get('/', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const days = Math.min(parseInt(req.query.days) || 30, 90);
        const branchFilter = req.query.branch || 'all';

        // If cache is fresh (< 15 min), return it
        const staleMs = 15 * 60 * 1000;
        if (cachedForecast.fetchedAt && (Date.now() - new Date(cachedForecast.fetchedAt).getTime()) < staleMs) {
            return res.json(_filterByBranch(cachedForecast, branchFilter));
        }

        // Call Python ML service
        let mlResult;
        try {
            const mlRes = await axios.post(`${ML_URL}/predict-sales`, { days }, {
                timeout: ML_TIMEOUT,
                headers: { 'Content-Type': 'application/json' },
            });
            mlResult = mlRes.data;
        } catch (err) {
            console.error('[Forecast] ML service error:', err.message);
            // Return cached data if available
            if (cachedForecast.fetchedAt) {
                return res.json(_filterByBranch(cachedForecast, branchFilter));
            }
            return res.json({
                forecast: [],
                model_accuracy: 0,
                model_type: 'unavailable',
                top_features: [],
                actual_revenue: [],
                error: 'ML service temporarily unavailable',
            });
        }

        // Fetch actual revenue for chart overlay
        let actual = [];
        try {
            actual = await getActualRevenue(days);
        } catch (err) {
            console.error('[Forecast] Actual revenue query failed:', err.message);
        }

        cachedForecast = {
            ...mlResult,
            actual_revenue: actual,
            fetchedAt: new Date().toISOString(),
        };

        res.json(_filterByBranch(cachedForecast, branchFilter));
    } catch (err) {
        console.error('[GET /ai/forecast]', err.message);
        // Fallback — never 500
        res.json(cachedForecast.fetchedAt ? _filterByBranch(cachedForecast, 'all') : {
            forecast: [],
            model_accuracy: 0,
            model_type: 'error',
            top_features: [],
            actual_revenue: [],
        });
    }
});

function _filterByBranch(data, branch) {
    if (!branch || branch === 'all') return data;
    const bid = parseInt(branch);
    if (isNaN(bid)) return data;
    return {
        ...data,
        forecast: (data.forecast || []).filter(f => f.branch_id === bid),
        actual_revenue: (data.actual_revenue || []).filter(a => a.branch_id === bid),
    };
}

module.exports = router;

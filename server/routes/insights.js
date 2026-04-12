/**
 * /api/ai/insights — AI Business Insights route
 *
 * GET  /api/ai/insights — return cached or freshly-generated insights
 *
 * Gathers KPIs from MySQL, sends them to the Python ML service,
 * caches the result in sarga_ai_cache for 24 hours.
 * If ML service is unreachable, returns cached data — never a 500.
 */
const router = require('express').Router();
const axios = require('axios');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getTodayDate } = require('../helpers');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 20_000;
const CACHE_KEY = 'business_insights';
const CACHE_TTL_HOURS = 24;

// ── Read / write MySQL cache ─────────────────────────────────────────────────

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
        console.error('[Insights] Cache read error:', err.message);
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
        console.error('[Insights] Cache write error:', err.message);
    }
}

// ── Gather KPIs from MySQL ───────────────────────────────────────────────────

async function gatherKPIs() {
    const today = getTodayDate();

    // Overall revenue — 7 day & 30 day
    const [[{ revenue_7day }]] = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS revenue_7day
         FROM sarga_jobs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`
    );
    const [[{ revenue_30day }]] = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS revenue_30day
         FROM sarga_jobs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`
    );

    // Top performing service (by revenue, last 7 days)
    const [topRows] = await pool.query(
        `SELECT job_name AS service, SUM(total_amount) AS total
         FROM sarga_jobs
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY job_name ORDER BY total DESC LIMIT 1`
    );
    const top_service = topRows.length > 0 ? topRows[0].service : 'N/A';

    // Slowest service (by revenue, last 7 days, at least 1 job)
    const [slowRows] = await pool.query(
        `SELECT job_name AS service, SUM(total_amount) AS total
         FROM sarga_jobs
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY job_name ORDER BY total ASC LIMIT 1`
    );
    const slow_service = slowRows.length > 0 ? slowRows[0].service : 'N/A';

    // Average job value
    const [[{ avg_job_value }]] = await pool.query(
        `SELECT COALESCE(AVG(total_amount), 0) AS avg_job_value
         FROM sarga_jobs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`
    );

    // Per-branch comparison
    const [branchRows] = await pool.query(
        `SELECT b.name AS branch_name,
                COALESCE(SUM(CASE WHEN j.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN j.total_amount END), 0) AS revenue_7day,
                COALESCE(SUM(CASE WHEN j.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN j.total_amount END), 0) AS revenue_30day,
                COUNT(CASE WHEN j.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) AS job_count,
                COALESCE(AVG(CASE WHEN j.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN j.total_amount END), 0) AS avg_job_value
         FROM sarga_branches b
         LEFT JOIN sarga_jobs j ON j.branch_id = b.id
         GROUP BY b.id, b.name`
    );
    const branch_comparison = {};
    for (const row of branchRows) {
        branch_comparison[row.branch_name.toLowerCase()] = {
            revenue_7day: Number(row.revenue_7day),
            revenue_30day: Number(row.revenue_30day),
            job_count: Number(row.job_count),
            avg_job_value: Number(row.avg_job_value),
        };
    }

    // Anomaly count (current in-memory cache — call the anomalies module)
    let anomaly_count = 0;
    try {
        const { checkAnomalies } = require('./anomalies');
        const cached = await checkAnomalies();
        anomaly_count = (cached.anomalies || []).length;
    } catch { /* ignore */ }

    // Attendance rate today
    const [[{ att_total, att_present }]] = await pool.query(
        `SELECT COUNT(*) AS att_total,
                SUM(CASE WHEN status IN ('Present', 'Half Day') THEN 1 ELSE 0 END) AS att_present
         FROM sarga_staff_attendance
         WHERE attendance_date = ?`,
        [today]
    );
    const attendance_rate = att_total > 0 ? (att_present / att_total) * 100 : 0;

    // Forecast next 7 days — try calling our own forecast route internally
    let forecast_next_7days = 0;
    try {
        const res = await axios.post(`${ML_URL}/predict-sales`, {
            branch: 'all', days: 7,
        }, { timeout: ML_TIMEOUT });
        const predictions = res.data.predictions || [];
        forecast_next_7days = predictions.reduce((sum, p) => sum + (p.predicted_revenue || 0), 0);
    } catch { /* ignore */ }

    return {
        revenue_7day: Number(revenue_7day),
        revenue_30day: Number(revenue_30day),
        top_service,
        slow_service,
        avg_job_value: Number(avg_job_value),
        branch_comparison,
        anomaly_count,
        forecast_next_7days,
        attendance_rate,
    };
}

// ── Generate insights (ML call + cache) ──────────────────────────────────────

async function generateInsights() {
    try {
        const kpis = await gatherKPIs();
        const res = await axios.post(`${ML_URL}/generate-insights`, kpis, {
            timeout: ML_TIMEOUT,
            headers: { 'Content-Type': 'application/json' },
        });
        const data = {
            insights: res.data.insights || [],
            generated_at: res.data.generated_at || new Date().toISOString(),
            source: res.data.source || 'rules',
        };
        await setCache(data);
        console.log(`[Insights] Generated ${data.insights.length} insights (${data.source})`);
        return data;
    } catch (err) {
        console.error('[Insights] ML service error:', err.message);
        // Return cached or fallback
        const cached = await getCached();
        return cached || { insights: [], generated_at: null, source: 'unavailable' };
    }
}

// ── GET /api/ai/insights ────────────────────────────────────────────────────

router.get(
    '/insights',
    authenticateToken,
    authorizeRoles('Admin', 'Accountant', 'Front Office'),
    async (req, res) => {
        try {
            // Force refresh if ?refresh=1
            if (req.query.refresh === '1') {
                const data = await generateInsights();
                return res.json(data);
            }

            // Try cache first
            const cached = await getCached();
            if (cached) return res.json(cached);

            // No cache — generate now
            const data = await generateInsights();
            res.json(data);
        } catch (err) {
            console.error('[GET /ai/insights]', err.message);
            res.json({ insights: [], generated_at: null, source: 'error' });
        }
    }
);

module.exports = router;
module.exports.generateInsights = generateInsights;

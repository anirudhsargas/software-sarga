/**
 * AI Monitoring Routes — Fraud / Staff Monitoring
 */
const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const {
    runFullAnalysis,
    computeStaffBaselines
} = require('../helpers/anomalyDetection');

// All routes require Admin or Accountant role
const authMiddleware = [authenticateToken, authorizeRoles('Admin', 'Accountant')];

// ─── GET /alerts — List all fraud alerts ──────────────────────
router.get('/alerts', ...authMiddleware, asyncHandler(async (req, res) => {
    const { status, severity, staff_id, start_date, end_date, limit = 50, offset = 0 } = req.query;

    let where = '1=1';
    const params = [];

    if (status) { where += ' AND fa.status = ?'; params.push(status); }
    if (severity) { where += ' AND fa.severity = ?'; params.push(severity); }
    if (staff_id) { where += ' AND fa.staff_id = ?'; params.push(staff_id); }
    if (start_date) { where += ' AND fa.created_at >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND fa.created_at <= ?'; params.push(end_date + ' 23:59:59'); }

    const [alerts] = await pool.query(
        `SELECT fa.*, s.name AS staff_name, s.user_id AS staff_user_id, s.role AS staff_role
         FROM sarga_fraud_alerts fa
         LEFT JOIN sarga_staff s ON fa.staff_id = s.id
         WHERE ${where}
         ORDER BY fa.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM sarga_fraud_alerts fa WHERE ${where}`, params
    );

    res.json({
        alerts: alerts.map(a => ({
            ...a,
            details: (() => { try { return JSON.parse(a.details); } catch { return a.details; } })()
        })),
        total: countRows[0].total
    });
}));

// ─── GET /dashboard — Summary statistics ──────────────────────
router.get('/dashboard', ...authMiddleware, asyncHandler(async (req, res) => {
    // Active alert counts by severity
    const [severityCounts] = await pool.query(
        `SELECT severity, COUNT(*) AS count
         FROM sarga_fraud_alerts WHERE status = 'ACTIVE'
         GROUP BY severity`
    );

    // Top risky staff (most alerts in last 30 days)
    const [riskyStaff] = await pool.query(
        `SELECT fa.staff_id, s.name AS staff_name, s.role AS staff_role,
                COUNT(*) AS alert_count,
                MAX(fa.severity) AS highest_severity
         FROM sarga_fraud_alerts fa
         LEFT JOIN sarga_staff s ON fa.staff_id = s.id
         WHERE fa.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY fa.staff_id
         ORDER BY alert_count DESC
         LIMIT 10`
    );

    // Trend data (alerts per day, last 14 days)
    const [trendData] = await pool.query(
        `SELECT DATE(created_at) AS date, COUNT(*) AS count
         FROM sarga_fraud_alerts
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
    );

    // Recent alerts (last 10)
    const [recentAlerts] = await pool.query(
        `SELECT fa.*, s.name AS staff_name
         FROM sarga_fraud_alerts fa
         LEFT JOIN sarga_staff s ON fa.staff_id = s.id
         ORDER BY fa.created_at DESC LIMIT 10`
    );

    // Total counts
    const [totals] = await pool.query(
        `SELECT 
            SUM(status = 'ACTIVE') AS active_alerts,
            SUM(status = 'RESOLVED') AS resolved_alerts,
            SUM(status = 'DISMISSED') AS dismissed_alerts,
            COUNT(*) AS total_alerts
         FROM sarga_fraud_alerts`
    );

    res.json({
        severity_counts: severityCounts,
        risky_staff: riskyStaff,
        trend_data: trendData,
        recent_alerts: recentAlerts.map(a => ({
            ...a,
            details: (() => { try { return JSON.parse(a.details); } catch { return a.details; } })()
        })),
        totals: totals[0]
    });
}));

// ─── PUT /alerts/:id/resolve — Resolve or dismiss an alert ───
router.put('/alerts/:id/resolve', ...authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status = 'RESOLVED', notes } = req.body;

    if (!['RESOLVED', 'DISMISSED'].includes(status)) {
        return res.status(400).json({ message: 'Status must be RESOLVED or DISMISSED' });
    }

    const [result] = await pool.query(
        `UPDATE sarga_fraud_alerts SET status = ?, resolved_by = ?, resolved_at = NOW(), notes = ?
         WHERE id = ?`,
        [status, req.user.id, notes || null, id]
    );

    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Alert not found' });
    }

    res.json({ message: `Alert ${status.toLowerCase()}`, id });
}));

// ─── GET /staff/:id/profile — View staff behavior profile ────
router.get('/staff/:id/profile', ...authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [profiles] = await pool.query(
        `SELECT bp.*, s.name AS staff_name, s.user_id AS staff_user_id, s.role AS staff_role
         FROM sarga_staff_behavior_profile bp
         JOIN sarga_staff s ON bp.staff_id = s.id
         WHERE bp.staff_id = ?`,
        [id]
    );

    if (!profiles[0]) {
        return res.status(404).json({ message: 'No behavior profile found. Run analysis first.' });
    }

    const profile = profiles[0];
    try { profile.known_devices = JSON.parse(profile.known_devices || '[]'); } catch { profile.known_devices = []; }

    // Recent alerts for this staff
    const [alerts] = await pool.query(
        `SELECT * FROM sarga_fraud_alerts
         WHERE staff_id = ? ORDER BY created_at DESC LIMIT 20`, [id]
    );

    res.json({
        profile,
        recent_alerts: alerts.map(a => ({
            ...a,
            details: (() => { try { return JSON.parse(a.details); } catch { return a.details; } })()
        }))
    });
}));

// ─── POST /analyze — Trigger manual analysis ─────────────────
router.post('/analyze', ...authMiddleware, asyncHandler(async (req, res) => {
    const results = await runFullAnalysis();
    res.json({
        message: `Analysis complete. Found ${results.total_alerts} new alerts.`,
        ...results
    });
}));

// ─── POST /recompute-baselines — Recompute baselines only ────
router.post('/recompute-baselines', ...authMiddleware, asyncHandler(async (req, res) => {
    const result = await computeStaffBaselines();
    res.json({
        message: `Baselines recomputed for ${result.profiles} staff members.`,
        ...result
    });
}));

module.exports = router;

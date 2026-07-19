const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { checkAnomalies } = require('./anomalies');
const { dashboardCache } = require('../middleware/cache');

router.get('/dashboard-init', authenticateToken, dashboardCache(), async (req, res) => {
    try {
        const isAdmin = req.user.role === 'Admin';
        const isAccountant = req.user.role === 'Accountant';
        const isFrontOffice = req.user.role === 'Front Office';

        // 1. Fetch pending requests count (if Admin or Accountant)
        let pendingCount = 0;
        if (isAdmin || isAccountant) {
            const [rows] = await pool.query(`
                SELECT COALESCE(SUM(count), 0) as total FROM (
                    SELECT COUNT(*) as count FROM sarga_discount_requests WHERE status = 'PENDING' ${isAdmin ? '' : "AND approval_level = 'accountant_or_admin'"}
                    ${isAdmin ? "UNION ALL SELECT COUNT(*) FROM sarga_id_requests WHERE status = 'PENDING' UNION ALL SELECT COUNT(*) FROM sarga_customer_requests WHERE status = 'PENDING' UNION ALL SELECT COUNT(*) FROM sarga_vendor_requests WHERE status = 'Pending' UNION ALL SELECT COUNT(*) FROM sarga_opening_change_requests WHERE status = 'Pending' UNION ALL SELECT COUNT(*) FROM sarga_attendance_requests WHERE status = 'Pending'" : ''}
                ) subq
            `);
            pendingCount = rows[0]?.total || 0;
        }

        // 2. Fetch company settings
        const [settingsRows] = await pool.query('SELECT setting_key, setting_value FROM sarga_company_settings');
        const companySettings = {};
        settingsRows.forEach(r => { companySettings[r.setting_key] = r.setting_value; });

        // 3. Fetch anomaly count (if Admin, Accountant, or Front Office)
        let anomalyCount = 0;
        if (isAdmin || isAccountant || isFrontOffice) {
            try {
                const anomaliesRes = await checkAnomalies();
                anomalyCount = anomaliesRes?.anomalies?.length || 0;
            } catch (err) {
                console.error('[DashboardInit] Failed to fetch anomalies:', err.message);
            }
        }

        res.json({
            pendingCount,
            companySettings,
            anomalyCount
        });
    } catch (err) {
        console.error('[DashboardInit] Initialization error:', err);
        res.status(500).json({ message: 'Dashboard initialization failed' });
    }
});

module.exports = router;

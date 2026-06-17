const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { checkAnomalies } = require('./anomalies');

router.get('/dashboard-init', authenticateToken, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'Admin';
        const isAccountant = req.user.role === 'Accountant';
        const isFrontOffice = req.user.role === 'Front Office';

        // 1. Fetch pending requests count (if Admin or Accountant)
        let pendingCount = 0;
        if (isAdmin || isAccountant) {
            if (!isAdmin) {
                const [discountRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_discount_requests WHERE status = 'PENDING' AND approval_level = 'accountant_or_admin'");
                pendingCount = discountRows[0]?.count || 0;
            } else {
                const [idRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_id_requests WHERE status = 'PENDING'");
                const [customerRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_customer_requests WHERE status = 'PENDING'");
                const [vendorRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_vendor_requests WHERE status = 'Pending'");
                const [openingRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_opening_change_requests WHERE status = 'Pending'");
                const [attendanceRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_attendance_requests WHERE status = 'Pending'");
                const [discountRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_discount_requests WHERE status = 'PENDING'");

                pendingCount = (idRows[0]?.count || 0) + 
                               (customerRows[0]?.count || 0) + 
                               (vendorRows[0]?.count || 0) + 
                               (openingRows[0]?.count || 0) + 
                               (attendanceRows[0]?.count || 0) + 
                               (discountRows[0]?.count || 0);
            }
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

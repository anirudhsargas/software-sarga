/**
 * AI Anomaly Detection Helper
 * Uses statistical Z-score analysis to detect suspicious staff behavior.
 * No external ML libraries needed — pure JavaScript.
 */
const { pool } = require('../database');

// ─── Statistics Helpers ────────────────────────────────────────

function mean(values) {
    if (!values.length) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

function zScore(value, avg, sd) {
    if (sd === 0) return Math.abs(value - avg) > 0 ? 3 : 0;
    return (value - avg) / sd;
}

// ─── Baseline Computation ──────────────────────────────────────

/**
 * Compute behaviour baselines for every staff member over the last 30 days.
 * Stores: avg_login_hour, avg_discount_pct, avg_order_value, avg_daily_actions.
 */
async function computeStaffBaselines() {
    const conn = await pool.getConnection();
    try {
        // Ensure the profile table exists
        await conn.query(`
            CREATE TABLE IF NOT EXISTS sarga_staff_behavior_profile (
                id INT AUTO_INCREMENT PRIMARY KEY,
                staff_id INT NOT NULL UNIQUE,
                avg_login_hour DECIMAL(5,2) DEFAULT 0,
                std_login_hour DECIMAL(5,2) DEFAULT 0,
                avg_discount_pct DECIMAL(5,2) DEFAULT 0,
                std_discount_pct DECIMAL(5,2) DEFAULT 0,
                avg_order_value DECIMAL(12,2) DEFAULT 0,
                std_order_value DECIMAL(12,2) DEFAULT 0,
                avg_daily_actions INT DEFAULT 0,
                std_daily_actions INT DEFAULT 0,
                known_devices TEXT,
                last_computed TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
            )
        `);

        const [staffList] = await conn.query('SELECT id FROM sarga_staff');

        for (const staff of staffList) {
            const staffId = staff.id;

            // Login hours (from audit log)
            const [loginRows] = await conn.query(
                `SELECT HOUR(timestamp) AS login_hour
                 FROM sarga_audit_logs
                 WHERE user_id_internal = ? AND action = 'LOGIN'
                   AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
                [staffId]
            );
            const loginHours = loginRows.map(r => r.login_hour);

            // Discount percentages (from jobs)
            const [discountRows] = await conn.query(
                `SELECT 
                    CASE WHEN total_amount > 0 
                         THEN ((total_amount - balance_amount - advance_paid) / total_amount * 100)
                         ELSE 0 END AS discount_pct
                 FROM sarga_jobs
                 WHERE branch_id IN (SELECT branch_id FROM sarga_staff WHERE id = ?)
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                   AND total_amount > 0`,
                [staffId]
            );
            // For discounts, look at discount_requests made by this staff
            const [discReqs] = await conn.query(
                `SELECT discount_percent FROM sarga_discount_requests
                 WHERE requester_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
                [staffId]
            );
            const discounts = discReqs.map(r => parseFloat(r.discount_percent) || 0);

            // Order values
            const [orderRows] = await conn.query(
                `SELECT total_amount FROM sarga_customer_payments
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                   AND branch_id IN (SELECT branch_id FROM sarga_staff WHERE id = ?)`,
                [staffId]
            );
            const orderValues = orderRows.map(r => parseFloat(r.total_amount) || 0);

            // Daily action counts
            const [actionRows] = await conn.query(
                `SELECT DATE(timestamp) AS d, COUNT(*) AS cnt
                 FROM sarga_audit_logs
                 WHERE user_id_internal = ?
                   AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                 GROUP BY DATE(timestamp)`,
                [staffId]
            );
            const dailyActions = actionRows.map(r => r.cnt);

            // Known devices (from activity log if exists)
            const [deviceRows] = await conn.query(
                `SELECT DISTINCT device_info FROM sarga_staff_activity_log
                 WHERE staff_id = ? AND device_info IS NOT NULL
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
                [staffId]
            ).catch(() => [[]]);
            const knownDevices = deviceRows.map(r => r.device_info).filter(Boolean);

            await conn.query(
                `INSERT INTO sarga_staff_behavior_profile 
                    (staff_id, avg_login_hour, std_login_hour, avg_discount_pct, std_discount_pct,
                     avg_order_value, std_order_value, avg_daily_actions, std_daily_actions, known_devices)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    avg_login_hour = VALUES(avg_login_hour),
                    std_login_hour = VALUES(std_login_hour),
                    avg_discount_pct = VALUES(avg_discount_pct),
                    std_discount_pct = VALUES(std_discount_pct),
                    avg_order_value = VALUES(avg_order_value),
                    std_order_value = VALUES(std_order_value),
                    avg_daily_actions = VALUES(avg_daily_actions),
                    std_daily_actions = VALUES(std_daily_actions),
                    known_devices = VALUES(known_devices)`,
                [
                    staffId,
                    mean(loginHours), stdDev(loginHours),
                    mean(discounts), stdDev(discounts),
                    mean(orderValues), stdDev(orderValues),
                    Math.round(mean(dailyActions)), Math.round(stdDev(dailyActions)),
                    JSON.stringify(knownDevices)
                ]
            );
        }
        return { success: true, profiles: staffList.length };
    } finally {
        conn.release();
    }
}

// ─── Anomaly Checks ────────────────────────────────────────────

/**
 * Check login for anomalies: unusual hours or unknown devices.
 */
async function checkLoginAnomaly(staffId, loginHour, deviceInfo) {
    const alerts = [];
    const [profiles] = await pool.query(
        'SELECT * FROM sarga_staff_behavior_profile WHERE staff_id = ?', [staffId]
    );
    const profile = profiles[0];
    if (!profile) return alerts;

    // Check login time
    const avg = parseFloat(profile.avg_login_hour) || 9;
    const sd = parseFloat(profile.std_login_hour) || 2;
    const z = Math.abs(zScore(loginHour, avg, sd));
    if (z > 2) {
        alerts.push({
            staff_id: staffId,
            alert_type: 'UNUSUAL_LOGIN_TIME',
            severity: z > 3 ? 'HIGH' : 'MEDIUM',
            details: JSON.stringify({
                login_hour: loginHour,
                avg_login_hour: avg,
                z_score: z.toFixed(2),
                device: deviceInfo || 'Unknown'
            }),
            message: `Login at unusual hour (${loginHour}:00). Normal: ${avg.toFixed(0)}:00 ± ${sd.toFixed(0)}h`
        });
    }

    // Check unknown device
    if (deviceInfo) {
        let knownDevices = [];
        try { knownDevices = JSON.parse(profile.known_devices || '[]'); } catch (e) { }
        if (knownDevices.length > 0 && !knownDevices.includes(deviceInfo)) {
            alerts.push({
                staff_id: staffId,
                alert_type: 'UNKNOWN_DEVICE',
                severity: 'HIGH',
                details: JSON.stringify({
                    device: deviceInfo,
                    known_devices: knownDevices
                }),
                message: `Login from unknown device: ${deviceInfo}`
            });
        }
    }

    return alerts;
}

/**
 * Check if a discount is anomalous for the staff.
 */
async function checkDiscountAnomaly(staffId, discountPercent, orderValue) {
    const alerts = [];
    const [profiles] = await pool.query(
        'SELECT * FROM sarga_staff_behavior_profile WHERE staff_id = ?', [staffId]
    );
    const profile = profiles[0];
    if (!profile) return alerts;

    // Check discount percentage
    const avgDisc = parseFloat(profile.avg_discount_pct) || 5;
    const sdDisc = parseFloat(profile.std_discount_pct) || 2;
    const zDisc = zScore(discountPercent, avgDisc, sdDisc);
    if (zDisc > 2) {
        alerts.push({
            staff_id: staffId,
            alert_type: 'HIGH_DISCOUNT',
            severity: zDisc > 3 ? 'CRITICAL' : 'HIGH',
            details: JSON.stringify({
                discount_percent: discountPercent,
                avg_discount: avgDisc,
                z_score: zDisc.toFixed(2),
                order_value: orderValue
            }),
            message: `Unusually high discount: ${discountPercent}% on ₹${orderValue} order. Normal: ${avgDisc.toFixed(1)}%`
        });
    }

    // Check order value
    const avgOrd = parseFloat(profile.avg_order_value) || 500;
    const sdOrd = parseFloat(profile.std_order_value) || 200;
    const zOrd = zScore(orderValue, avgOrd, sdOrd);
    if (zOrd > 2) {
        alerts.push({
            staff_id: staffId,
            alert_type: 'HIGH_ORDER_VALUE',
            severity: zOrd > 3 ? 'HIGH' : 'MEDIUM',
            details: JSON.stringify({
                order_value: orderValue,
                avg_order_value: avgOrd,
                z_score: zOrd.toFixed(2)
            }),
            message: `Unusually high order value: ₹${orderValue}. Normal: ₹${avgOrd.toFixed(0)}`
        });
    }

    return alerts;
}

/**
 * Check for bulk deletion anomalies.
 */
async function checkDeletionAnomaly(staffId, actionType, recentCount) {
    const alerts = [];
    if (recentCount >= 3) {
        alerts.push({
            staff_id: staffId,
            alert_type: 'BULK_DELETION',
            severity: recentCount >= 5 ? 'CRITICAL' : 'HIGH',
            details: JSON.stringify({
                action_type: actionType,
                count: recentCount
            }),
            message: `${recentCount} ${actionType} actions in short period`
        });
    }
    return alerts;
}

/**
 * Save alerts to the database.
 */
async function saveAlerts(alerts) {
    if (!alerts.length) return;
    const conn = await pool.getConnection();
    try {
        for (const alert of alerts) {
            await conn.query(
                `INSERT INTO sarga_fraud_alerts 
                    (staff_id, alert_type, severity, details, message)
                 VALUES (?, ?, ?, ?, ?)`,
                [alert.staff_id, alert.alert_type, alert.severity, alert.details, alert.message]
            );
        }
    } finally {
        conn.release();
    }
}

/**
 * Run full analysis scan across all recent audit data.
 */
async function runFullAnalysis() {
    const results = { total_alerts: 0, alerts: [] };

    // Re-compute baselines first
    await computeStaffBaselines();

    // Check recent logins (last 24h)
    const [recentLogins] = await pool.query(
        `SELECT user_id_internal AS staff_id, HOUR(timestamp) AS login_hour
         FROM sarga_audit_logs
         WHERE action = 'LOGIN' AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );

    for (const login of recentLogins) {
        const alerts = await checkLoginAnomaly(login.staff_id, login.login_hour, null);
        if (alerts.length) {
            await saveAlerts(alerts);
            results.alerts.push(...alerts);
        }
    }

    // Check recent discount requests (last 24h)
    const [recentDiscounts] = await pool.query(
        `SELECT requester_id AS staff_id, discount_percent, total_amount
         FROM sarga_discount_requests
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );

    for (const disc of recentDiscounts) {
        const alerts = await checkDiscountAnomaly(
            disc.staff_id,
            parseFloat(disc.discount_percent),
            parseFloat(disc.total_amount) || 0
        );
        if (alerts.length) {
            await saveAlerts(alerts);
            results.alerts.push(...alerts);
        }
    }

    // Check bulk deletions (from audit logs, last 24h)
    const [deletionCounts] = await pool.query(
        `SELECT user_id_internal AS staff_id, action, COUNT(*) AS cnt
         FROM sarga_audit_logs
         WHERE action LIKE '%DELETE%' AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         GROUP BY user_id_internal, action
         HAVING cnt >= 3`
    );

    for (const del of deletionCounts) {
        const alerts = await checkDeletionAnomaly(del.staff_id, del.action, del.cnt);
        if (alerts.length) {
            await saveAlerts(alerts);
            results.alerts.push(...alerts);
        }
    }

    results.total_alerts = results.alerts.length;
    return results;
}

/**
 * Log a staff activity (called from other routes).
 */
async function logActivity(staffId, actionType, details, ipAddress, deviceInfo) {
    try {
        await pool.query(
            `INSERT INTO sarga_staff_activity_log 
                (staff_id, action_type, details, ip_address, device_info)
             VALUES (?, ?, ?, ?, ?)`,
            [staffId, actionType, details || null, ipAddress || null, deviceInfo || null]
        );
    } catch (err) {
        console.error('[AnomalyDetection] Failed to log activity:', err.message);
    }
}

module.exports = {
    computeStaffBaselines,
    checkLoginAnomaly,
    checkDiscountAnomaly,
    checkDeletionAnomaly,
    saveAlerts,
    runFullAnalysis,
    logActivity,
    // Exposed for testing
    mean, stdDev, zScore
};

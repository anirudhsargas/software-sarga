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

        // Fetch list of staff with their branch ids
        const [staffList] = await conn.query('SELECT id, branch_id FROM sarga_staff');
        if (!staffList.length) return { success: true, profiles: 0 };

        // Aggregate login hours per staff
        const [loginAgg] = await conn.query(
            `SELECT user_id_internal AS staff_id,
                    AVG(HOUR(timestamp)) AS avg_login_hour,
                    STDDEV_POP(HOUR(timestamp)) AS std_login_hour
             FROM sarga_audit_logs
             WHERE action = 'LOGIN' AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY user_id_internal`
        );

        // Aggregate discount requests per staff
        const [discReqAgg] = await conn.query(
            `SELECT requester_id AS staff_id,
                    AVG(discount_percent) AS avg_discount_pct,
                    STDDEV_POP(discount_percent) AS std_discount_pct
             FROM sarga_discount_requests
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY requester_id`
        );

        // Aggregate job-derived discount per staff via staff->branch join
        const [jobDiscAgg] = await conn.query(
            `SELECT s.id AS staff_id,
                    AVG(CASE WHEN j.total_amount > 0 THEN ((j.total_amount - j.balance_amount - j.advance_paid) / j.total_amount * 100) ELSE 0 END) AS avg_discount_pct,
                    STDDEV_POP(CASE WHEN j.total_amount > 0 THEN ((j.total_amount - j.balance_amount - j.advance_paid) / j.total_amount * 100) ELSE 0 END) AS std_discount_pct
             FROM sarga_jobs j
             JOIN sarga_staff s ON j.branch_id = s.branch_id
             WHERE j.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND j.total_amount > 0
             GROUP BY s.id`
        );

        // Aggregate order values per staff (via branch)
        const [orderAgg] = await conn.query(
            `SELECT s.id AS staff_id,
                    AVG(cp.total_amount) AS avg_order_value,
                    STDDEV_POP(cp.total_amount) AS std_order_value
             FROM sarga_customer_payments cp
             JOIN sarga_staff s ON cp.branch_id = s.branch_id
             WHERE cp.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY s.id`
        );

        // Average daily actions and stddev per staff
        const [dailyAgg] = await conn.query(
            `SELECT t.staff_id,
                    AVG(t.cnt) AS avg_daily_actions,
                    STDDEV_POP(t.cnt) AS std_daily_actions
             FROM (
               SELECT user_id_internal AS staff_id, DATE(timestamp) AS d, COUNT(*) AS cnt
               FROM sarga_audit_logs
               WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
               GROUP BY user_id_internal, DATE(timestamp)
             ) t
             GROUP BY t.staff_id`
        );

        // Known devices per staff
        const [deviceAgg] = await conn.query(
            `SELECT staff_id, GROUP_CONCAT(DISTINCT device_info SEPARATOR '||') AS devices
             FROM sarga_staff_activity_log
             WHERE device_info IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY staff_id`
        );

        // Build maps for quick lookup
        const loginMap = new Map(loginAgg.map(r => [r.staff_id, r]));
        const discReqMap = new Map(discReqAgg.map(r => [r.staff_id, r]));
        const jobDiscMap = new Map(jobDiscAgg.map(r => [r.staff_id, r]));
        const orderMap = new Map(orderAgg.map(r => [r.staff_id, r]));
        const dailyMap = new Map(dailyAgg.map(r => [r.staff_id, r]));
        const deviceMap = new Map(deviceAgg.map(r => [r.staff_id, r]));

        // Prepare rows for bulk upsert
        const values = [];
        const placeholders = [];
        for (const s of staffList) {
            const sid = s.id;
            const l = loginMap.get(sid) || {};
            // Prefer discount requests aggregation, fallback to job-based
            const dr = discReqMap.get(sid);
            const jd = jobDiscMap.get(sid);
            const avgDisc = dr ? parseFloat(dr.avg_discount_pct || 0) : (jd ? parseFloat(jd.avg_discount_pct || 0) : 0);
            const stdDisc = dr ? parseFloat(dr.std_discount_pct || 0) : (jd ? parseFloat(jd.std_discount_pct || 0) : 0);
            const ord = orderMap.get(sid) || {};
            const dy = dailyMap.get(sid) || {};
            const dv = deviceMap.get(sid) || {};

            const avgLogin = l.avg_login_hour != null ? parseFloat(l.avg_login_hour) : 0;
            const stdLogin = l.std_login_hour != null ? parseFloat(l.std_login_hour) : 0;
            const avgOrder = ord.avg_order_value != null ? parseFloat(ord.avg_order_value) : 0;
            const stdOrder = ord.std_order_value != null ? parseFloat(ord.std_order_value) : 0;
            const avgDaily = dy.avg_daily_actions != null ? Math.round(parseFloat(dy.avg_daily_actions)) : 0;
            const stdDaily = dy.std_daily_actions != null ? Math.round(parseFloat(dy.std_daily_actions)) : 0;
            const knownDevices = dv.devices ? dv.devices.split('||').filter(Boolean) : [];

            placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            values.push(sid, avgLogin, stdLogin, avgDisc, stdDisc, avgOrder, stdOrder, avgDaily, stdDaily, JSON.stringify(knownDevices));
        }

        if (values.length) {
            const sql = `INSERT INTO sarga_staff_behavior_profile
                (staff_id, avg_login_hour, std_login_hour, avg_discount_pct, std_discount_pct,
                 avg_order_value, std_order_value, avg_daily_actions, std_daily_actions, known_devices)
             VALUES ${placeholders.join(',')}
             ON DUPLICATE KEY UPDATE
                avg_login_hour = VALUES(avg_login_hour),
                std_login_hour = VALUES(std_login_hour),
                avg_discount_pct = VALUES(avg_discount_pct),
                std_discount_pct = VALUES(std_discount_pct),
                avg_order_value = VALUES(avg_order_value),
                std_order_value = VALUES(std_order_value),
                avg_daily_actions = VALUES(avg_daily_actions),
                std_daily_actions = VALUES(std_daily_actions),
                known_devices = VALUES(known_devices)`;

            await conn.query(sql, values);
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
        const placeholders = [];
        const values = [];
        for (const alert of alerts) {
            placeholders.push('(?, ?, ?, ?, ?)');
            values.push(alert.staff_id, alert.alert_type, alert.severity, alert.details, alert.message);
        }
        const sql = `INSERT INTO sarga_fraud_alerts (staff_id, alert_type, severity, details, message) VALUES ${placeholders.join(',')}`;
        await conn.query(sql, values);
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

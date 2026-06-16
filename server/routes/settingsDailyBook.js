const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { executeDailyBook, initializeDailyBookCron } = require('../services/dailyBookScheduler');
const { auditLog } = require('../helpers');

// Ensure only Admin can access these routes
const authorizeAdmin = (req, res, next) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Access denied' });
    next();
};

router.get('/', auth.authenticate, authorizeAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sarga_daily_report_settings LIMIT 1');
        if (rows.length === 0) {
            return res.json({});
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

router.put('/', auth.authenticate, authorizeAdmin, async (req, res) => {
    try {
        const {
            is_enabled, send_time, timezone, days_of_week,
            recipients_admin, recipients_accounts, recipients_cc, recipients_bcc,
            branch_overrides, format_pdf, format_excel, format_html,
            retry_enabled, max_retries
        } = req.body;

        const [existing] = await pool.query('SELECT id FROM sarga_daily_report_settings LIMIT 1');
        
        if (existing.length === 0) {
            await pool.query(
                `INSERT INTO sarga_daily_report_settings 
                (is_enabled, send_time, timezone, days_of_week, recipients_admin, recipients_accounts, 
                recipients_cc, recipients_bcc, branch_overrides, format_pdf, format_excel, format_html, retry_enabled, max_retries)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [is_enabled ? 1 : 0, send_time || '20:00:00', timezone || 'Asia/Kolkata', days_of_week || '1-6',
                 recipients_admin, recipients_accounts, recipients_cc, recipients_bcc,
                 JSON.stringify(branch_overrides || {}),
                 format_pdf !== false ? 1 : 0, format_excel !== false ? 1 : 0, format_html !== false ? 1 : 0,
                 retry_enabled !== false ? 1 : 0, max_retries || 3]
            );
        } else {
            await pool.query(
                `UPDATE sarga_daily_report_settings SET 
                 is_enabled = ?, send_time = ?, timezone = ?, days_of_week = ?, 
                 recipients_admin = ?, recipients_accounts = ?, recipients_cc = ?, recipients_bcc = ?, 
                 branch_overrides = ?, format_pdf = ?, format_excel = ?, format_html = ?, 
                 retry_enabled = ?, max_retries = ?`,
                [is_enabled ? 1 : 0, send_time || '20:00:00', timezone || 'Asia/Kolkata', days_of_week || '1-6',
                 recipients_admin, recipients_accounts, recipients_cc, recipients_bcc,
                 JSON.stringify(branch_overrides || {}),
                 format_pdf !== false ? 1 : 0, format_excel !== false ? 1 : 0, format_html !== false ? 1 : 0,
                 retry_enabled !== false ? 1 : 0, max_retries || 3]
            );
        }

        // Re-initialize cron
        initializeDailyBookCron();

        auditLog(req.user.id, 'UPDATE_DAILY_BOOK_SETTINGS', 'Updated daily book automation settings');
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

router.post('/trigger', auth.authenticate, authorizeAdmin, async (req, res) => {
    try {
        const { isTest, forceRun } = req.body;
        const result = await executeDailyBook(isTest, forceRun);
        res.json(result);
    } catch (error) {
        console.error('Error triggering daily book:', error);
        res.status(500).json({ error: 'Failed to trigger report' });
    }
});

router.get('/logs', auth.authenticate, authorizeAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sarga_daily_report_logs ORDER BY created_at DESC LIMIT 10');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

router.get('/status', auth.authenticate, authorizeAdmin, async (req, res) => {
    try {
        const [logs] = await pool.query('SELECT * FROM sarga_daily_report_logs ORDER BY started_at DESC LIMIT 1');
        const [settings] = await pool.query('SELECT send_time, timezone FROM sarga_daily_report_settings LIMIT 1');
        res.json({
            lastRun: logs.length > 0 ? logs[0] : null,
            nextRunTime: settings.length > 0 ? settings[0].send_time : null,
            timezone: settings.length > 0 ? settings[0].timezone : null
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { runBackup } = require('../services/googleSheetsService');
const cron = require('node-cron');

// Import db pool — check how other route files import it and use the same pattern
const { pool: db } = require('../database');

// POST /api/backup/run — manual trigger (Admin only)
router.post('/run', async (req, res) => {
  try {
    const result = await runBackup(db, 'manual');
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[backup] Manual run failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/backup/status — last 10 backup jobs
router.get('/status', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, triggered_by, status, started_at, completed_at,
              tables_backed_up, rows_written, error_message
       FROM sarga_backup_jobs
       ORDER BY started_at DESC
       LIMIT 10`
    );
    res.json({ success: true, jobs: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/backup/daily — cron-job.org or internal cron hits this
router.get('/daily', async (req, res) => {
  try {
    const result = await runBackup(db, 'cron');
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[backup] Daily cron run failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Schedule daily backup at midnight IST (18:30 UTC)
cron.schedule('30 18 * * *', async () => {
  console.log('[backup] Starting scheduled daily backup...');
  try {
    const result = await runBackup(db, 'cron');
    console.log('[backup] Scheduled backup completed:', result);
  } catch (err) {
    console.error('[backup] Scheduled backup failed:', err);
  }
});

module.exports = router;

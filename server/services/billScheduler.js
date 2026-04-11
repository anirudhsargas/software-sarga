const cron = require('node-cron');
const { runBillParser } = require('./billEmailParser');

async function runNow() {
  try {
    console.log('[BillScheduler] Running bill parser now...');
    const report = await runBillParser();
    console.log('[BillScheduler] Report:', report);
    return report;
  } catch (err) {
    console.error('[BillScheduler] runNow error:', err.message || err);
    throw err;
  }
}

function scheduleDaily() {
  // Run every day at 09:00
  try {
    cron.schedule('0 9 * * *', () => {
      console.log('[Cron] Running bill email parser (scheduled)…');
      runNow().catch(err => console.error('[Cron] Bill parser failed:', err.message || err));
    });
    console.log('[Cron] Bill email parser scheduled daily at 09:00');
  } catch (e) {
    console.warn('[Cron] Failed to schedule bill parser:', e.message || e);
  }
}

module.exports = { scheduleDaily, runNow };

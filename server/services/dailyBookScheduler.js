const cron = require('node-cron');
const { pool } = require('../database');

// Heavy modules (nodemailer, pdfkit, xlsx) are lazy-required inside
// executeDailyBook() so they don't block scheduler initialization.
const _lazy = {};
function lazyRequire(mod) {
  return _lazy[mod] || (_lazy[mod] = require(mod));
}
function lazyModule(mod) {
  return {
    get fetchDailyBookData() { return lazyRequire('./dailyBookCollector').fetchDailyBookData; },
    get generateDailyBookPdf() { return lazyRequire('./dailyBookPdfGenerator').generateDailyBookPdf; },
    get generateBackupPdf() { return lazyRequire('./dailyBookPdfGenerator').generateBackupPdf; },
    get generateDailyBookExcel() { return lazyRequire('./dailyBookExcelGenerator').generateDailyBookExcel; },
    get nodemailer() { return lazyRequire('nodemailer'); },
  };
}

let currentCronJob = null;

// Ensure local time matches the target date
const getTodayStr = () => {
    const d = new Date();
    // Use Asia/Kolkata timezone strictly
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('en-IN', options).formatToParts(d);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${day}`;
};

async function executeDailyBook(isTest = false, forceRun = false) {
    return executeDailyBookForDate(getTodayStr(), isTest, forceRun);
}

async function executeDailyBookForDate(targetDate, isTest = false, forceRunOrType = false) {
    const startTime = Date.now();
    let logId = null;

    try {
        const [settingsRows] = await pool.query('SELECT * FROM sarga_daily_report_settings LIMIT 1');
        if (settingsRows.length === 0) return { success: false, message: 'Settings not configured' };
        const settings = settingsRows[0];

        if (!settings.is_enabled && !isTest && !forceRunOrType) {
            return { success: false, message: 'Daily book is disabled' };
        }

        // Lock/prevent duplicates unless forceRun
        if (!isTest && forceRunOrType !== true) {
            const isMorning = forceRunOrType === 'Morning Update';
            const statusFilter = isMorning 
                ? `SELECT id FROM sarga_daily_report_logs WHERE report_date = ? AND status = 'Success' AND error = 'Morning Update'`
                : `SELECT id FROM sarga_daily_report_logs WHERE report_date = ? AND status IN ('Success', 'Running') AND (error IS NULL OR error != 'Morning Update')`;
            
            const [existing] = await pool.query(statusFilter, [targetDate]);
            if (existing.length > 0) {
                return { success: false, message: `Report already sent or running for ${targetDate}` };
            }

            const [insertLog] = await pool.query(
                `INSERT INTO sarga_daily_report_logs (report_date, status, error) VALUES (?, 'Running', ?)`,
                [targetDate, isMorning ? 'Morning Update' : null]
            );
            logId = insertLog.insertId;
        }

        const m = lazyModule();
        const { createMailTransporter } = require('../utils/mailer');
        const transporter = createMailTransporter();

        const [branches] = await pool.query('SELECT id, name FROM sarga_branches');
        const overrides = (() => { try { return JSON.parse(settings.branch_overrides || '{}'); } catch { return {}; } })();

        const dateStart = `${targetDate} 00:00:00`;
        const dateEnd = forceRunOrType === 'Morning Update' ? `${targetDate} 23:59:59` : `${targetDate} ${settings.send_time || '19:00:00'}`;

        let allEmails = new Set();
        if (settings.recipients_admin) settings.recipients_admin.split(',').forEach(e => allEmails.add(e.trim()));
        if (settings.recipients_accounts) settings.recipients_accounts.split(',').forEach(e => allEmails.add(e.trim()));

        const isMorningLabel = forceRunOrType === 'Morning Update' ? ' [UPDATED MORNING]' : '';

        // Process branches
        for (const branch of branches) {
            const data = await m.fetchDailyBookData(dateStart, dateEnd, branch.id);
            
            const attachments = [];
            if (settings.format_pdf) {
                const pdfBuf = await m.generateDailyBookPdf(data, targetDate, branch.name);
                attachments.push({
                    filename: `dailybook_${targetDate}_${branch.name}.pdf`,
                    content: pdfBuf,
                    contentType: 'application/pdf'
                });
                const backupPdfBuf = await m.generateBackupPdf(data, targetDate, branch.name);
                attachments.push({
                    filename: `backup_${targetDate}_${branch.name}.pdf`,
                    content: backupPdfBuf,
                    contentType: 'application/pdf'
                });
            }
            if (settings.format_excel) {
                const xlsxBuf = m.generateDailyBookExcel(data, targetDate, branch.name);
                attachments.push({
                    filename: `dailybook_${targetDate}_${branch.name}.xlsx`,
                    content: xlsxBuf,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
            }

            const branchEmail = overrides[branch.name] || '';
            const toRecipients = [...allEmails, branchEmail].filter(e => e).join(', ');

            if (toRecipients && attachments.length > 0) {
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM || 'sargabilldesk@gmail.com',
                    to: toRecipients,
                    cc: settings.recipients_cc || '',
                    bcc: settings.recipients_bcc || '',
                    subject: `${isTest ? '[TEST] ' : ''}Daily Book Report – ${targetDate} (${branch.name})${isMorningLabel}`,
                    html: `<h3>Daily Cash Book Report${isMorningLabel}</h3>
                           <p>Branch: <b>${branch.name}</b></p>
                           <p>Date: <b>${targetDate}</b></p>
                           <p>Total Sales: Rs. ${data.summary.totalSales}</p>
                           <p>Net Cash: Rs. ${data.cashSummary.netCash}</p>
                           <hr />
                           <p><small>Generated automatically.</small></p>`,
                    attachments
                });
            }
        }

        // Send Combined Report
        const combinedData = await m.fetchDailyBookData(dateStart, dateEnd, null);
        const combinedAttachments = [];
        if (settings.format_pdf) {
            const pdfBuf = await m.generateDailyBookPdf(combinedData, targetDate, 'Combined (All Branches)');
            combinedAttachments.push({
                filename: `dailybook_${targetDate}_combined.pdf`,
                content: pdfBuf,
                contentType: 'application/pdf'
            });
            const combinedBackupPdfBuf = await m.generateBackupPdf(combinedData, targetDate, 'Combined (All Branches)');
            combinedAttachments.push({
                filename: `backup_${targetDate}_combined.pdf`,
                content: combinedBackupPdfBuf,
                contentType: 'application/pdf'
            });
        }
        if (settings.format_excel) {
            const xlsxBuf = m.generateDailyBookExcel(combinedData, targetDate, 'Combined (All Branches)');
            combinedAttachments.push({
                filename: `dailybook_${targetDate}_combined.xlsx`,
                content: xlsxBuf,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
        }

        const toCombined = [...allEmails].filter(e => e).join(', ');
        if (toCombined && combinedAttachments.length > 0) {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM || 'sargabilldesk@gmail.com',
                to: toCombined,
                cc: settings.recipients_cc || '',
                bcc: settings.recipients_bcc || '',
                subject: `${isTest ? '[TEST] ' : ''}Daily Book Report – ${targetDate} (Combined)${isMorningLabel}`,
                html: `<h3>Daily Cash Book Report (Combined)${isMorningLabel}</h3>
                       <p>Date: <b>${targetDate}</b></p>
                       <p>Total Sales: Rs. ${combinedData.summary.totalSales}</p>
                       <p>Net Cash: Rs. ${combinedData.cashSummary.netCash}</p>
                       <hr />
                       <p><small>Generated automatically.</small></p>`,
                attachments: combinedAttachments
            });
        }

        const executionMs = Date.now() - startTime;
        if (logId) {
            await pool.query(
                `UPDATE sarga_daily_report_logs SET status = 'Success', completed_at = CURRENT_TIMESTAMP, execution_ms = ?, recipients = ? WHERE id = ?`,
                [executionMs, toCombined, logId]
            );
        }

        return { success: true, message: 'Report generated and sent successfully' };

    } catch (error) {
        console.error('[DailyBookAutomation] Error:', error);
        
        if (logId) {
            const [logRow] = await pool.query('SELECT retry_count FROM sarga_daily_report_logs WHERE id = ?', [logId]);
            const retryCount = logRow[0].retry_count;
            const maxRetries = 3;
            
            if (retryCount < maxRetries) {
                await pool.query(
                    `UPDATE sarga_daily_report_logs SET status = 'Retrying', error = ?, retry_count = retry_count + 1 WHERE id = ?`,
                    [error.message, logId]
                );
                
                setTimeout(() => {
                    executeDailyBookForDate(targetDate, false, forceRunOrType);
                }, 10 * 60 * 1000);
                
            } else {
                await pool.query(
                    `UPDATE sarga_daily_report_logs SET status = 'Failed', error = ? WHERE id = ?`,
                    [error.message, logId]
                );
            }
        }
        return { success: false, message: error.message };
    }
}

async function checkAndSendMorningUpdate() {
    try {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
        const parts = new Intl.DateTimeFormat('en-IN', options).formatToParts(d);
        const y = parts.find(p => p.type === 'year').value;
        const m = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        const yesterday = `${y}-${m}-${day}`;

        const [existingMorning] = await pool.query(
            `SELECT id FROM sarga_daily_report_logs WHERE report_date = ? AND status = 'Success' AND error = 'Morning Update'`,
            [yesterday]
        );
        if (existingMorning.length > 0) {
            return { success: false, message: 'Morning update already sent for yesterday' };
        }

        const [lastRep] = await pool.query(
            `SELECT completed_at FROM sarga_daily_report_logs WHERE report_date = ? AND status = 'Success' ORDER BY completed_at DESC LIMIT 1`,
            [yesterday]
        );
        if (lastRep.length === 0) {
            console.log('[DailyBookAutomation] No successful yesterday report found, triggering fresh run');
            return await executeDailyBookForDate(yesterday, false, 'Morning Update');
        }

        const lastSentTime = lastRep[0].completed_at;

        const [[{ cnt: jobsCnt }]] = await pool.query(`SELECT COUNT(*) as cnt FROM sarga_jobs WHERE created_at > ?`, [lastSentTime]);
        const [[{ cnt: paymentsCnt }]] = await pool.query(`SELECT COUNT(*) as cnt FROM sarga_customer_payments WHERE created_at > ?`, [lastSentTime]);
        const [[{ cnt: expensesCnt }]] = await pool.query(`SELECT COUNT(*) as cnt FROM sarga_payments WHERE created_at > ?`, [lastSentTime]);

        const totalChanges = jobsCnt + paymentsCnt + expensesCnt;
        console.log(`[DailyBookAutomation] Changes since last report: ${totalChanges}`);

        if (totalChanges > 0) {
            return await executeDailyBookForDate(yesterday, false, 'Morning Update');
        } else {
            return { success: true, message: 'No changes detected since yesterday 7 PM' };
        }
    } catch (e) {
        console.error('[DailyBookAutomation] checkAndSendMorningUpdate failed:', e);
        return { success: false, message: e.message };
    }
}

async function initializeDailyBookCron() {
    try {
        if (currentCronJob) {
            currentCronJob.stop();
        }

        // Auto-migrate old default 20:00:00 to 19:00:00
        await pool.query("UPDATE sarga_daily_report_settings SET send_time = '19:00:00' WHERE send_time = '20:00:00'");

        const [rows] = await pool.query('SELECT * FROM sarga_daily_report_settings LIMIT 1');
        if (rows.length === 0) return;
        const settings = rows[0];

        if (!settings.is_enabled) {
            console.log('[DailyBookAutomation] Cron disabled in settings.');
            return;
        }

        const [hours, minutes] = (settings.send_time || '19:00:00').split(':');
        const days = settings.days_of_week || '1-6';
        const cronStr = `${minutes} ${hours} * * ${days}`;

        currentCronJob = cron.schedule(cronStr, () => {
            console.log('[DailyBookAutomation] Cron triggered at', new Date().toLocaleString());
            executeDailyBook().catch(e => console.error(e));
        }, {
            scheduled: true,
            timezone: settings.timezone || "Asia/Kolkata"
        });

        console.log(`[DailyBookAutomation] Cron scheduled: ${cronStr} (${settings.timezone})`);
    } catch (error) {
        console.error('[DailyBookAutomation] Failed to initialize cron:', error);
    }
}

module.exports = {
    initializeDailyBookCron,
    executeDailyBook,
    checkAndSendMorningUpdate
};

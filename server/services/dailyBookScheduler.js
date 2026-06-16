const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { pool } = require('../database');
const { fetchDailyBookData } = require('./dailyBookCollector');
const { generateDailyBookPdf } = require('./dailyBookPdfGenerator');
const { generateDailyBookExcel } = require('./dailyBookExcelGenerator');

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
    const today = getTodayStr();
    const startTime = Date.now();
    let logId = null;

    try {
        const [settingsRows] = await pool.query('SELECT * FROM sarga_daily_report_settings LIMIT 1');
        if (settingsRows.length === 0) return { success: false, message: 'Settings not configured' };
        const settings = settingsRows[0];

        if (!settings.is_enabled && !isTest && !forceRun) {
            return { success: false, message: 'Daily book is disabled' };
        }

        // Lock/prevent duplicates unless forceRun
        if (!isTest && !forceRun) {
            const [existing] = await pool.query(
                `SELECT id, status FROM sarga_daily_report_logs WHERE report_date = ? AND status IN ('Success', 'Running')`,
                [today]
            );
            if (existing.length > 0) {
                return { success: false, message: 'Report already sent or running for today' };
            }

            const [insertLog] = await pool.query(
                `INSERT INTO sarga_daily_report_logs (report_date, status) VALUES (?, 'Running')`,
                [today]
            );
            logId = insertLog.insertId;
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_FROM || 'sargadailyreport@gmail.com',
                pass: process.env.EMAIL_PASS || ''
            }
        });

        const [branches] = await pool.query('SELECT id, name FROM sarga_branches');
        const overrides = (() => { try { return JSON.parse(settings.branch_overrides || '{}'); } catch { return {}; } })();

        const dateStart = `${today} 00:00:00`;
        const dateEnd = `${today} ${settings.send_time || '20:00:00'}`;

        let allEmails = new Set();
        if (settings.recipients_admin) settings.recipients_admin.split(',').forEach(e => allEmails.add(e.trim()));
        if (settings.recipients_accounts) settings.recipients_accounts.split(',').forEach(e => allEmails.add(e.trim()));

        // Process branches
        for (const branch of branches) {
            const data = await fetchDailyBookData(dateStart, dateEnd, branch.id);
            
            const attachments = [];
            if (settings.format_pdf) {
                const pdfBuf = await generateDailyBookPdf(data, today, branch.name);
                attachments.push({
                    filename: `dailybook_${today}_${branch.name}.pdf`,
                    content: pdfBuf,
                    contentType: 'application/pdf'
                });
            }
            if (settings.format_excel) {
                const xlsxBuf = generateDailyBookExcel(data, today, branch.name);
                attachments.push({
                    filename: `dailybook_${today}_${branch.name}.xlsx`,
                    content: xlsxBuf,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
            }

            const branchEmail = overrides[branch.name] || '';
            const toRecipients = [...allEmails, branchEmail].filter(e => e).join(', ');

            if (toRecipients && attachments.length > 0) {
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM || 'sargadailyreport@gmail.com',
                    to: toRecipients,
                    cc: settings.recipients_cc || '',
                    bcc: settings.recipients_bcc || '',
                    subject: `${isTest ? '[TEST] ' : ''}Daily Book Report – ${today} (${branch.name})`,
                    html: `<h3>Daily Cash Book Report</h3>
                           <p>Branch: <b>${branch.name}</b></p>
                           <p>Date: <b>${today}</b></p>
                           <p>Total Sales: Rs. ${data.summary.totalSales}</p>
                           <p>Net Cash: Rs. ${data.cashSummary.netCash}</p>
                           <hr />
                           <p><small>Generated automatically.</small></p>`,
                    attachments
                });
            }
        }

        // Send Combined Report
        const combinedData = await fetchDailyBookData(dateStart, dateEnd, null);
        const combinedAttachments = [];
        if (settings.format_pdf) {
            const pdfBuf = await generateDailyBookPdf(combinedData, today, 'Combined (All Branches)');
            combinedAttachments.push({
                filename: `dailybook_${today}_combined.pdf`,
                content: pdfBuf,
                contentType: 'application/pdf'
            });
        }
        if (settings.format_excel) {
            const xlsxBuf = generateDailyBookExcel(combinedData, today, 'Combined (All Branches)');
            combinedAttachments.push({
                filename: `dailybook_${today}_combined.xlsx`,
                content: xlsxBuf,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
        }

        const toCombined = [...allEmails].filter(e => e).join(', ');
        if (toCombined && combinedAttachments.length > 0) {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM || 'sargadailyreport@gmail.com',
                to: toCombined,
                cc: settings.recipients_cc || '',
                bcc: settings.recipients_bcc || '',
                subject: `${isTest ? '[TEST] ' : ''}Daily Book Report – ${today} (Combined)`,
                html: `<h3>Daily Cash Book Report (Combined)</h3>
                       <p>Date: <b>${today}</b></p>
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
            // Check retry logic
            const [logRow] = await pool.query('SELECT retry_count FROM sarga_daily_report_logs WHERE id = ?', [logId]);
            const retryCount = logRow[0].retry_count;
            const maxRetries = 3;
            
            if (retryCount < maxRetries) {
                await pool.query(
                    `UPDATE sarga_daily_report_logs SET status = 'Retrying', error = ?, retry_count = retry_count + 1 WHERE id = ?`,
                    [error.message, logId]
                );
                
                // Schedule retry in 10 minutes (simplified for this script, standard setTimeout)
                console.log(`[DailyBookAutomation] Scheduling retry ${retryCount + 1}/${maxRetries} in 10 minutes`);
                setTimeout(() => {
                    executeDailyBook(false, true);
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

async function initializeDailyBookCron() {
    try {
        if (currentCronJob) {
            currentCronJob.stop();
        }

        const [rows] = await pool.query('SELECT * FROM sarga_daily_report_settings LIMIT 1');
        if (rows.length === 0) return;
        const settings = rows[0];

        if (!settings.is_enabled) {
            console.log('[DailyBookAutomation] Cron disabled in settings.');
            return;
        }

        const [hours, minutes] = (settings.send_time || '20:00:00').split(':');
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
    executeDailyBook
};

/**
 * Daily Report Auto-Mailer
 * ─────────────────────────
 * Generates PDF reports for each branch (Offset, Laser, Other books)
 * and emails them at 11:59 PM daily.
 *
 * • Integrated into the server process via require() in index.js
 * • Can also be run standalone: node scripts/sendDailyReports.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const { pool } = require('../database');

const EMAIL_FROM = process.env.EMAIL_FROM || 'sargadailyreport@gmail.com';
const EMAIL_TO = process.env.EMAIL_TO || 'sargadailyreport@gmail.com';   // admin/fallback
const EMAIL_PASS = process.env.EMAIL_PASS || '';

/**
 * Get the per-branch email from env vars.
 * Env key format: BRANCH_EMAIL_<NAME_UPPERCASE_SPACES_AS_UNDERSCORE>
 * e.g. PERAMBRA → BRANCH_EMAIL_PERAMBRA
 *      MEPPAYUR → BRANCH_EMAIL_MEPPAYUR
 * Falls back to EMAIL_TO if not configured.
 */
function getBranchEmail(branchName) {
    const key = 'BRANCH_EMAIL_' + branchName.trim().toUpperCase().replace(/\s+/g, '_');
    return process.env[key] || EMAIL_TO;
}

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (n) => Number(n || 0).toLocaleString('en-IN');
const todayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

/* ═══════════════════════════════════════════════
   DATA FETCHERS  (reuse logic from dailyReportUnified.js)
   ═══════════════════════════════════════════════ */

async function fetchOffsetData(date, branchId) {
    const [customerPayments] = await pool.query(
        `SELECT cp.id, cp.customer_name, cp.total_amount, cp.advance_paid,
                cp.payment_method, cp.cash_amount, cp.upi_amount,
                cp.description, cp.reference_number, cp.created_at
         FROM sarga_customer_payments cp
         WHERE DATE(cp.payment_date) = ? AND cp.branch_id = ?
         ORDER BY cp.created_at ASC`, [date, branchId]
    );
    const [expensePayments] = await pool.query(
        `SELECT p.id, p.type, p.payee_name, p.amount, p.payment_method,
                p.cash_amount, p.upi_amount, p.description, p.reference_number, p.created_at
         FROM sarga_payments p
         WHERE DATE(p.payment_date) = ? AND p.branch_id = ?
         ORDER BY p.created_at ASC`, [date, branchId]
    );

    let totalCashIn = 0, totalUpiIn = 0, totalCashOut = 0, totalUpiOut = 0;

    const incomeEntries = customerPayments.map(cp => {
        const cashAmt = Number(cp.cash_amount || 0), upiAmt = Number(cp.upi_amount || 0);
        const advPaid = Number(cp.advance_paid || 0);
        const method = cp.payment_method || 'Cash';
        let cashIn = 0, upiIn = 0;
        if (method === 'Both') { cashIn = cashAmt; upiIn = upiAmt; }
        else if (method === 'UPI') { upiIn = advPaid; }
        else { cashIn = advPaid; }
        totalCashIn += cashIn; totalUpiIn += upiIn;
        return { type: 'income', description: cp.customer_name, details: cp.description || '', method, cashIn, upiIn, total: advPaid, time: cp.created_at };
    });

    const expenseEntries = expensePayments.map(p => {
        const amount = Number(p.amount || 0), cashAmt = Number(p.cash_amount || 0), upiAmt = Number(p.upi_amount || 0);
        const method = p.payment_method || 'Cash';
        let cashOut = 0, upiOut = 0;
        if (method === 'Both') { cashOut = cashAmt; upiOut = upiAmt; }
        else if (method === 'UPI') { upiOut = amount; }
        else { cashOut = amount; }
        totalCashOut += cashOut; totalUpiOut += upiOut;
        return { type: 'expense', description: `${p.type}: ${p.payee_name}`, details: p.description || '', method, cashOut, upiOut, total: amount, time: p.created_at };
    });

    const [openingRows] = await pool.query(
        `SELECT cash_opening FROM sarga_daily_opening_balances WHERE report_date = ? AND branch_id = ? AND book_type = 'Offset'`,
        [date, branchId]
    );
    const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;

    return {
        incomeEntries, expenseEntries, cashOpening,
        totalCashIn, totalUpiIn, totalCashOut, totalUpiOut,
        cashClosing: cashOpening + totalCashIn - totalCashOut
    };
}

async function fetchLaserData(date, branchId) {
    const [machines] = await pool.query(
        `SELECT m.id, m.machine_name FROM sarga_machines m WHERE m.branch_id = ? AND m.is_active = 1 AND m.machine_type = 'Digital' ORDER BY m.machine_name ASC`,
        [branchId]
    );
    const machineIds = machines.map(m => m.id);
    let readings = [], workEntries = [];

    if (machineIds.length > 0) {
        const [readingRows] = await pool.query(
            `SELECT mr.machine_id, mr.opening_count, mr.closing_count, mr.total_copies FROM sarga_machine_readings mr WHERE mr.reading_date = ? AND mr.machine_id IN (${machineIds.map(() => '?').join(',')})`,
            [date, ...machineIds]
        );
        readings = readingRows;

        const [reports] = await pool.query(
            `SELECT drm.id as report_id, drm.machine_id FROM sarga_daily_report_machine drm WHERE drm.report_date = ? AND drm.machine_id IN (${machineIds.map(() => '?').join(',')})`,
            [date, ...machineIds]
        );
        const reportIds = reports.map(r => r.report_id);
        if (reportIds.length > 0) {
            const [entries] = await pool.query(
                `SELECT mwe.*, drm.machine_id, m.machine_name FROM sarga_machine_work_entries mwe
                 JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
                 JOIN sarga_machines m ON drm.machine_id = m.id
                 WHERE mwe.report_id IN (${reportIds.map(() => '?').join(',')}) ORDER BY mwe.entry_time ASC`,
                [...reportIds]
            );
            workEntries = entries.map(e => ({
                machine_name: e.machine_name, description: e.customer_name, details: e.work_details,
                copies: Number(e.copies || 0), method: e.payment_type,
                cashIn: Number(e.cash_amount || 0), upiIn: Number(e.upi_amount || 0),
                total: Number(e.total_amount || 0), time: e.entry_time
            }));
        }
    }

    const machineData = machines.map(m => {
        const r = readings.find(rd => rd.machine_id === m.id);
        return { name: m.machine_name, opening: r ? Number(r.opening_count) : 0, closing: r ? (r.closing_count !== null ? Number(r.closing_count) : null) : null, copies: r ? Number(r.total_copies || 0) : 0 };
    });

    let totalCashIn = 0, totalUpiIn = 0, totalCopies = 0;
    workEntries.forEach(e => { totalCashIn += e.cashIn; totalUpiIn += e.upiIn; totalCopies += e.copies; });

    const [openingRows] = await pool.query(
        `SELECT cash_opening FROM sarga_daily_opening_balances WHERE report_date = ? AND branch_id = ? AND book_type = 'Laser'`,
        [date, branchId]
    );
    const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;

    return { machineData, workEntries, cashOpening, totalCashIn, totalUpiIn, totalCopies, cashClosing: cashOpening + totalCashIn };
}

async function fetchOtherData(date, branchId) {
    const [otherJobs] = await pool.query(
        `SELECT j.id, j.job_number, j.job_name, j.description, j.total_amount,
                j.advance_paid, j.payment_status, COALESCE(c.name, 'Walk-in') as customer_name, j.created_at
         FROM sarga_jobs j LEFT JOIN sarga_customers c ON j.customer_id = c.id
         WHERE DATE(j.created_at) = ? AND j.branch_id = ? AND j.category = 'Other'
         ORDER BY j.created_at ASC`, [date, branchId]
    );

    let totalCashIn = 0;
    const entries = otherJobs.map(j => {
        const total = Number(j.advance_paid || 0);
        totalCashIn += total;
        return { description: `${j.job_number} - ${j.customer_name}`, details: j.job_name || j.description || '', total, time: j.created_at };
    });

    const [openingRows] = await pool.query(
        `SELECT cash_opening FROM sarga_daily_opening_balances WHERE report_date = ? AND branch_id = ? AND book_type = 'Other'`,
        [date, branchId]
    );
    const cashOpening = openingRows.length > 0 ? Number(openingRows[0].cash_opening) : 0;

    return { entries, cashOpening, totalCashIn, cashClosing: cashOpening + totalCashIn };
}

/* ═══════════════════════════════════════════════
   PDF GENERATION
   ═══════════════════════════════════════════════ */

function generatePDF(branchName, date, offset, laser, other) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];
        doc.on('data', b => buffers.push(b));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageW = doc.page.width;
        const m = 40; // margin
        const contentW = pageW - m * 2;

        // ── Colors ──
        const DARK = '#1f2a33';
        const BLUE = '#2563eb';
        const PURPLE = '#7c3aed';
        const GREEN = '#059669';
        const RED = '#dc2626';
        const GRAY = '#6b7280';
        const LIGHT_BG = '#f8fafc';

        // ── Header ──
        const renderHeader = () => {
            doc.rect(0, 0, pageW, 70).fill(DARK);
            doc.fillColor('#fff').fontSize(22).font('Helvetica-Bold').text('SARGA', m, 16);
            doc.fontSize(10).font('Helvetica').text('DAILY CASH BOOK REPORT', m, 38);
            doc.fontSize(9).text(`${branchName}  |  ${fmtDate(date)}`, m, 52);
            doc.fontSize(8).text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageW - m - 160, 52);
            doc.fillColor('#000');
        };

        // ── Section header ──
        const sectionHeader = (title, color, y) => {
            doc.rect(m, y, contentW, 22).fill(color);
            doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text(title, m + 8, y + 6);
            doc.fillColor('#000');
            return y + 28;
        };

        // ── Key-value row ──
        const kvRow = (label, value, y, opts = {}) => {
            if (y > 760) { doc.addPage(); renderHeader(); y = 85; }
            doc.fontSize(9).font('Helvetica').fillColor(GRAY).text(label, m + 4, y);
            doc.font('Helvetica-Bold').fillColor(opts.color || '#1e1e1e').text(String(value), m + 4, y, { width: contentW - 8, align: 'right' });
            doc.fillColor('#000');
            return y + 16;
        };

        // ── Table ──
        const renderTable = (headers, rows, y, colWidths) => {
            const totalW = colWidths.reduce((a, b) => a + b, 0);
            // Table header
            if (y > 720) { doc.addPage(); renderHeader(); y = 85; }
            doc.rect(m, y, totalW, 18).fill('#e2e8f0');
            let x = m;
            headers.forEach((h, i) => {
                doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold').text(h, x + 3, y + 5, { width: colWidths[i] - 6 });
                x += colWidths[i];
            });
            y += 18;
            doc.fillColor('#000');

            // Table rows
            rows.forEach((row, idx) => {
                if (y > 750) { doc.addPage(); renderHeader(); y = 85; }
                if (idx % 2 === 0) doc.rect(m, y, totalW, 15).fill(LIGHT_BG);
                x = m;
                row.forEach((cell, i) => {
                    doc.fillColor('#374151').fontSize(7).font('Helvetica').text(String(cell), x + 3, y + 4, { width: colWidths[i] - 6 });
                    x += colWidths[i];
                });
                y += 15;
                doc.fillColor('#000');
            });
            return y + 6;
        };

        // ════════════════════════════════════════
        //   PAGE 1: OFFSET BOOK
        // ════════════════════════════════════════
        renderHeader();
        let y = 85;

        y = sectionHeader('OFFSET BOOK', BLUE, y);
        y = kvRow('Opening Cash Balance', fmt(offset.cashOpening), y);
        y += 4;

        // Income entries
        if (offset.incomeEntries.length > 0) {
            doc.fontSize(9).font('Helvetica-Bold').fillColor(GREEN).text('INCOME ENTRIES', m + 4, y);
            y += 14;
            const iCols = [140, 70, 60, 60, 60, 60, 65];
            y = renderTable(
                ['Description', 'Time', 'Method', 'Cash In', 'UPI In', 'Total', 'Ref/Details'],
                offset.incomeEntries.map(e => [
                    e.description, fmtTime(e.time), e.method,
                    fmt(e.cashIn), fmt(e.upiIn), fmt(e.total), e.details || ''
                ]),
                y, iCols
            );
        }

        // Expense entries
        if (offset.expenseEntries.length > 0) {
            doc.fontSize(9).font('Helvetica-Bold').fillColor(RED).text('EXPENSE ENTRIES', m + 4, y);
            y += 14;
            const eCols = [160, 70, 70, 70, 70, 75];
            y = renderTable(
                ['Description', 'Time', 'Method', 'Cash Out', 'UPI Out', 'Total'],
                offset.expenseEntries.map(e => [
                    e.description, fmtTime(e.time), e.method,
                    fmt(e.cashOut), fmt(e.upiOut), fmt(e.total)
                ]),
                y, eCols
            );
        }

        // Summary
        y += 4;
        if (y > 700) { doc.addPage(); renderHeader(); y = 85; }
        doc.rect(m, y, contentW, 2).fill(BLUE);
        y += 8;
        y = kvRow('Total Cash In', fmt(offset.totalCashIn), y, { color: GREEN });
        y = kvRow('Total UPI In', fmt(offset.totalUpiIn), y, { color: GREEN });
        y = kvRow('Total Cash Out', fmt(offset.totalCashOut), y, { color: RED });
        y = kvRow('Total UPI Out', fmt(offset.totalUpiOut), y, { color: RED });
        y = kvRow('CLOSING CASH BALANCE', fmt(offset.cashClosing), y, { color: BLUE });

        // ════════════════════════════════════════
        //   PAGE 2: LASER BOOK
        // ════════════════════════════════════════
        doc.addPage();
        renderHeader();
        y = 85;

        y = sectionHeader('LASER BOOK', PURPLE, y);
        y = kvRow('Opening Cash Balance', fmt(laser.cashOpening), y);
        y += 4;

        // Machine readings
        if (laser.machineData.length > 0) {
            doc.fontSize(9).font('Helvetica-Bold').fillColor(PURPLE).text('MACHINE READINGS', m + 4, y);
            y += 14;
            const mCols = [150, 100, 100, 100, 65];
            y = renderTable(
                ['Machine', 'Opening Count', 'Closing Count', 'Today Copies', 'Status'],
                laser.machineData.map(m => [
                    m.name, fmtInt(m.opening), m.closing !== null ? fmtInt(m.closing) : '—',
                    fmtInt(m.copies), m.closing !== null ? '✓' : 'Pending'
                ]),
                y, mCols
            );
        }

        // Work entries
        if (laser.workEntries.length > 0) {
            doc.fontSize(9).font('Helvetica-Bold').fillColor(PURPLE).text('WORK ENTRIES', m + 4, y);
            y += 14;
            const wCols = [90, 80, 55, 50, 50, 55, 55, 80];
            y = renderTable(
                ['Description', 'Machine', 'Time', 'Copies', 'Method', 'Cash', 'UPI', 'Total'],
                laser.workEntries.map(e => [
                    e.description || '', e.machine_name, fmtTime(e.time),
                    fmtInt(e.copies), e.method || 'Cash', fmt(e.cashIn), fmt(e.upiIn), fmt(e.total)
                ]),
                y, wCols
            );
        }

        // Summary
        y += 4;
        if (y > 700) { doc.addPage(); renderHeader(); y = 85; }
        doc.rect(m, y, contentW, 2).fill(PURPLE);
        y += 8;
        y = kvRow('Total Cash In', fmt(laser.totalCashIn), y, { color: GREEN });
        y = kvRow('Total UPI In', fmt(laser.totalUpiIn), y, { color: GREEN });
        y = kvRow('Total Copies', fmtInt(laser.totalCopies), y, { color: PURPLE });
        y = kvRow('CLOSING CASH BALANCE', fmt(laser.cashClosing), y, { color: PURPLE });

        // ════════════════════════════════════════
        //   PAGE 3: OTHER BOOK
        // ════════════════════════════════════════
        doc.addPage();
        renderHeader();
        y = 85;

        y = sectionHeader('OTHER BOOK', GREEN, y);
        y = kvRow('Opening Cash Balance', fmt(other.cashOpening), y);
        y += 4;

        if (other.entries.length > 0) {
            const oCols = [180, 100, 100, 135];
            y = renderTable(
                ['Description', 'Time', 'Amount', 'Details'],
                other.entries.map(e => [e.description, fmtTime(e.time), fmt(e.total), e.details || '']),
                y, oCols
            );
        } else {
            doc.fontSize(9).font('Helvetica').fillColor(GRAY).text('No entries for today.', m + 4, y);
            y += 16;
        }

        y += 4;
        doc.rect(m, y, contentW, 2).fill(GREEN);
        y += 8;
        y = kvRow('Total Cash In', fmt(other.totalCashIn), y, { color: GREEN });
        y = kvRow('CLOSING CASH BALANCE', fmt(other.cashClosing), y, { color: GREEN });

        // ════════════════════════════════════════
        //   GRAND SUMMARY
        // ════════════════════════════════════════
        y += 10;
        if (y > 650) { doc.addPage(); renderHeader(); y = 85; }
        y = sectionHeader('GRAND SUMMARY', DARK, y);
        const grandCashIn = offset.totalCashIn + laser.totalCashIn + other.totalCashIn;
        const grandUpiIn = offset.totalUpiIn + laser.totalUpiIn + (0);
        const grandCashOut = offset.totalCashOut;
        const grandOpening = offset.cashOpening + laser.cashOpening + other.cashOpening;
        const grandClosing = offset.cashClosing + laser.cashClosing + other.cashClosing;

        y = kvRow('Total Opening (All Books)', fmt(grandOpening), y);
        y = kvRow('Total Cash Income', fmt(grandCashIn), y, { color: GREEN });
        y = kvRow('Total UPI Income', fmt(grandUpiIn), y, { color: GREEN });
        y = kvRow('Total Cash Expenses', fmt(grandCashOut), y, { color: RED });
        y = kvRow('Laser Copies Today', fmtInt(laser.totalCopies), y, { color: PURPLE });
        y += 4;
        doc.rect(m, y, contentW, 2).fill(DARK);
        y += 8;
        y = kvRow('GRAND CLOSING BALANCE', fmt(grandClosing), y, { color: BLUE });

        doc.end();
    });
}

/* ═══════════════════════════════════════════════
   MAIN: Send reports for all branches
   ═══════════════════════════════════════════════ */

async function sendDailyReports() {
    const date = todayStr();
    console.log(`[DailyReportMailer] Starting for date: ${date}`);

    try {
        const [branches] = await pool.query('SELECT id, name FROM sarga_branches');
        if (branches.length === 0) {
            console.log('[DailyReportMailer] No branches found.');
            return;
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: EMAIL_FROM, pass: EMAIL_PASS }
        });

        // Verify connection
        try {
            await transporter.verify();
            console.log('[DailyReportMailer] SMTP connection verified.');
        } catch (verifyErr) {
            console.error('[DailyReportMailer] SMTP verify failed:', verifyErr.message);
            console.error('[DailyReportMailer] Check EMAIL_PASS in .env — must be a Gmail App Password.');
            return;
        }

        for (const branch of branches) {
            try {
                console.log(`[DailyReportMailer] Generating PDF for branch: ${branch.name}`);

                const [offset, laser, other] = await Promise.all([
                    fetchOffsetData(date, branch.id),
                    fetchLaserData(date, branch.id),
                    fetchOtherData(date, branch.id)
                ]);

                // Skip if no data at all → still send, but mark as "No Activity"
                const hasData = offset.incomeEntries.length > 0 || offset.expenseEntries.length > 0 ||
                    laser.workEntries.length > 0 || other.entries.length > 0;
                if (!hasData) {
                    console.log(`[DailyReportMailer] No data for ${branch.name}, sending "No Activity" report.`);
                }

                const pdfBuffer = await generatePDF(branch.name, date, offset, laser, other);

                // Build recipient list: branch-specific email + admin (deduplicated)
                const branchEmail = getBranchEmail(branch.name);
                const recipients = [...new Set([branchEmail, EMAIL_TO])].join(', ');

                const subject = hasData
                    ? `${branch.name} — Daily Report ${fmtDate(date)}`
                    : `${branch.name} — Daily Report ${fmtDate(date)} (No Activity)`;
                await transporter.sendMail({
                    from: EMAIL_FROM,
                    to: recipients,
                    subject,
                    text: hasData
                        ? `Daily Cash Book Report\nBranch: ${branch.name}\nDate: ${fmtDate(date)}\n\nThis is an automated report. Please see the attached PDF.`
                        : `Daily Cash Book Report\nBranch: ${branch.name}\nDate: ${fmtDate(date)}\n\nNo transactions were recorded today. PDF summary attached.`,
                    attachments: [{
                        filename: `${branch.name.replace(/[^a-zA-Z0-9]/g, '_')}-${date}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }]
                });

                console.log(`[DailyReportMailer] ✓ Report sent for ${branch.name} → ${recipients}`);
            } catch (branchErr) {
                console.error(`[DailyReportMailer] Error for branch ${branch.name}:`, branchErr.message);
            }
        }

        console.log('[DailyReportMailer] All done.');
    } catch (err) {
        console.error('[DailyReportMailer] Fatal error:', err);
    }
}

/* ═══════════════════════════════════════════════
   CRON SCHEDULER — 11:59 PM daily
   ═══════════════════════════════════════════════ */

cron.schedule('59 23 * * *', () => {
    console.log('[DailyReportMailer] Cron triggered at 11:59 PM');
    sendDailyReports();
});

console.log('[DailyReportMailer] Cron scheduled for 11:59 PM daily.');

/* ═══════════════════════════════════════════════
   STANDALONE RUN
   ═══════════════════════════════════════════════ */

if (require.main === module) {
    sendDailyReports().then(() => {
        console.log('[DailyReportMailer] Manual run complete.');
        setTimeout(() => process.exit(0), 2000);
    });
}

module.exports = { sendDailyReports };

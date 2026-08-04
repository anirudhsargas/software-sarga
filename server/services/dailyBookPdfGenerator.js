const PDFDocument = require('pdfkit');

function generateDailyBookPdf(data, reportDate, branchName) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];
        doc.on('data', b => buffers.push(b));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageW = doc.page.width;
        const m = 40; // margin
        const contentW = pageW - m * 2;

        const DARK = '#1f2a33';
        const BLUE = '#2563eb';
        const GRAY = '#6b7280';
        const LIGHT_BG = '#f8fafc';
        const GREEN = '#059669';
        const RED = '#dc2626';

        const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const _fmtInt = (n) => Number(n || 0).toLocaleString('en-IN');

        const renderHeader = () => {
            doc.rect(0, 0, pageW, 70).fill(DARK);
            doc.fillColor('#fff').fontSize(22).font('Helvetica-Bold').text('SARGA', m, 16);
            doc.fontSize(10).font('Helvetica').text('COMPREHENSIVE DAILY BOOK REPORT', m, 38);
            doc.fontSize(9).text(`Branch: ${branchName}  |  Date: ${reportDate}`, m, 52);
            doc.fontSize(8).text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageW - m - 160, 52);
            doc.fillColor('#000');
        };

        const sectionHeader = (title, color, y) => {
            doc.rect(m, y, contentW, 22).fill(color);
            doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text(title, m + 8, y + 6);
            doc.fillColor('#000');
            return y + 28;
        };

        const kvRow = (label, value, y, opts = {}) => {
            if (y > 760) { doc.addPage(); renderHeader(); y = 85; }
            doc.fontSize(9).font('Helvetica').fillColor(GRAY).text(label, m + 4, y);
            doc.font('Helvetica-Bold').fillColor(opts.color || '#1e1e1e').text(String(value), m + 4, y, { width: contentW - 8, align: 'right' });
            doc.fillColor('#000');
            return y + 16;
        };

        renderHeader();
        let y = 85;

        // SUMMARY SECTION
        y = sectionHeader('EXECUTIVE SUMMARY', BLUE, y);
        y = kvRow('Total Sales', fmt(data.summary.totalSales), y);
        y = kvRow('Total Expenses', fmt(data.summary.totalExpenses), y);
        y = kvRow('Total Purchases', fmt(data.summary.totalPurchases), y);
        y = kvRow('Total Payments Received', fmt(data.summary.totalPaymentsReceived), y, { color: GREEN });
        y = kvRow('Outstanding Jobs', fmt(data.summary.outstandingJobs), y, { color: RED });
        y += 10;

        // CASH & UPI SUMMARY
        y = sectionHeader('CASH & UPI SUMMARY', DARK, y);
        y = kvRow('Net Cash', fmt(data.cashSummary.netCash), y, { color: data.cashSummary.netCash >= 0 ? GREEN : RED });
        y = kvRow('  Cash In', fmt(data.cashSummary.cashIn), y);
        y = kvRow('  Cash Out', fmt(data.cashSummary.cashOut), y);
        y += 5;
        y = kvRow('Net UPI', fmt(data.upiSummary.netUpi), y, { color: data.upiSummary.netUpi >= 0 ? GREEN : RED });
        y = kvRow('  UPI In', fmt(data.upiSummary.upiIn), y);
        y = kvRow('  UPI Out', fmt(data.upiSummary.upiOut), y);
        y += 10;

        // PAYMENTS DETAIL (first 15 entries)
        if (data.payments && data.payments.length > 0) {
            if (y > 600) { doc.addPage(); renderHeader(); y = 85; }
            y = sectionHeader('RECENT PAYMENTS RECEIVED', GREEN, y);
            const pShow = data.payments.slice(0, 15);
            pShow.forEach((p, idx) => {
                if (y > 750) { doc.addPage(); renderHeader(); y = 85; }
                if (idx % 2 === 0) doc.rect(m, y, contentW, 15).fill(LIGHT_BG);
                doc.fillColor('#374151').fontSize(8).font('Helvetica')
                   .text(p.customer_name || 'Customer', m+4, y+4, { width: 150 })
                   .text(p.payment_method, m+154, y+4, { width: 80 })
                   .text(fmt(p.advance_paid), m+234, y+4, { width: 100, align: 'right' });
                y += 15;
                doc.fillColor('#000');
            });
            if (data.payments.length > 15) {
                y += 5;
                doc.fontSize(8).fillColor(GRAY).text(`+ ${data.payments.length - 15} more entries (see Excel)`, m+4, y);
                y += 15;
            }
            y += 10;
        }

        // EXPENSES DETAIL (first 15 entries)
        if (data.expenses && data.expenses.length > 0) {
            if (y > 600) { doc.addPage(); renderHeader(); y = 85; }
            y = sectionHeader('RECENT EXPENSES', RED, y);
            const eShow = data.expenses.slice(0, 15);
            eShow.forEach((e, idx) => {
                if (y > 750) { doc.addPage(); renderHeader(); y = 85; }
                if (idx % 2 === 0) doc.rect(m, y, contentW, 15).fill(LIGHT_BG);
                doc.fillColor('#374151').fontSize(8).font('Helvetica')
                   .text(e.payee_name || 'Payee', m+4, y+4, { width: 150 })
                   .text(e.payment_method, m+154, y+4, { width: 80 })
                   .text(fmt(e.amount), m+234, y+4, { width: 100, align: 'right' });
                y += 15;
                doc.fillColor('#000');
            });
            if (data.expenses.length > 15) {
                y += 5;
                doc.fontSize(8).fillColor(GRAY).text(`+ ${data.expenses.length - 15} more entries (see Excel)`, m+4, y);
                y += 15;
            }
        }

        // END FOOTER
        doc.fontSize(8).fillColor(GRAY).text('Generated automatically. See Excel for complete detailed data.', m, doc.page.height - 30, { align: 'center' });

        doc.end();
    });
}

function generateBackupPdf(data, reportDate, branchName) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];
        doc.on('data', b => buffers.push(b));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageW = doc.page.width;
        const m = 40;
        const contentW = pageW - m * 2;

        const DARK = '#1f2a33';
        const BLUE = '#2563eb';
        const GRAY = '#6b7280';
        const LIGHT_BG = '#f8fafc';
        const GREEN = '#059669';
        const RED = '#dc2626';

        const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const renderHeader = (titleText) => {
            doc.rect(0, 0, pageW, 70).fill(DARK);
            doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold').text('SARGA ERP DAILY SYSTEM BACKUP', m, 16);
            doc.fontSize(10).font('Helvetica').text(titleText.toUpperCase(), m, 38);
            doc.fontSize(9).text(`Branch: ${branchName}  |  Date: ${reportDate}`, m, 52);
            doc.fontSize(8).text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageW - m - 160, 52);
            doc.fillColor('#000');
        };

        const sectionHeader = (title, color, y) => {
            if (y > 720) { doc.addPage(); renderHeader('Detailed Backup Logs'); y = 85; }
            doc.rect(m, y, contentW, 22).fill(color);
            doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text(title, m + 8, y + 6);
            doc.fillColor('#000');
            return y + 28;
        };

        renderHeader('Detailed Backup Logs');
        let y = 85;

        // 1. JOBS / ORDERS LIST (All items)
        y = sectionHeader('TODAY\'S ORDERS (JOBS)', BLUE, y);
        if (!data.jobs || data.jobs.length === 0) {
            doc.fontSize(9).fillColor(GRAY).text('No orders created today.', m + 4, y);
            y += 20;
        } else {
            // Draw table header
            doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK);
            doc.text('Job No', m + 4, y);
            doc.text('Customer', m + 64, y);
            doc.text('Job Name / Category', m + 174, y);
            doc.text('Status', m + 324, y);
            doc.text('Total', m + 404, y, { width: 60, align: 'right' });
            doc.text('Balance', m + 464, y, { width: 50, align: 'right' });
            y += 14;
            doc.line(m, y, pageW - m, y).stroke();
            y += 6;

            data.jobs.forEach((j, idx) => {
                if (y > 750) { doc.addPage(); renderHeader('Detailed Backup Logs'); y = 85; }
                if (idx % 2 === 0) doc.rect(m, y - 2, contentW, 14).fill(LIGHT_BG);
                doc.fillColor('#374151').fontSize(7.5).font('Helvetica')
                   .text(j.job_number || '—', m + 4, y)
                   .text(j.customer_name || 'Walk-in', m + 64, y, { width: 105, height: 12, overflow: 'ellipses' })
                   .text(`${j.job_name || '—'} (${j.category || '—'})`, m + 174, y, { width: 145, height: 12, overflow: 'ellipses' })
                   .text(`${j.status} / ${j.payment_status}`, m + 324, y, { width: 75, height: 12, overflow: 'ellipses' })
                   .text(fmt(j.total_amount), m + 404, y, { width: 60, align: 'right' })
                   .text(fmt(j.balance_amount), m + 464, y, { width: 50, align: 'right' });
                y += 14;
            });
            y += 10;
        }

        // 2. CUSTOMER PAYMENTS LIST (All items)
        if (y > 680) { doc.addPage(); renderHeader('Detailed Backup Logs'); y = 85; }
        y = sectionHeader('TODAY\'S CUSTOMER PAYMENTS', GREEN, y);
        if (!data.payments || data.payments.length === 0) {
            doc.fontSize(9).fillColor(GRAY).text('No customer payments received today.', m + 4, y);
            y += 20;
        } else {
            // Draw table header
            doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK);
            doc.text('Customer Name', m + 4, y);
            doc.text('Payment Method', m + 184, y);
            doc.text('Amount Received', m + 294, y, { width: 100, align: 'right' });
            doc.text('Description / Ref No', m + 404, y, { width: 110 });
            y += 14;
            doc.line(m, y, pageW - m, y).stroke();
            y += 6;

            data.payments.forEach((p, idx) => {
                if (y > 750) { doc.addPage(); renderHeader('Detailed Backup Logs'); y = 85; }
                if (idx % 2 === 0) doc.rect(m, y - 2, contentW, 14).fill(LIGHT_BG);
                doc.fillColor('#374151').fontSize(7.5).font('Helvetica')
                   .text(p.customer_name || 'Customer', m + 4, y, { width: 175, height: 12, overflow: 'ellipses' })
                   .text(p.payment_method || 'Cash', m + 184, y)
                   .text(fmt(p.advance_paid), m + 294, y, { width: 100, align: 'right' })
                   .text(`${p.description || ''} ${p.reference_number ? `(Ref: ${p.reference_number})` : ''}`, m + 404, y, { width: 110, height: 12, overflow: 'ellipses' });
                y += 14;
            });
            y += 10;
        }

        // 3. EXPENSES LIST (All items)
        if (y > 680) { doc.addPage(); renderHeader('Detailed Backup Logs'); y = 85; }
        y = sectionHeader('TODAY\'S EXPENSES & PAYMENTS OUT', RED, y);
        if (!data.expenses || data.expenses.length === 0) {
            doc.fontSize(9).fillColor(GRAY).text('No expenses recorded today.', m + 4, y);
            y += 20;
        } else {
            // Draw table header
            doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK);
            doc.text('Payee Name', m + 4, y);
            doc.text('Category / Type', m + 154, y);
            doc.text('Payment Method', m + 254, y);
            doc.text('Amount', m + 354, y, { width: 70, align: 'right' });
            doc.text('Description', m + 434, y, { width: 80 });
            y += 14;
            doc.line(m, y, pageW - m, y).stroke();
            y += 6;

            data.expenses.forEach((e, idx) => {
                if (y > 750) { doc.addPage(); renderHeader('Detailed Backup Logs'); y = 85; }
                if (idx % 2 === 0) doc.rect(m, y - 2, contentW, 14).fill(LIGHT_BG);
                doc.fillColor('#374151').fontSize(7.5).font('Helvetica')
                   .text(e.payee_name || 'Payee', m + 4, y, { width: 145, height: 12, overflow: 'ellipses' })
                   .text(e.type || 'Expense', m + 154, y, { width: 95, height: 12, overflow: 'ellipses' })
                   .text(e.payment_method || 'Cash', m + 254, y)
                   .text(fmt(e.amount), m + 354, y, { width: 70, align: 'right' })
                   .text(e.description || '—', m + 434, y, { width: 80, height: 12, overflow: 'ellipses' });
                y += 14;
            });
            y += 10;
        }

        // FOOTER ON EACH PAGE
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            doc.fontSize(7.5).fillColor(GRAY).text(
                `Page ${i + 1} of ${totalPages}  |  SARGA ERP System Backup  |  Confidential`,
                m, doc.page.height - 25, { align: 'center' }
            );
        }

        doc.end();
    });
}

module.exports = {
    generateDailyBookPdf,
    generateBackupPdf
};

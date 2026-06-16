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
        const fmtInt = (n) => Number(n || 0).toLocaleString('en-IN');

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

module.exports = {
    generateDailyBookPdf
};

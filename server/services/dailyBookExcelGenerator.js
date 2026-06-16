const XLSX = require('xlsx');

function generateDailyBookExcel(data, reportDate, branchName) {
    const wb = XLSX.utils.book_new();

    // 1. Summary Sheet
    const summaryData = [
        ['Daily Book Report', `${reportDate}`],
        ['Branch', branchName],
        [''],
        ['Summary Metric', 'Amount'],
        ['Total Sales', data.summary.totalSales],
        ['Total Expenses', data.summary.totalExpenses],
        ['Total Payments Received', data.summary.totalPaymentsReceived],
        ['Total Purchases', data.summary.totalPurchases],
        ['Outstanding Jobs', data.summary.outstandingJobs],
        ['Refunds Total', data.summary.refundsTotal],
        ['Shortcut Billing', data.summary.shortcutBillingTotal],
        [''],
        ['Cash In', data.cashSummary.cashIn],
        ['Cash Out', data.cashSummary.cashOut],
        ['Net Cash', data.cashSummary.netCash],
        [''],
        ['UPI In', data.upiSummary.upiIn],
        ['UPI Out', data.upiSummary.upiOut],
        ['Net UPI', data.upiSummary.netUpi],
        [''],
        ['Invoice Count', data.invoiceCount],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // 2. Sales Sheet
    if (data.sales && data.sales.length > 0) {
        const salesWs = XLSX.utils.json_to_sheet(data.sales.map(s => ({
            'Invoice No': s.invoice_number,
            'Amount': s.total_amount,
            'Time': new Date(s.created_at).toLocaleTimeString()
        })));
        XLSX.utils.book_append_sheet(wb, salesWs, 'Sales');
    }

    // 3. Expenses Sheet
    if (data.expenses && data.expenses.length > 0) {
        const expensesWs = XLSX.utils.json_to_sheet(data.expenses.map(e => ({
            'Type': e.type,
            'Payee': e.payee_name,
            'Amount': e.amount,
            'Method': e.payment_method,
            'Time': new Date(e.created_at).toLocaleTimeString()
        })));
        XLSX.utils.book_append_sheet(wb, expensesWs, 'Expenses');
    }

    // 4. Payments Sheet
    if (data.payments && data.payments.length > 0) {
        const paymentsWs = XLSX.utils.json_to_sheet(data.payments.map(p => ({
            'Customer': p.customer_name,
            'Total Amount': p.total_amount,
            'Advance Paid': p.advance_paid,
            'Method': p.payment_method,
            'Cash': p.cash_amount,
            'UPI': p.upi_amount,
            'Time': new Date(p.created_at).toLocaleTimeString()
        })));
        XLSX.utils.book_append_sheet(wb, paymentsWs, 'Payments');
    }

    // 5. Purchases Sheet
    if (data.purchases && data.purchases.length > 0) {
        const purchasesWs = XLSX.utils.json_to_sheet(data.purchases.map(p => ({
            'Bill No': p.bill_number,
            'Amount': p.total_amount,
            'Time': new Date(p.created_at).toLocaleTimeString()
        })));
        XLSX.utils.book_append_sheet(wb, purchasesWs, 'Purchases');
    }

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buf;
}

module.exports = {
    generateDailyBookExcel
};

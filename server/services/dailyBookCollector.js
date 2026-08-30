const { pool } = require('../database');

/**
 * Fetches all necessary data for the Daily Book report
 * between startTime and endTime (e.g. 'YYYY-MM-DD 00:00:00' to 'YYYY-MM-DD 20:00:00').
 * If branchId is null, fetches combined data for all branches.
 */
async function fetchDailyBookData(startDateStr, endDateStr, branchId = null) {
    const branchFilter = branchId ? 'AND branch_id = ?' : '';
    const params = branchId ? [startDateStr, endDateStr, branchId] : [startDateStr, endDateStr];

    const results = {};

    // 1. Sales (Invoices generated today)
    const branchFilterSales = branchId ? 'AND cp.branch_id = ?' : '';
    const [sales] = await pool.query(
        `SELECT i.id, i.invoice_number, i.total_amount, cp.branch_id, i.created_at
         FROM sarga_invoices i
         LEFT JOIN sarga_customer_payments cp ON i.payment_id = cp.id
         WHERE i.created_at BETWEEN ? AND ? ${branchFilterSales}`,
        params
    );
    results.sales = sales;

    // 2. Expenses (Payments out)
    const [expenses] = await pool.query(
        `SELECT id, type, payee_name, amount, payment_method, description, branch_id, created_at
         FROM sarga_payments
         WHERE payment_date BETWEEN ? AND ? ${branchFilter}`,
        params
    );
    results.expenses = expenses;

    // 3. Payments (Income/Customer Payments)
    const [payments] = await pool.query(
        `SELECT id, customer_name, total_amount, advance_paid, payment_method, cash_amount, upi_amount, description, reference_number, branch_id, created_at
         FROM sarga_customer_payments
         WHERE payment_date BETWEEN ? AND ? ${branchFilter}`,
        params
    );
    results.payments = payments;

    // 4. Purchases (Vendor Bills)
    const [purchases] = await pool.query(
        `SELECT id, bill_number, total_amount, branch_id, created_at
         FROM sarga_vendor_bills
         WHERE created_at BETWEEN ? AND ? ${branchFilter}`,
        params
    );
    results.purchases = purchases;

    // 5. Customer Receivables & Outstanding
    // Here we can fetch jobs/invoices with pending balances. For a daily summary, we can aggregate.
    // Simplifying: we'll aggregate total advance_paid vs total_amount from jobs created today
    const [jobs] = await pool.query(
        `SELECT j.id, j.job_number, j.job_name, j.category, j.status, j.total_amount, j.advance_paid, j.balance_amount, j.payment_status, j.branch_id, j.created_at, c.name as customer_name
         FROM sarga_jobs j
         LEFT JOIN sarga_customers c ON j.customer_id = c.id
         WHERE j.created_at BETWEEN ? AND ? ${branchFilter}`,
        params
    );
    results.jobs = jobs;

    // 6. Vendor Payables
    // Vendor bills created today minus payments to vendors today
    
    // 7. Cash Summary & UPI Summary
    let cashIn = 0, upiIn = 0, cashOut = 0, upiOut = 0;
    
    for (const p of payments) {
        const method = p.payment_method || 'Cash';
        const adv = Number(p.advance_paid || 0);
        if (method === 'Both') {
            cashIn += Number(p.cash_amount || 0);
            upiIn += Number(p.upi_amount || 0);
        } else if (method === 'UPI') {
            upiIn += adv;
        } else {
            cashIn += adv;
        }
    }

    for (const e of expenses) {
        const method = e.payment_method || 'Cash';
        const amt = Number(e.amount || 0);
        if (method === 'Both') {
            cashOut += Number(e.cash_amount || 0);
            upiOut += Number(e.upi_amount || 0);
        } else if (method === 'UPI') {
            upiOut += amt;
        } else {
            cashOut += amt;
        }
    }
    
    results.cashSummary = { cashIn, cashOut, netCash: cashIn - cashOut };
    results.upiSummary = { upiIn, upiOut, netUpi: upiIn - upiOut };

    // 8. Invoice Count
    results.invoiceCount = sales.length;

    // 9. Refunds
    const [refunds] = await pool.query(
        `SELECT id, customer_name, amount, payment_method, branch_id, created_at
         FROM sarga_customer_refunds
         WHERE created_at BETWEEN ? AND ? ${branchFilter}`,
        params.slice(0, branchId ? 3 : 2) // Handle table existence cautiously; if it fails, catch it.
    ).catch(() => [[]]);
    results.refunds = refunds;

    // 10. Staff Summary (Attendance)
    const [staff] = await pool.query(
        `SELECT id, staff_id, status, check_in, check_out, branch_id
         FROM sarga_staff_attendance
         WHERE date BETWEEN ? AND ? ${branchFilter}`,
        params
    ).catch(() => [[]]);
    results.staff = staff;

    // 11. Inventory Changes
    const [inventoryMovements] = await pool.query(
        `SELECT id, paper_type_id, movement_type, quantity, branch_id, moved_at
         FROM paper_stock_movements
         WHERE moved_at BETWEEN ? AND ? ${branchFilter}`,
        params
    ).catch(() => [[]]);
    results.inventoryMovements = inventoryMovements;

    // 12. Design Orders
    const [designOrders] = await pool.query(
        `SELECT id, consultation_type, status, quote_amount, preferred_branch_id as branch_id
         FROM sarga_design_consultations
         WHERE created_at BETWEEN ? AND ? AND preferred_branch_id ${branchId ? '= ?' : 'IS NOT NULL'}`,
        branchId ? [startDateStr, endDateStr, branchId] : [startDateStr, endDateStr]
    ).catch(() => [[]]);
    results.designOrders = designOrders;

    // 13. Shortcut Billing
    const [shortcutBilling] = await pool.query(
        `SELECT id, total_amount, branch_id, created_at
         FROM sarga_quick_bills
         WHERE created_at BETWEEN ? AND ? ${branchFilter}`,
        params
    ).catch(() => [[]]);
    results.shortcutBilling = shortcutBilling;

    // 14. Machine Readings (Laser / Digital machines for the report date)
    // Uses the date part of startDateStr (YYYY-MM-DD) as the reading_date.
    const readingDate = startDateStr.split(' ')[0]; // 'YYYY-MM-DD'
    const machinebranchFilter = branchId ? 'AND m.branch_id = ?' : '';
    const machineParams = branchId ? [readingDate, branchId] : [readingDate];
    const [machineReadings] = await pool.query(
        `SELECT m.id, m.machine_name, m.machine_type, m.location, m.branch_id,
                mr.opening_count, mr.closing_count,
                GREATEST(0, COALESCE(mr.closing_count, 0) - COALESCE(mr.opening_count, 0)) AS total_copies,
                COALESCE(mr.waste_prints, 0)  AS waste_prints,
                COALESCE(mr.proof_prints, 0)  AS proof_prints
         FROM sarga_machines m
         LEFT JOIN sarga_machine_readings mr
                ON mr.machine_id = m.id AND mr.reading_date = ?
         WHERE m.is_active = 1 ${machinebranchFilter}
         ORDER BY m.machine_name ASC`,
        machineParams
    ).catch(() => [[]]);
    results.machineReadings = machineReadings;

    // Aggregate values
    results.summary = {
        totalSales: sales.reduce((sum, s) => sum + Number(s.total_amount), 0),
        totalExpenses: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
        totalPaymentsReceived: cashIn + upiIn,
        totalPurchases: purchases.reduce((sum, p) => sum + Number(p.total_amount), 0),
        outstandingJobs: jobs.reduce((sum, j) => sum + Number(j.balance_amount || 0), 0),
        refundsTotal: refunds.reduce((sum, r) => sum + Number(r.amount), 0),
        shortcutBillingTotal: shortcutBilling.reduce((sum, s) => sum + Number(s.total_amount), 0)
    };

    return results;
}

module.exports = {
    fetchDailyBookData
};

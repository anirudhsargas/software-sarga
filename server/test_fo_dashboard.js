const { pool } = require('./database');

async function testDashboard() {
    try {
        console.log("Testing Front Office Dashboard API logic...");
        const today = new Date().toISOString().split('T')[0];
        const branchWhere = '';
        const branchParams = [];

        console.log("1. Today's orders...");
        const [[todayOrders]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_jobs j WHERE DATE(j.created_at) = ? ${branchWhere}`,
            [today, ...branchParams]
        );

        console.log("2. In-progress...");
        const [[inProgress]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_jobs j WHERE j.status IN ('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production') ${branchWhere}`,
            branchParams
        );

        console.log("3. Ready pickup...");
        const [[readyPickup]] = await pool.query(
            `SELECT COUNT(*) as count FROM sarga_jobs j WHERE j.status = 'Completed' ${branchWhere}`,
            branchParams
        );

        console.log("4. Total due...");
        const [[totalDue]] = await pool.query(
            `SELECT COALESCE(SUM(j.balance_amount), 0) as amount
             FROM sarga_jobs j WHERE j.status != 'Cancelled' ${branchWhere}`,
            branchParams
        );

        console.log("5. Active jobs...");
        const [activeJobs] = await pool.query(
            `SELECT j.id, j.job_number, j.job_name, j.total_amount, j.advance_paid, j.balance_amount,
                    j.status, j.payment_status, j.delivery_date, j.created_at, j.quantity,
                    COALESCE(c.name, 'Walk-in') as customer_name, c.mobile as customer_mobile
             FROM sarga_jobs j
             LEFT JOIN sarga_customers c ON j.customer_id = c.id
             WHERE j.status IN ('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production', 'Completed') ${branchWhere}
             ORDER BY j.delivery_date ASC LIMIT 5`,
            branchParams
        );

        console.log("6. Status counts...");
        const [statusCounts] = await pool.query(
            `SELECT j.status, COUNT(*) as count FROM sarga_jobs j WHERE j.status != 'Cancelled' ${branchWhere} GROUP BY j.status`,
            branchParams
        );

        console.log("Success! Results summary:");
        console.log("- today_orders:", todayOrders.count);
        console.log("- in_progress:", inProgress.count);
        console.log("- ready_pickup:", readyPickup.count);
        console.log("- total_due:", totalDue.amount);
        console.log("- activeJobs count:", activeJobs.length);
        console.log("- statusCounts:", statusCounts);

    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        process.exit();
    }
}

testDashboard();

const { pool } = require('./database');

async function checkRecentEntries() {
    try {
        const [entries] = await pool.query(`
            SELECT id, job_id, customer_name, work_details, copies, payment_type, cash_amount, upi_amount, credit_amount, total_amount, remarks, entry_time
            FROM sarga_machine_work_entries
            ORDER BY id DESC
            LIMIT 10
        `);
        console.log('--- Most Recent Work Entries ---');
        console.log(JSON.stringify(entries, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkRecentEntries();

const { pool } = require('./database');

async function checkJob() {
    try {
        const [jobs] = await pool.query("SELECT * FROM sarga_jobs WHERE id = 67");
        console.log('--- Job 67 Details ---');
        console.log(JSON.stringify(jobs, null, 2));

        const [payments] = await pool.query(`
            SELECT * FROM sarga_customer_payments 
            ORDER BY id DESC LIMIT 5
        `);
        console.log('--- Payment Details ---');
        console.log(JSON.stringify(payments, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkJob();

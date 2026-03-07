const { pool } = require('./database');

async function checkJob() {
    try {
        const [jobs] = await pool.query("SELECT * FROM sarga_jobs WHERE job_number = 'J-74217664-1'");
        console.log('--- Job Details ---');
        console.log(JSON.stringify(jobs, null, 2));

        const [payments] = await pool.query(`
            SELECT * FROM sarga_customer_payments 
            WHERE job_ids LIKE '%${jobs.length > 0 ? jobs[0].id : 0}%'
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

const { pool } = require('./database');

async function checkJob() {
    try {
        const [jobs] = await pool.query("SELECT id, job_number, machine_id, advance_paid, status, payment_status FROM sarga_jobs WHERE job_number = 'J-74217664-1'");
        console.log('--- Job 66 Details ---');
        console.log(JSON.stringify(jobs, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkJob();

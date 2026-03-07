const { pool } = require('./database');

async function checkJobs() {
    try {
        const [jobs] = await pool.query("SELECT id, job_number, category, advance_paid, machine_id, total_amount, balance_amount, status FROM sarga_jobs WHERE category = 'LASER' ORDER BY id DESC LIMIT 5");
        console.log('--- Recent Laser Jobs ---');
        console.log(JSON.stringify(jobs, null, 2));

        if (jobs.length > 0) {
            const jobIds = jobs.map(j => j.id);
            const [entries] = await pool.query("SELECT * FROM sarga_machine_work_entries WHERE job_id IN (?)", [jobIds]);
            console.log('--- Corresponding Work Entries ---');
            console.log(JSON.stringify(entries, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkJobs();

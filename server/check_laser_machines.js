const { pool } = require('./database');

async function check() {
    try {
        const [jobs] = await pool.query("SELECT id, job_number, machine_id FROM sarga_jobs WHERE category = 'LASER' AND DATE(created_at) = CURDATE()");
        console.log('--- Laser Jobs and Machine IDs ---');
        console.log(JSON.stringify(jobs, null, 2));

        const machineIds = [...new Set(jobs.map(j => j.machine_id))];
        console.log('Unique Machine IDs in Laser jobs:', machineIds);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();

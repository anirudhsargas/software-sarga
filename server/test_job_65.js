const { pool } = require('./database');
const { syncJobToMachineWorkEntry } = require('./routes/jobs');

async function testSync() {
    try {
        const [jobs] = await pool.query('SELECT * FROM sarga_jobs WHERE id = 65');
        if (jobs.length === 0) {
            console.error('Job 65 not found');
            process.exit(1);
        }

        const jobData = jobs[0];
        console.log('Testing sync for Job 65:', jobData);

        // Mock user id as 1 (Admin)
        await syncJobToMachineWorkEntry(jobData, jobData.machine_id, 1);

        const [entries] = await pool.query('SELECT * FROM sarga_machine_work_entries WHERE job_id = 65');
        console.log('Work entries after sync:', entries);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
testSync();

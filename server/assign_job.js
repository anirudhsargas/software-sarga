const { pool, initDb } = require('./database');

async function assignJob() {
    await initDb();
    const jobId = 62798; // From Test 1
    const staffId = 23;  // Designer ID
    
    try {
        await pool.query(
            'INSERT INTO sarga_job_staff_assignments (job_id, staff_id, role) VALUES (?, ?, ?)',
            [jobId, staffId, 'Designer']
        );
        console.log(`Job ${jobId} assigned to staff ${staffId}`);
        
        // Also update job status to Designing initially for the test
        await pool.query('UPDATE sarga_jobs SET status = ? WHERE id = ?', ['Designing', jobId]);
        console.log(`Job ${jobId} status set to Designing`);

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            console.log('Assignment already exists or duplicate key.');
        } else {
            console.error('Error assigning job:', err);
        }
    }
    process.exit(0);
}

assignJob();

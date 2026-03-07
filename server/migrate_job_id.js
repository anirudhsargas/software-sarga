const { pool } = require('./database');

async function migrate() {
    try {
        console.log('--- MIGRATION: ADD job_id TO sarga_machine_work_entries ---');

        // 1. Check if job_id already exists
        const [columns] = await pool.query('DESCRIBE sarga_machine_work_entries');
        const hasJobId = columns.some(col => col.Field === 'job_id');

        if (hasJobId) {
            console.log('Column job_id already exists in sarga_machine_work_entries. Skipping.');
        } else {
            console.log('Adding job_id column...');
            await pool.query('ALTER TABLE sarga_machine_work_entries ADD COLUMN job_id INT NULL AFTER report_id');
            await pool.query('ALTER TABLE sarga_machine_work_entries ADD INDEX (job_id)');
            console.log('Column job_id added successfully.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();

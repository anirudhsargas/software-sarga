const { pool } = require('./server/database');

async function migrate() {
    try {
        console.log('Starting migration...');
        await pool.query(`
            ALTER TABLE sarga_attendance_requests 
            ADD COLUMN requested_gone_time TIME AFTER requested_time
        `);
        console.log('Migration successful: added requested_gone_time to sarga_attendance_requests');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Migration already done: requested_gone_time exists');
        } else {
            console.error('Migration failed:', err);
        }
    } finally {
        process.exit();
    }
}

migrate();

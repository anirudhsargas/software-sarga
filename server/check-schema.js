require('dotenv').config();
const { pool } = require('./database');

async function check() {
    try {
        const [rows] = await pool.query('DESCRIBE sarga_opening_change_requests');
        console.log('Schema:', JSON.stringify(rows, null, 2));

        const [statusEnum] = await pool.query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = 'sarga_opening_change_requests' AND COLUMN_NAME = 'status'");
        console.log('Status ENUM:', statusEnum[0]?.COLUMN_TYPE);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
check();

const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    const hash = '$2b$10$B/AuUZuMjmA4apEHndgWkOAgC5HP4iWdAckbTEX3AjoKCaDhxEH9.';
    await connection.execute('UPDATE sarga_staff SET password = ? WHERE user_id = ?', [hash, '9496582517']);
    console.log('Updated password for 9496582517');
    await connection.end();
}
run().catch(console.error);

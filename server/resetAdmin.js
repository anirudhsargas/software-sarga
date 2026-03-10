const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function checkUsers() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sargabot'
    });

    const [users] = await connection.query("SELECT id, name, user_id, role FROM sarga_staff WHERE role IN ('Admin', 'Designer') LIMIT 1");

    if (users.length > 0) {
        const hash = await bcrypt.hash('123', 10);
        await connection.query('UPDATE sarga_staff SET password = ? WHERE id = ?', [hash, users[0].id]);
        console.log(`__LOGIN_HINT__=${users[0].user_id}`);
    } else {
        console.log("No admins found!");
    }

    await connection.end();
}
checkUsers().catch(console.error);

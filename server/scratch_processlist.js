const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: fs.existsSync(path.join(__dirname, 'aiven-ca.pem'))
    ? { ca: fs.readFileSync(path.join(__dirname, 'aiven-ca.pem')), rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});

(async () => {
  try {
    console.log('Connecting to database to check processlist...');
    const [rows] = await pool.query('SHOW PROCESSLIST');
    console.log('Active Database Processes:');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await pool.end();
  }
})();

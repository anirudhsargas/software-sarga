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
    console.log('Connecting to database...');
    const [tables] = await pool.query('SHOW TABLES');
    console.log('Tables in database:', tables.map(t => Object.values(t)[0]));
    
    // Check if bill_shortcuts exists
    try {
      const [rows] = await pool.query('SELECT * FROM bill_shortcuts LIMIT 1');
      console.log('bill_shortcuts table exists. Row count: ', rows.length);
    } catch (e) {
      console.error('bill_shortcuts query failed:', e.message);
    }

    // Check if shortcut_suggestions exists
    try {
      const [rows] = await pool.query('SELECT * FROM shortcut_suggestions LIMIT 1');
      console.log('shortcut_suggestions table exists. Row count: ', rows.length);
    } catch (e) {
      console.error('shortcut_suggestions query failed:', e.message);
    }
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await pool.end();
  }
})();

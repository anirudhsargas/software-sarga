#!/usr/bin/env node
// Quick helper to query sarga_staff by a 10-digit suffix or exact user_id
const mysql = require('mysql2/promise');

const USERID = process.argv[2] || '8547432287';

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'sarga_app',
      password: process.env.DB_PASSWORD || 'Sarga@12345',
      database: process.env.DB_NAME || 'sarga_db'
    });

    const [rows] = await conn.query(
      `SELECT id, user_id, password, is_first_login FROM sarga_staff WHERE user_id = ? OR RIGHT(user_id,10) = ? LIMIT 10`,
      [USERID, USERID]
    );

    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (err) {
    console.error('Query failed:', err && err.message);
    process.exit(1);
  }
})();

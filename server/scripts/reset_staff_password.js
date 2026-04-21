#!/usr/bin/env node
/*
 * Reset staff password helper
 * Usage:
 *   node server/scripts/reset_staff_password.js <user_id_or_suffix> <new_password>
 * Example:
 *   node server/scripts/reset_staff_password.js 8547432287 Admin@123
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const userArg = process.argv[2];
const newPassword = process.argv[3];

if (!userArg || !newPassword) {
  console.error('Usage: node reset_staff_password.js <user_id_or_suffix> <new_password>');
  process.exit(2);
}

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'sarga_app',
  password: process.env.DB_PASSWORD || 'Sarga@12345',
  database: process.env.DB_NAME || 'sarga_db'
};

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('Connected to DB', dbConfig.host, dbConfig.database);

    const [rows] = await conn.query(
      `SELECT id, user_id, is_first_login FROM sarga_staff WHERE user_id = ? OR RIGHT(user_id,10) = ? LIMIT 100`,
      [userArg, userArg]
    );

    if (!rows || rows.length === 0) {
      console.error('No matching staff record found for', userArg);
      await conn.end();
      process.exit(3);
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    for (const r of rows) {
      await conn.query('UPDATE sarga_staff SET password = ?, is_first_login = 0 WHERE id = ?', [hashed, r.id]);
      console.log('Updated id', r.id, 'user_id', r.user_id);
    }

    console.log('Password reset complete for', rows.length, 'record(s)');
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Reset failed:', err && err.message);
    if (conn) await conn.end().catch(() => {});
    process.exit(1);
  }
})();

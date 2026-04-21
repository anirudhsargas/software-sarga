#!/usr/bin/env node
/**
 * Reset staff password using the server's `pool` (database.js)
 * Usage:
 *   cd server
 *   node scripts/reset_staff_password_via_pool.js <user_id_or_suffix> <new_password>
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../database');

const userArg = process.argv[2];
const newPassword = process.argv[3];

if (!userArg || !newPassword) {
  console.error('Usage: node reset_staff_password_via_pool.js <user_id_or_suffix> <new_password>');
  process.exit(2);
}

(async () => {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id FROM sarga_staff WHERE user_id = ? OR RIGHT(user_id,10) = ? LIMIT 100`,
      [userArg, userArg]
    );

    if (!rows || rows.length === 0) {
      console.error('No matching staff record found for', userArg);
      process.exit(3);
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    for (const r of rows) {
      await pool.query('UPDATE sarga_staff SET password = ?, is_first_login = 0 WHERE id = ?', [hashed, r.id]);
      console.log('Updated id', r.id, 'user_id', r.user_id);
    }

    console.log('Password reset complete for', rows.length, 'record(s)');
    process.exit(0);
  } catch (err) {
    console.error('Reset via pool failed:', err && err.message);
    process.exit(1);
  }
})();

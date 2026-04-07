const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'sarga_db'
    });

    const conn = await pool.getConnection();
    console.log('Connected to database\n');

    // Reset admin password to "Admin@123"
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    const [result] = await conn.query(
      'UPDATE sarga_staff SET password = ? WHERE RIGHT(user_id, 10) = ?',
      [hashedPassword, '8547432287']
    );
    console.log(`✅ Reset admin password to: Admin@123`);
    console.log(`   Mobile: 8547432287`);
    console.log(`   Affected rows: ${result.affectedRows}\n`);

    // Also create some test users for other roles
    const testUsers = [
      { mobile: '9074570974', name: 'Divya', role: 'Front Office' },
      { mobile: '9846515904', name: 'Rajesh', role: 'Designer' },
      { mobile: '8089616171', name: 'Rajeesh', role: 'Designer' },
      { mobile: '8895185191', name: 'Siraj', role: 'Printer' }
    ];

    for (const testUser of testUsers) {
      const pass = await bcrypt.hash('Test@123', 10);
      await conn.query(
        'UPDATE sarga_staff SET password = ? WHERE RIGHT(user_id, 10) = ?',
        [pass, testUser.mobile.slice(-10)]
      );
      console.log(`✅ Updated ${testUser.role} (${testUser.name}): Test@123`);
    }

    conn.release();
    pool.end();
    console.log('\n✅ All passwords reset successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();

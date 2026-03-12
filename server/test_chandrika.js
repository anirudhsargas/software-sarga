const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    const pool = mysql.createPool({
      host: 'localhost',
      user: 'sarga_app',
      password: 'Sarga@12345',
      database: 'sarga_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    const conn = await pool.getConnection();

    // Get Chandrika
    const [staff] = await conn.query('SELECT id, user_id, name, password FROM sarga_staff WHERE id = 10');
    const member = staff[0];
    
    console.log(`Chandrika (ID: ${member.id}, User ID: ${member.user_id})`);
    console.log(`Password hash: ${member.password}`);
    console.log('\nTesting various combinations:');
    
    const testPasswords = [
      member.user_id,
      `${member.user_id}@Sarga`,
      `${member.user_id}@sarga`,
      'Chandrika',
      'chandrika',
      `9847878028`,
      `9847878028@Sarga`,
      'password',
      'Password@123',
      '9847878028@Sarga',
    ];

    for (const pwd of testPasswords) {
      const match = await bcrypt.compare(pwd, member.password);
      if (match) {
        console.log(`✅ MATCH: "${pwd}"`);
      }
    }

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

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

    // Get Satheeshan (ID 11)
    const [staff] = await conn.query('SELECT id, user_id, name, password, is_first_login FROM sarga_staff WHERE id = 11');
    const user = staff[0];
    
    console.log('Satheeshan (Other Staff):');
    console.log('- User ID:', user.user_id);
    console.log('- Is First Login:', user.is_first_login);
    console.log('- Password Hash:', user.password?.substring(0, 20) + '...');

    // Test if password is the user_id
    const isPlainUserId = await bcrypt.compare(user.user_id, user.password);
    console.log('- Password matches user_id:', isPlainUserId);

    // Test if password is user_id + @Sarga
    const passwordWithSuffix = `${user.user_id}@Sarga`;
    const isPasswordWithSuffix = await bcrypt.compare(passwordWithSuffix, user.password);
    console.log('- Password matches user_id@Sarga:', isPasswordWithSuffix);

    // Test with normalized
    const normalized = user.user_id.slice(-10);
    const isNormalized = await bcrypt.compare(normalized, user.password);
    console.log('- Password matches normalized user_id:', isNormalized);

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

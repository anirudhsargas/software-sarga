const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const normalizeMobile = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/\D/g, '');
    return cleaned.slice(-10);
};

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

    // Test login for each Other Staff member
    const testCases = [
      { user_id: '9446645869', password: '9446645869@Sarga', name: 'Suku' },
      { user_id: '9847878028', password: '9847878028@Sarga', name: 'Chandrika' },
      { user_id: '8547177667', password: '8547177667@Sarga', name: 'Satheeshan' },
    ];

    console.log('=== TESTING LOGIN WITH NEW PASSWORD FORMAT ===\n');

    for (const testCase of testCases) {
      console.log(`Testing ${testCase.name}:`);
      const normalizedUserId = normalizeMobile(testCase.user_id);
      
      const [users] = await pool.query("SELECT * FROM sarga_staff WHERE RIGHT(user_id, 10) = ?", [normalizedUserId]);
      const user = users[0];
      
      if (!user) {
        console.log(`❌ User not found`);
        continue;
      }

      const validPassword = await bcrypt.compare(testCase.password, user.password);
      console.log(`  User ID: ${testCase.user_id}`);
      console.log(`  Password: ${testCase.password}`);
      console.log(`  Is First Login: ${user.is_first_login}`);
      console.log(`  Password Match: ${validPassword ? '✅ YES' : '❌ NO'}`);
      console.log(`  Login Result: ${validPassword ? '✅ WOULD SUCCEED' : '❌ WOULD FAIL'}`);
      console.log('');
    }

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

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

    // Simulate login with Satheeshan's credentials
    const user_id = '8547177667';
    const password = '8547177667';
    
    const normalizedUserId = normalizeMobile(user_id);
    
    console.log('=== SIMULATING LOGIN ===');
    console.log('Input user_id:', user_id);
    console.log('Normalized user_id:', normalizedUserId);
    console.log('Input password:', password);
    console.log('\n');

    // Query user
    const [users] = await pool.query("SELECT * FROM sarga_staff WHERE RIGHT(user_id, 10) = ?", [normalizedUserId]);
    const user = users[0];
    
    console.log('User query returned:', users.length, 'user(s)');
    if (user) {
      console.log('Found user:');
      console.log('  ID:', user.id);
      console.log('  Name:', user.name);
      console.log('  user_id:', user.user_id);
      console.log('  Role:', user.role);
      console.log('  is_first_login:', user.is_first_login);
      console.log('  Password hash:', user.password?.substring(0, 30) + '...');
      console.log('');

      // Test password
      let validPassword = await bcrypt.compare(password, user.password);
      console.log('bcrypt.compare(password, hash):', validPassword);

      if (!validPassword && user.is_first_login) {
        console.log('\nPassword not valid, trying fallback checks (is_first_login=true)...');
        
        const normalizedPassword = normalizeMobile(password);
        console.log('Normalized password:', normalizedPassword);
        
        if (normalizedPassword.length === 10) {
          validPassword = await bcrypt.compare(normalizedPassword, user.password);
          console.log('bcrypt.compare(normalizedPassword, hash):', validPassword);
        }

        if (!validPassword && /^\d{10}$/.test(password)) {
          const candidates = [`+91${password}`, `91${password}`];
          console.log('Trying +91 prefixes:');
          for (const candidate of candidates) {
            const match = await bcrypt.compare(candidate, user.password);
            console.log(`  - bcrypt.compare("${candidate}", hash):`, match);
            if (match) {
              validPassword = true;
              break;
            }
          }
        }
      }
      
      console.log('\n=== FINAL RESULT ===');
      console.log('Valid password:', validPassword);
      console.log('Login would:', validPassword ? '✅ SUCCEED' : '❌ FAIL');
    }

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();

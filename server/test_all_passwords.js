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

    // Get all Other Staff members' password details
    const [staff] = await conn.query('SELECT id, user_id, name, password FROM sarga_staff WHERE role = "Other Staff"');
    
    for (const member of staff) {
      console.log(`\n=== ${member.name} (ID: ${member.id}, User ID: ${member.user_id}) ===`);
      
      // Try plain user_id
      const match1 = await bcrypt.compare(member.user_id, member.password);
      console.log(`- Password matches user_id (${member.user_id}):`, match1);
      
      // Try user_id + @Sarga
      const withSuffix = `${member.user_id}@Sarga`;
      const match2 = await bcrypt.compare(withSuffix, member.password);
      console.log(`- Password matches "${withSuffix}":`, match2);
    }

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

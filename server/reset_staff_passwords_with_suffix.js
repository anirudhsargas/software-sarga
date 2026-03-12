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

    // Get all Other Staff members
    const [staff] = await conn.query('SELECT id, user_id, name FROM sarga_staff WHERE role = "Other Staff"');
    
    console.log('Updating passwords for Other Staff members (format: number@Sarga):\n');

    for (const member of staff) {
      // Create password with @Sarga suffix
      const passwordWithSuffix = `${member.user_id}@Sarga`;
      const hashedPassword = await bcrypt.hash(passwordWithSuffix, 10);
      
      // Update password and set is_first_login to 1
      await conn.query(
        'UPDATE sarga_staff SET password = ?, is_first_login = 1 WHERE id = ?',
        [hashedPassword, member.id]
      );
      
      console.log(`✅ ${member.name} (ID: ${member.id})`);
      console.log(`   User ID: ${member.user_id}`);
      console.log(`   Password: ${member.user_id}@Sarga`);
      console.log(`   First Login: Yes (will need to change password)`);
      console.log('');
    }

    console.log('All passwords updated successfully!');
    console.log('\nYou can now login with:');
    staff.forEach(member => {
      console.log(`- ${member.name}: ${member.user_id} / ${member.user_id}@Sarga`);
    });

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();

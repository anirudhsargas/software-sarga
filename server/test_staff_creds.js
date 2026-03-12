const mysql = require('mysql2/promise');

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

    // Check Other Staff members with their credentials
    const [allStaff] = await conn.query('SELECT id, user_id, name, role, is_first_login FROM sarga_staff WHERE role = "Other Staff"');
    console.log('All Other Staff members:');
    allStaff.forEach(s => console.log(`- ID: ${s.id}, User ID: ${s.user_id}, Name: ${s.name}, First Login: ${s.is_first_login}`));

    // Check all staff with their user_ids
    console.log('\n\nAll staff:');
    const [allAllStaff] = await conn.query('SELECT id, user_id, name, role FROM sarga_staff LIMIT 15');
    allAllStaff.forEach(s => console.log(`- ID: ${s.id}, User ID: ${s.user_id}, Name: ${s.name}, Role: ${s.role}`));

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

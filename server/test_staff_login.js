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

    // Check for the staff member with mobile 8547177667
    const [staff] = await conn.query('SELECT id, name, mobile, role FROM sarga_staff WHERE mobile = ?', ['8547177667']);
    console.log('Staff with mobile 8547177667:', staff);

    // Check Other Staff members
    const [allStaff] = await conn.query('SELECT id, name, mobile, role FROM sarga_staff WHERE role = "Other Staff"');
    console.log('\nAll Other Staff members:');
    allStaff.forEach(s => console.log(`- ID: ${s.id}, Name: ${s.name}, Mobile: ${s.mobile}, Role: ${s.role}`));

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

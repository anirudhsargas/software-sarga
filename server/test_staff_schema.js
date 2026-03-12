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

    // Check table schema
    const [columns] = await conn.query('DESCRIBE sarga_staff');
    console.log('sarga_staff columns:');
    columns.forEach(col => console.log(`  ${col.Field}: ${col.Type}`));

    // Check Other Staff members
    const [allStaff] = await conn.query('SELECT id, name, role FROM sarga_staff WHERE role = "Other Staff" LIMIT 5');
    console.log('\nOther Staff members:');
    allStaff.forEach(s => console.log(`- ID: ${s.id}, Name: ${s.name}, Role: ${s.role}`));

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

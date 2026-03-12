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

    // Check for Other Staff role
    const [otherStaff] = await conn.query('SELECT id, name, role FROM sarga_staff WHERE role = ?', ['Other Staff']);
    console.log('Other Staff members:', otherStaff);

    if (otherStaff.length > 0) {
      for (const staff of otherStaff) {
        const [assignments] = await conn.query('SELECT * FROM sarga_job_staff_assignments WHERE staff_id = ?', [staff.id]);
        console.log(`\nAssignments for ${staff.name} (ID: ${staff.id}):`, assignments.length, 'jobs');
        if (assignments.length > 0) {
          console.log('Sample:', assignments[0]);
        }
      }
    } else {
      console.log('\nNo Other Staff members found. Checking all staff:');
      const [allStaff] = await conn.query('SELECT id, name, role FROM sarga_staff LIMIT 10');
      console.log('All staff:', allStaff);
    }

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

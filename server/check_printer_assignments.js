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

    // Get all Printers
    console.log('=== CHECKING PRINTER ASSIGNMENTS ===\n');
    
    const [printers] = await conn.query('SELECT id, name, role FROM sarga_staff WHERE role = "Printer"');
    console.log('Printers in system:');
    printers.forEach(p => console.log(`  ${p.id} - ${p.name} (${p.role})`));

    if (printers.length === 0) {
      console.log('No printers found');
      conn.release();
      pool.end();
      process.exit(0);
    }

    const printerIds = printers.map(p => p.id);
    
    // Get all assignments for Printers
    console.log('\nAssignments for all Printers:');
    const [assignments] = await conn.query(
      `SELECT jsa.id, jsa.job_id, jsa.staff_id, jsa.role, jsa.status, j.job_number, j.job_name
       FROM sarga_job_staff_assignments jsa
       INNER JOIN sarga_jobs j ON jsa.job_id = j.id
       WHERE jsa.staff_id IN (${printerIds.map(() => '?').join(',')})
       ORDER BY jsa.assigned_date DESC`,
      printerIds
    );

    if (assignments.length === 0) {
      console.log('  No assignments found for any Printer');
    } else {
      console.log(`  Total: ${assignments.length} assignments`);
      assignments.forEach(a => {
        console.log(`  - Job ${a.job_number} (${a.job_name})`);
        console.log(`    Staff ID: ${a.staff_id}, Role: ${a.role}, Status: ${a.status}`);
      });
    }

    // Check recently created assignments (last 10)
    console.log('\n\nLast 10 assignments (any staff):');
    const [recentAssignments] = await conn.query(
      `SELECT jsa.id, jsa.job_id, jsa.staff_id, jsa.role, jsa.status, jsa.assigned_date, j.job_number, s.name
       FROM sarga_job_staff_assignments jsa
       INNER JOIN sarga_jobs j ON jsa.job_id = j.id
       LEFT JOIN sarga_staff s ON jsa.staff_id = s.id
       ORDER BY jsa.assigned_date DESC
       LIMIT 10`
    );

    recentAssignments.forEach(a => {
      console.log(`  - Job ${a.job_number}, Staff: ${a.name} (${a.staff_id}), Role: ${a.role}, Status: ${a.status}`);
    });

    conn.release();
    pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

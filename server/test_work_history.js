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

    // Check the work-history endpoint response for Suku (ID: 6)
    console.log('========== TESTING WORK-HISTORY FOR SUKU (ID: 6) ==========\n');
    
    const [jobs] = await conn.query(`
        SELECT 
            j.id,
            j.job_number,
            j.job_name,
            j.quantity,
            j.unit_price,
            j.total_amount,
            j.status,
            j.payment_status,
            j.delivery_date,
            j.created_at,
            j.branch_id,
            c.name as customer_name,
            c.mobile as customer_mobile,
            jsa.\`role\` as assignment_role,
            jsa.assigned_date,
            jsa.completed_date,
            jsa.status as assignment_status
        FROM sarga_job_staff_assignments jsa
        INNER JOIN sarga_jobs j ON j.id = jsa.job_id
        LEFT JOIN sarga_customers c ON j.customer_id = c.id
        WHERE jsa.staff_id = ?
        ORDER BY j.created_at DESC
    `, [6]);

    console.log('Jobs returned:', jobs.length);
    if (jobs.length > 0) {
      console.log('\nFirst job data:');
      console.log(JSON.stringify(jobs[0], null, 2));
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

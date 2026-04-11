require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  });

  try {
    // 1. Fix payments with wrong book_type (Offset → Laser) for yesterday
    console.log('=== Fixing payments with book_type=Offset from yesterday ===');
    const [payments] = await pool.query(
      `SELECT id, customer_name, advance_paid, book_type, description
       FROM sarga_customer_payments
       WHERE DATE(payment_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND book_type = 'Offset'`
    );
    console.log(`Found ${payments.length} payments to fix:`);
    payments.forEach(p => console.log(`  Payment #${p.id} | ₹${p.advance_paid} | ${p.description}`));

    if (payments.length > 0) {
      const ids = payments.map(p => p.id);
      const [result] = await pool.query(
        `UPDATE sarga_customer_payments SET book_type = 'Laser' WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      console.log(`Updated ${result.affectedRows} payments from Offset → Laser`);
    }

    // 2. Fix jobs with category='Quick Add' from yesterday → Laser
    console.log('\n=== Fixing jobs with category=Quick Add from yesterday ===');
    const [jobs] = await pool.query(
      `SELECT id, job_number, job_name, category
       FROM sarga_jobs
       WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND category = 'Quick Add'`
    );
    console.log(`Found ${jobs.length} jobs to fix:`);
    jobs.forEach(j => console.log(`  Job #${j.id} ${j.job_number} | ${j.job_name}`));

    if (jobs.length > 0) {
      const ids = jobs.map(j => j.id);
      const [result] = await pool.query(
        `UPDATE sarga_jobs SET category = 'LASER' WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      console.log(`Updated ${result.affectedRows} jobs from Quick Add → LASER`);
    }

    // 3. Verify
    console.log('\n=== Verification ===');
    const [pSummary] = await pool.query(
      `SELECT COALESCE(book_type, 'NULL') as bt, COUNT(*) as cnt, SUM(advance_paid) as total
       FROM sarga_customer_payments
       WHERE DATE(payment_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       GROUP BY book_type`
    );
    console.log('Payment summary:');
    pSummary.forEach(s => console.log(`  ${s.bt}: ${s.cnt} payments, ₹${s.total}`));

    const [jSummary] = await pool.query(
      `SELECT COALESCE(category, 'NULL') as cat, COUNT(*) as cnt
       FROM sarga_jobs
       WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       GROUP BY category`
    );
    console.log('Job summary:');
    jSummary.forEach(s => console.log(`  ${s.cat}: ${s.cnt} jobs`));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();

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
    // 1. Check product categories
    console.log('=== PRODUCT CATEGORIES ===');
    const [cats] = await pool.query('SELECT id, name FROM sarga_product_categories ORDER BY id');
    cats.forEach(c => console.log(`  [${c.id}] ${c.name}`));

    // 2. Check yesterday's payments with book_type
    console.log('\n=== YESTERDAY PAYMENTS (book_type) ===');
    const [payments] = await pool.query(
      `SELECT id, customer_name, advance_paid, book_type, payment_date, description
       FROM sarga_customer_payments
       WHERE DATE(payment_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       ORDER BY id`
    );
    payments.forEach(p => console.log(`  Payment #${p.id} | ${p.customer_name} | ₹${p.advance_paid} | book_type=${p.book_type} | ${p.description || ''}`));
    console.log(`  Total: ${payments.length} payments`);

    // 3. Check yesterday's jobs with category
    console.log('\n=== YESTERDAY JOBS (category) ===');
    const [jobs] = await pool.query(
      `SELECT id, job_number, job_name, category, subcategory, total_amount
       FROM sarga_jobs
       WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       ORDER BY id`
    );
    jobs.forEach(j => console.log(`  Job #${j.id} ${j.job_number} | ${j.job_name} | category=${j.category} | sub=${j.subcategory} | ₹${j.total_amount}`));
    console.log(`  Total: ${jobs.length} jobs`);

    // 4. Summary
    console.log('\n=== PAYMENT book_type SUMMARY ===');
    const [pSummary] = await pool.query(
      `SELECT COALESCE(book_type, 'NULL') as bt, COUNT(*) as cnt, SUM(advance_paid) as total
       FROM sarga_customer_payments
       WHERE DATE(payment_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       GROUP BY book_type`
    );
    pSummary.forEach(s => console.log(`  ${s.bt}: ${s.cnt} payments, ₹${s.total}`));

    console.log('\n=== JOB category SUMMARY ===');
    const [jSummary] = await pool.query(
      `SELECT COALESCE(category, 'NULL') as cat, COUNT(*) as cnt, SUM(total_amount) as total
       FROM sarga_jobs
       WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       GROUP BY category`
    );
    jSummary.forEach(s => console.log(`  ${s.cat}: ${s.cnt} jobs, ₹${s.total}`));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // Summary
  const [[c]] = await pool.query("SELECT COUNT(*) AS cnt FROM sarga_customers WHERE name LIKE 'Test %'");
  const [[j]] = await pool.query("SELECT COUNT(*) AS cnt FROM sarga_jobs WHERE job_number LIKE 'SEED-%'");
  const [[p]] = await pool.query("SELECT COUNT(*) AS cnt FROM sarga_customer_payments WHERE description = 'Seeded test data'");
  console.log('Customers:', c.cnt, '| Jobs:', j.cnt, '| Payments:', p.cnt);

  // Per branch
  const [bsum] = await pool.query(`
    SELECT b.name AS branch, COUNT(DISTINCT c.id) AS customers, COUNT(DISTINCT j.id) AS jobs, COUNT(DISTINCT p.id) AS payments
    FROM sarga_branches b
    LEFT JOIN sarga_customers c ON c.branch_id = b.id AND c.name LIKE 'Test %'
    LEFT JOIN sarga_jobs j ON j.customer_id = c.id
    LEFT JOIN sarga_customer_payments p ON p.customer_id = c.id
    WHERE b.id IN (4,5) GROUP BY b.id, b.name`);
  console.table(bsum);

  // Cross-branch test: pick a MEPPAYUR customer and fetch by id (simulates branch 2 staff)
  const [b1] = await pool.query("SELECT id, name, mobile, branch_id FROM sarga_customers WHERE branch_id = 4 AND name LIKE 'Test %' LIMIT 1");
  if (b1[0]) {
    const [found] = await pool.query('SELECT id, name, branch_id FROM sarga_customers WHERE id = ?', [b1[0].id]);
    console.log('Cross-branch customer lookup (MEPPAYUR cust from any branch):', found[0]);
    const [jobs] = await pool.query('SELECT id, job_name, payment_status, total_amount FROM sarga_jobs WHERE customer_id = ? LIMIT 3', [b1[0].id]);
    console.log('Their jobs:', jobs);
  }

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

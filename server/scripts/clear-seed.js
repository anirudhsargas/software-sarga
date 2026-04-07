require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // ── 1. Test-customer payments (seed-test-data.js)
  const [p1] = await pool.query("DELETE FROM sarga_customer_payments WHERE customer_name LIKE 'Test %'");

  // ── 2. Daily-seeded customer payments (seed-daily-data.js)
  const [p2] = await pool.query("DELETE FROM sarga_customer_payments WHERE description = 'Daily seeded payment'");

  // ── 3. Jobs linked to test customers (seed-test-data.js)
  const [j1] = await pool.query(
    "DELETE j FROM sarga_jobs j INNER JOIN sarga_customers c ON j.customer_id = c.id WHERE c.name LIKE 'Test %'"
  );

  // ── 4. SEED-% and DAILY-% orphan jobs
  const [j2] = await pool.query("DELETE FROM sarga_jobs WHERE job_number LIKE 'SEED-%' OR job_number LIKE 'DAILY-%'");

  // ── 5. Test customers
  const [c1] = await pool.query("DELETE FROM sarga_customers WHERE name LIKE 'Test %'");

  // ── 6. Daily-seeded vendor payments (seed-daily-data.js)
  let vp = { affectedRows: 0 };
  try {
    [vp] = await pool.query("DELETE FROM sarga_vendor_payments WHERE description = 'Daily seeded vendor payment'");
  } catch (_) { /* table may not exist */ }

  // ── 7. Daily-seeded staff payments (seed-daily-data.js)
  let sp = { affectedRows: 0 };
  try {
    [sp] = await pool.query("DELETE FROM sarga_staff_payments WHERE description = 'Daily seeded staff payment'");
  } catch (_) { /* table may not exist */ }

  console.log('Seeded data removed:');
  console.log(`  Customer payments : ${p1.affectedRows + p2.affectedRows} rows`);
  console.log(`  Jobs              : ${j1.affectedRows + j2.affectedRows} rows`);
  console.log(`  Customers         : ${c1.affectedRows} rows`);
  console.log(`  Vendor payments   : ${vp.affectedRows} rows`);
  console.log(`  Staff payments    : ${sp.affectedRows} rows`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

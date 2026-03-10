require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [p] = await pool.query("DELETE FROM sarga_customer_payments WHERE customer_name LIKE 'Test %'");
  const [j] = await pool.query("DELETE j FROM sarga_jobs j INNER JOIN sarga_customers c ON j.customer_id = c.id WHERE c.name LIKE 'Test %'");
  const [c] = await pool.query("DELETE FROM sarga_customers WHERE name LIKE 'Test %'");
  console.log(`Deleted: ${p.affectedRows} payments, ${j.affectedRows} jobs, ${c.affectedRows} customers`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

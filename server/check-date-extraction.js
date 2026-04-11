require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('\n=== DATE() function on stored dates ===');
  let [rows] = await c.query(`
    SELECT 
      report_date as raw_value,
      DATE(report_date) as date_extracted,
      book_type,
      cash_opening
    FROM sarga_daily_opening_balances 
    ORDER BY report_date DESC 
    LIMIT 10
  `);
  console.table(rows);

  console.log('\n=== Transaction dates ===');
  [rows] = await c.query(`
    SELECT 
      payment_date as raw_value,
      DATE(payment_date) as date_extracted,
      book_type,
      cash_amount
    FROM sarga_customer_payments 
    WHERE payment_date >= '2026-04-05'
    ORDER BY payment_date LIMIT 15
  `);
  console.table(rows);

  console.log('\n=== Matching dates ===');
  const searchDate = '2026-04-06';
  console.log('Searching for DATE() =', searchDate);
  
  [rows] = await c.query(`
    SELECT report_date, DATE(report_date) as extracted, book_type, cash_opening
    FROM sarga_daily_opening_balances 
    WHERE DATE(report_date) = ?
  `, [searchDate]);
  console.log('Opening balances found:');
  console.table(rows);

  await c.end();
})().catch(err => console.error(err));

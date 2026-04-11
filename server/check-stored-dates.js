require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('\n=== Opening Balances Dates ===');
  let [rows] = await c.query(`
    SELECT report_date, book_type, cash_opening 
    FROM sarga_daily_opening_balances 
    ORDER BY report_date DESC 
    LIMIT 10
  `);
  console.table(rows);

  console.log('\n=== CP Transactions Dates ===');
  [rows] = await c.query(`
    SELECT DATE(payment_date) as payment_date, payment_method, book_type, COUNT(*) cnt, SUM(cash_amount) total
    FROM sarga_customer_payments 
    WHERE payment_date >= '2026-04-06'
    GROUP BY DATE(payment_date), payment_method, book_type
    ORDER BY payment_date DESC
  `);
  console.table(rows);

  console.log('\n=== Issue: Opening stored as 2026-04-06 not 2026-04-07 ===');
  console.log('If yesterday (2026-04-07 date) queries look for 2026-04-07');
  console.log('But opening balance was stored as 2026-04-06T18:30Z');
  console.log('Then opening will not be found!');
  console.log('\nThe fix: Use DATE() function in the query to match dates properly');

  await c.end();
})().catch(err => console.error(err));

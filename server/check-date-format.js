require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('\n=== Checking date format issue ===');
  
  // Check raw data stored
  console.log('\n=== Raw report_date values ===');
  let [rows] = await c.query(
    'SELECT report_date, CAST(report_date AS DATE) as date_only FROM sarga_daily_opening_balances LIMIT 5'
  );
  console.table(rows);

  console.log('\n=== Laser opening with date comparison ===');
  
  // Try with DATE() function
  [rows] = await c.query(
    `SELECT cash_opening, DATE(report_date) as report_date_only
     FROM sarga_daily_opening_balances
     WHERE DATE(report_date) = '2026-04-07' AND book_type = 'Laser'`
  );
  console.log('Using DATE() function:', rows);

  // Try exact timestamp
  [rows] = await c.query(
    `SELECT cash_opening, report_date
     FROM sarga_daily_opening_balances
     WHERE report_date LIKE '2026-04-07%' AND book_type = 'Laser'`
  );
  console.log('Using LIKE pattern:', rows);

  // Check CP cash with date comparison
  console.log('\n=== CP Cash with date comparison ===');
  [rows] = await c.query(
    `SELECT DATE(payment_date) as payment_date, payment_method, SUM(
      CASE WHEN payment_method = 'Both' THEN cash_amount ELSE 0 END
    ) cash_total
     FROM sarga_customer_payments
     WHERE DATE(payment_date) = '2026-04-07' AND book_type = 'Laser'
     GROUP BY payment_method`
  );
  console.log('CP by payment method:', rows);

  console.log('\n=== Laser opening stored ===');
  [rows] = await c.query(
    'SELECT report_date, cash_opening FROM sarga_daily_opening_balances WHERE book_type = ? ORDER BY report_date',
    ['Laser']
  );
  console.table(rows);

  await c.end();
})().catch(err => console.error(err));

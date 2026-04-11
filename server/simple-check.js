require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('\n=== All Opening Balances ===');
  let [rows] = await c.query(
    'SELECT report_date, book_type, cash_opening FROM sarga_daily_opening_balances ORDER BY report_date DESC LIMIT 10'
  );
  console.table(rows);

  console.log('\n=== Extract by LEFT() ===');
  [rows] = await c.query(
    'SELECT report_date, LEFT(report_date, 10) as date_part, book_type, cash_opening FROM sarga_daily_opening_balances ORDER BY report_date DESC LIMIT 10'
  );
  console.table(rows);

  const searchFor = '2026-04-07';
  console.log('\n=== Search for date:', searchFor, '===');
  [rows] = await c.query(
    'SELECT report_date, LEFT(report_date, 10) as date_part, book_type, cash_opening FROM sarga_daily_opening_balances WHERE LEFT(report_date, 10) = ? ORDER BY report_date DESC', 
    [searchFor]
  );
  console.log('Records found:', rows.length);
  console.table(rows);

  await c.end();
})().catch(err => console.error(err));

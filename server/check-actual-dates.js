require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('\n=== Actual stored dates ===');
  
  // Check opening balances
  console.log('\n--- Opening Balances (most recent) ---');
  let [rows] = await c.query(`
    SELECT LEFT(report_date, 10) as date_portion, book_type, cash_opening
    FROM sarga_daily_opening_balances 
    ORDER BY report_date DESC 
    LIMIT 5
  `);
  console.table(rows);

  // Check transactions
  console.log('\n--- CP Transactions (most recent) ---');
  [rows] = await c.query(`
    SELECT LEFT(payment_date, 10) as date_portion, book_type, COUNT(*) cnt, SUM(cash_amount) total
    FROM sarga_customer_payments 
    GROUP BY LEFT(payment_date, 10), book_type
    ORDER BY payment_date DESC 
    LIMIT 5
  `);
  console.table(rows);

  console.log('\n=== What we need ===');
  console.log('Today is: 2026-04-08');
  console.log('Yesterday (2026-04-07) opening should use data from: 2026-04-06');
  console.log('(Opening for 2026-04-06 = previous day opening + that day income)');
  console.log('\nBut we need to fetch:');
  console.log('- Opening balance stored for 2026-04-07: Looking...');
  
  [rows] = await c.query(`
    SELECT LEFT(report_date, 10) as date_portion, book_type, cash_opening
    FROM sarga_daily_opening_balances 
    WHERE LEFT(report_date, 10) = '2026-04-07'
  `);
  console.log('Records for 2026-04-07:', rows);

  await c.end();
})().catch(err => console.error(err));

require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, 
    user: process.env.DB_USER, 
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME
  });
  
  const yday = '2026-04-07';
  
  console.log('\n=== Count of transactions by book_type (Yesterday) ===');
  let [rows] = await c.query(`
    SELECT 
      COALESCE(book_type, 'NULL/DEFAULT') as book_type,
      COUNT(*) cnt,
      SUM(cash_amount) total_cash
    FROM sarga_customer_payments 
    WHERE DATE(payment_date) = ?
    GROUP BY book_type
  `, [yday]);
  console.table(rows);
  
  console.log('\n=== All Offset transactions (all time) ===');
  [rows] = await c.query(`
    SELECT id, DATE(payment_date) as payment_date, customer_name, book_type, cash_amount 
    FROM sarga_customer_payments 
    WHERE book_type = 'Offset'
    ORDER BY payment_date DESC 
    LIMIT 5
  `);
  console.table(rows.length ? rows : [{ msg: 'No Offset transactions found' }]);
  
  console.log('\n=== Daily income calculation for Offset (Yesterday) ===');
  [rows] = await c.query(`
    SELECT 
      COALESCE(SUM(cash_amount), 0) as total_cash_yesterday
    FROM sarga_customer_payments
    WHERE DATE(payment_date) = ? AND book_type = 'Offset'
  `, [yday]);
  console.log('Offset income yesterday:', rows[0]);
  
  console.log('\n=== Offset opening (Yesterday) for calculation ===');
  [rows] = await c.query(`
    SELECT cash_opening 
    FROM sarga_daily_opening_balances 
    WHERE report_date = ? AND book_type = 'Offset'
  `, [yday]);
  console.log('Offset opening yesterday:', rows[0]?.cash_opening || 0);
  
  console.log('\n✅ Calculation: Expected Offset closing today = 159 (opening) + income');
  
  await c.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});

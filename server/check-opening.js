const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, 
    user: process.env.DB_USER, 
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME
  });
  
  const yesterday = new Date(); 
  yesterday.setDate(yesterday.getDate() - 1);
  const ydayStr = yesterday.toISOString().slice(0,10);
  
  console.log('\nYesterday:', ydayStr);
  console.log('\n=== Opening Balances ===');
  let [rows] = await conn.query(
    `SELECT book_type, cash_opening FROM sarga_daily_opening_balances WHERE report_date = ?`, 
    [ydayStr]
  );
  console.table(rows);
  
  console.log('\n=== Offset Closing Balance ===');
  [rows] = await conn.query(
    `SELECT closing_balance FROM sarga_daily_report_offset WHERE report_date = ?`, 
    [ydayStr]
  );
  console.log(rows[0]?.closing_balance || 'Not found');
  
  console.log('\n=== Customer Payments Income (Yesterday) ===');
  [rows] = await conn.query(
    `SELECT book_type, COUNT(*) cnt, COALESCE(SUM(cash_amount), 0) total
     FROM sarga_customer_payments
     WHERE DATE(payment_date) = ? 
     GROUP BY book_type`, 
    [ydayStr]
  );
  console.table(rows);
  
  // Check if customer payments have book_type set
  console.log('\n=== Sample CP records (last 10) ===');
  [rows] = await conn.query(
    `SELECT id, customer_name, book_type, cash_amount, payment_method, payment_date
     FROM sarga_customer_payments
     WHERE DATE(payment_date) = ?
     ORDER BY created_at DESC LIMIT 10`, 
    [ydayStr]
  );
  console.table(rows);
  
  await conn.end();
  process.exit();
})().catch(err => {
  console.error(err);
  process.exit(1);
});

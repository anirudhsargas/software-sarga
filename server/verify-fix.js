require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const searchDate = '2026-04-06';
  console.log('\n=== Using LEFT() for date matching ===');
  console.log('Searching for LEFT(report_date,10) =', searchDate);
  
  let [rows] = await c.query(`
    SELECT report_date, LEFT(report_date, 10) as extracted, book_type, cash_opening
    FROM sarga_daily_opening_balances 
    WHERE LEFT(report_date, 10) = ?
  `, [searchDate]);
  console.log('\nOpening balances found:');
  console.table(rows);

  // Now simulate the previous-closing endpoint
  const today = '2026-04-08';
  const previousDate = new Date(today);
  previousDate.setDate(previousDate.getDate() - 1);
  const previousDateStr = previousDate.toISOString().slice(0, 10);

  console.log('\n=== Simulating /previous-closing endpoint with LEFT() ===');
  console.log('Today:', today);
  console.log('Previous date:', previousDateStr);

  // Laser opening
  [rows] = await c.query(
    `SELECT cash_opening FROM sarga_daily_opening_balances
     WHERE LEFT(report_date, 10) = ? AND book_type = 'Laser' LIMIT 1`,
    [previousDateStr]
  );
  const laserOpening = parseFloat(rows[0]?.cash_opening || 0);
  console.log('\nLaser opening (yesterday):', laserOpening);

  // Laser CP cash
  [rows] = await c.query(
    `SELECT SUM(
      CASE WHEN payment_method = 'Both' THEN cash_amount
           WHEN payment_method = 'UPI' THEN 0
           ELSE advance_paid END
     ) total
     FROM sarga_customer_payments
     WHERE LEFT(payment_date, 10) = ? AND book_type = 'Laser'`,
    [previousDateStr]
  );
  const laserCpCash = parseFloat(rows[0]?.total || 0);
  console.log('Laser CP cash (yesterday):', laserCpCash);

  const expected = laserOpening + laserCpCash;
  console.log('\n✅ EXPECTED today opening (Laser):', expected);
  console.log('   = 3424 (opening) + 1305 (income) = 4729');

  await c.end();
})().catch(err => console.error(err));

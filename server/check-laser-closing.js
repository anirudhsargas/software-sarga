require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const today = '2026-04-08';
  const yday = '2026-04-07';

  console.log('\n=== Laser Book Closing Calculation ===');
  console.log('Yesterday:', yday);

  // Laser opening yesterday
  let [rows] = await c.query(
    'SELECT cash_opening FROM sarga_daily_opening_balances WHERE report_date = ? AND book_type = ?',
    [yday, 'Laser']
  );
  const laserOpening = parseFloat(rows[0]?.cash_opening || 0);
  console.log('1. Laser opening (yesterday):', laserOpening);

  // Laser income yesterday from CP
  [rows] = await c.query(
    `SELECT SUM(
       CASE WHEN payment_method = 'Both' THEN cash_amount
            WHEN payment_method = 'UPI' THEN 0
            ELSE advance_paid END
     ) total 
     FROM sarga_customer_payments 
     WHERE DATE(payment_date) = ? AND book_type = ?`,
    [yday, 'Laser']
  );
  const laserCpIncome = parseFloat(rows[0]?.total || 0);
  console.log('2. Laser CP income (yesterday):', laserCpIncome);

  // Expected laser closing
  const expectedClosing = laserOpening + laserCpIncome;
  console.log('3. Expected Laser closing (today opening):', expectedClosing);

  // Check what's actually stored
  [rows] = await c.query(
    'SELECT cash_opening FROM sarga_daily_opening_balances WHERE report_date = ? AND book_type = ?',
    [today, 'Laser']
  );
  console.log('4. Actual Laser opening stored for today:', parseFloat(rows[0]?.cash_opening || 0));

  // Check if any stored reports
  [rows] = await c.query(
    'SELECT closing_balance FROM sarga_daily_report_laser WHERE report_date = ?',
    [yday]
  );
  console.log('5. Laser daily report closing (yesterday):', rows[0]?.closing_balance || 'Not found');

  console.log('\n🔍 Issue: Showing 1500, but should be', expectedClosing);
  console.log('   Where is 1500 coming from?');

  // Check all Laser opening balances to find pattern
  console.log('\n=== Recent Laser openings ===');
  [rows] = await c.query(
    'SELECT report_date, cash_opening FROM sarga_daily_opening_balances WHERE book_type = ? ORDER BY report_date DESC LIMIT 10',
    ['Laser']
  );
  console.table(rows);

  await c.end();
})().catch(err => console.error(err));

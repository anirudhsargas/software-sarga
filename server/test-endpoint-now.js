require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const date = '2026-04-08';
  const branchId = 1;
  
  const previousDate = new Date(date);
  previousDate.setDate(previousDate.getDate() - 1);
  const previousDateStr = previousDate.toISOString().slice(0, 10);

  console.log('\n=== Testing Fixed Queries ===');
  console.log('Today:', date);
  console.log('Previous date:', previousDateStr);
  console.log('Branch ID:', branchId);

  // Test 1: Laser opening
  console.log('\n--- Query 1: Laser opening for ' + previousDateStr + ' ---');
  let [rows] = await c.query(
    `SELECT cash_opening, report_date
     FROM sarga_daily_opening_balances
     WHERE LEFT(report_date, 10) = ? AND branch_id = ? AND book_type = 'Laser'
     LIMIT 1`,
    [previousDateStr, branchId]
  );
  console.log('Result:', rows);
  const laserOpening = rows.length > 0 ? Number(rows[0].cash_opening) : 0;
  console.log('Laser opening value:', laserOpening);

  // Test 2: Laser CP cash
  console.log('\n--- Query 2: Laser CP cash for ' + previousDateStr + ' ---');
  [rows] = await c.query(
    `SELECT COALESCE(SUM(
        CASE
            WHEN payment_method = 'Both' THEN COALESCE(cash_amount, 0)
            WHEN payment_method = 'UPI'  THEN 0
            ELSE COALESCE(advance_paid, 0)
        END
    ), 0) AS total_cash
     FROM sarga_customer_payments
     WHERE LEFT(payment_date, 10) = ? AND branch_id = ? AND book_type = 'Laser'`,
    [previousDateStr, branchId]
  );
  console.log('Result:', rows);
  const laserCpCash = Number(rows[0]?.total_cash || 0);
  console.log('Laser CP cash value:', laserCpCash);

  // Test 3: Final calculation
  const laserClosing = laserOpening + laserCpCash;
  console.log('\n--- Final Calculation ---');
  console.log('Laser opening:', laserOpening);
  console.log('Laser CP cash:', laserCpCash);
  console.log('TOTAL (should be 4729):', laserClosing);

  if (laserClosing === 4729) {
    console.log('\n✅ Calculation is CORRECT!');
  } else {
    console.log('\n❌ Calculation is still wrong!');
    console.log('Expected 4729 but got:', laserClosing);
  }

  await c.end();
})().catch(err => console.error(err));

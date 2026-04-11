require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const date = '2026-04-08'; // today
  const branchId = 1;
  
  // Calculate yesterday's date using CORRECTED method
   const [year, month, day] = date.split('-').map(Number);
  const prevDate = new Date(year, month - 1, day - 1);
  const previousDateStr = prevDate.getFullYear() + '-' + 
                          String(prevDate.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(prevDate.getDate()).padStart(2, '0');

  console.log('\n=== FIXED date calculation ===');
  console.log('date (today):', date);
  console.log('previousDateStr (yesterday):', previousDateStr);
  console.log('branchId:', branchId);

  // Laser opening
  console.log('\n--- Laser opening (FIXED) ---');
  let [laserOpeningRows] = await c.query(
    `SELECT cash_opening, LEFT(report_date, 10) as stored_date
     FROM sarga_daily_opening_balances
     WHERE LEFT(report_date, 10) = ? AND branch_id = ? AND book_type = 'Laser'
     LIMIT 1`,
    [previousDateStr, branchId]
  );
  
  console.log('Query result:', laserOpeningRows);
  const laserOpening = laserOpeningRows.length > 0 ? Number(laserOpeningRows[0].cash_opening) : 0;
  console.log('Laser opening value:', laserOpening);

  // CP Cash query
  console.log('\n--- Laser CP Cash (FIXED) ---');
  let [[laserCpCash]] = await c.query(
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

  console.log('Query result:', laserCpCash);
  const cpCashTotal = Number(laserCpCash.total_cash || 0);
  console.log('CP cash value:', cpCashTotal);

  const laserClosing = laserOpening + cpCashTotal;
  console.log('\n=== RESULT ===');
  console.log('Laser opening:', laserOpening);
  console.log('+ CP cash:', cpCashTotal);
  console.log('= Laser closing (today opening):', laserClosing);

  if (laserClosing === 4729) {
    console.log('\n✅ CORRECT! Now showing 4729 instead of 1500');
  } else if (laserClosing === 0) {
    console.log('\n❌ Still getting 0 - checking why...');
    console.log('\nDates in database for yesterday (' + previousDateStr + '):');
    let [check] = await c.query(
      'SELECT DISTINCT LEFT(report_date, 10) as stored_date FROM sarga_daily_opening_balances ORDER BY report_date DESC LIMIT 5'
    );
    console.table(check);
  } else {
    console.log('\n❌ Got', laserClosing, 'instead of 4729');
  }

  await c.end();
})().catch(err => console.error(err));

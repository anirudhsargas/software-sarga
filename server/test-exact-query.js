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
  
  // Calculate yesterday's date exactly like the endpoint does
  const previousDate = new Date(`${date}T00:00:00`);
  previousDate.setDate(previousDate.getDate() - 1);
  const previousDateStr = previousDate.toISOString().slice(0, 10);

  console.log('\n=== Exact endpoint calculation ===');
  console.log('date (today):', date);
  console.log('previousDateStr (yesterday):', previousDateStr);
  console.log('branchId:', branchId);

  // EXACT QUERY from the endpoint
  console.log('\n--- Laser opening (LEFT() version) ---');
  let [laserOpeningRows] = await c.query(
    `SELECT cash_opening
     FROM sarga_daily_opening_balances
     WHERE LEFT(report_date, 10) = ? AND branch_id = ? AND book_type = 'Laser'
     LIMIT 1`,
    [previousDateStr, branchId]
  );
  
  console.log('Query result:', laserOpeningRows);
  const laserOpening = laserOpeningRows.length > 0 ? Number(laserOpeningRows[0].cash_opening) : 0;
  console.log('Laser opening value:', laserOpening);

  // CP Cash query
  console.log('\n--- Laser CP Cash (LEFT() version) ---');
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
    console.log('\n✅ CORRECT!');
  } else {
    console.log('\n❌ Still wrong');
  }

  await c.end();
})().catch(err => console.error(err));

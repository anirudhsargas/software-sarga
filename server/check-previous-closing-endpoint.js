require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  // Simulate previous-closing endpoint for today
  const date = '2026-04-08';
  const branchId = 1;
  
  const previousDate = new Date(date);
  previousDate.setDate(previousDate.getDate() - 1);
  const previousDateStr = previousDate.toISOString().slice(0, 10);

  console.log('\n=== Simulating /previous-closing endpoint ===');
  console.log('Today:', date);
  console.log('Previous date:', previousDateStr);

  // Offset: stored closing balance
  let [prevOffset] = await c.query(
    `SELECT closing_balance FROM sarga_daily_report_offset
     WHERE report_date < ? AND branch_id = ?
     ORDER BY report_date DESC LIMIT 1`,
    [date, branchId]
  );

  // Laser opening balance for yesterday - using DATE() function
  let [laserOpeningRows] = await c.query(
    `SELECT cash_opening
     FROM sarga_daily_opening_balances
     WHERE DATE(report_date) = ? AND branch_id = ? AND book_type = 'Laser'
     LIMIT 1`,
    [previousDateStr, branchId]
  );

  // Laser cash-in: MWE cash
  let [[laserMweCash]] = await c.query(
    `SELECT COALESCE(SUM(mwe.cash_amount), 0) AS total_cash
     FROM sarga_machine_work_entries mwe
     JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
     LEFT JOIN sarga_jobs j ON mwe.job_id = j.id
     WHERE drm.report_date = ? AND drm.branch_id = ?
       AND (
         (mwe.remarks IS NULL OR mwe.remarks NOT LIKE 'Auto-synced from Job%')
         OR (mwe.remarks LIKE 'Auto-synced from Job%' AND j.payment_id IS NOT NULL)
       )`,
    [previousDateStr, branchId]
  );

  // Laser CP cash - using DATE() function
  let [[laserCpCash]] = await c.query(
    `SELECT COALESCE(SUM(
        CASE
            WHEN payment_method = 'Both' THEN COALESCE(cash_amount, 0)
            WHEN payment_method = 'UPI'  THEN 0
            ELSE COALESCE(advance_paid, 0)
        END
    ), 0) AS total_cash
     FROM sarga_customer_payments
     WHERE DATE(payment_date) = ? AND branch_id = ? AND book_type = 'Laser'
       AND id NOT IN (
           SELECT DISTINCT j.payment_id
           FROM sarga_machine_work_entries mwe
           JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
           JOIN sarga_jobs j ON mwe.job_id = j.id
           WHERE DATE(drm.report_date) = ? AND drm.branch_id = ?
             AND mwe.remarks LIKE 'Auto-synced from Job%'
             AND j.payment_id IS NOT NULL
       )`,
    [previousDateStr, branchId, previousDateStr, branchId]
  );

  // Other opening balance for yesterday
  let [otherOpeningRows] = await c.query(
    `SELECT cash_opening
     FROM sarga_daily_opening_balances
     WHERE report_date = ? AND branch_id = ? AND book_type = 'Other'
     LIMIT 1`,
    [previousDateStr, branchId]
  );

  // Other cash-in
  let [[otherIncome]] = await c.query(
    `SELECT COALESCE(SUM(
        CASE
            WHEN payment_method = 'Both' THEN COALESCE(cash_amount, 0)
            WHEN payment_method = 'UPI'  THEN 0
            ELSE COALESCE(advance_paid, 0)
        END
    ), 0) AS total_cash
     FROM sarga_customer_payments
     WHERE DATE(payment_date) = ? AND branch_id = ? AND book_type = 'Other'`,
    [previousDateStr, branchId]
  );

  const laserOpening = laserOpeningRows.length > 0 ? Number(laserOpeningRows[0].cash_opening) : 0;
  const otherOpening = otherOpeningRows.length > 0 ? Number(otherOpeningRows[0].cash_opening) : 0;
  const laserClosing = laserOpening + Number(laserMweCash.total_cash) + Number(laserCpCash.total_cash);
  const otherClosing = otherOpening + Number(otherIncome.total_cash);

  console.log('\n=== Result ===');
  console.log('Offset:', prevOffset.length > 0 ? Number(prevOffset[0].closing_balance) : 0);
  console.log('Laser:');
  console.log('  Opening:', laserOpening);
  console.log('  MWE Cash:', Number(laserMweCash.total_cash));
  console.log('  CP Cash:', Number(laserCpCash.total_cash));
  console.log('  Closing:', laserClosing);
  console.log('Other:', otherClosing);

  if (Number(laserCpCash.total_cash) < 1305) {
    console.log('\n⚠️ WARNING: Laser CP Cash calculation is wrong!');
    console.log('Expected:', 1305);
    console.log('Got:', Number(laserCpCash.total_cash));
  }

  await c.end();
})().catch(err => console.error(err));

require('dotenv').config();
const { pool } = require('./database');
(async () => {
  try {
    const [rows] = await pool.query(
      'SELECT YEAR(created_at) AS yr, MONTH(created_at) AS mo, COUNT(*) AS order_count, COALESCE(SUM(total_amount),0) AS revenue FROM sarga_jobs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) AND status != "Cancelled" GROUP BY yr, mo ORDER BY yr, mo'
    );
    console.log('Monthly data rows:', rows.length, JSON.stringify(rows));

    const [cats] = await pool.query(
      'SELECT YEAR(created_at) AS yr, MONTH(created_at) AS mo, COALESCE(category,"Uncategorized") AS category, COUNT(*) AS order_count FROM sarga_jobs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) AND status != "Cancelled" GROUP BY yr, mo, category ORDER BY yr, mo'
    );
    console.log('Category rows:', cats.length);

    process.exit(0);
  } catch(e) { console.error('ERR:', e.message, e.stack); process.exit(1); }
})();

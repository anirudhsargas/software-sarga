const { pool } = require('./database.js');
async function check() {
  const [rows] = await pool.query('DESC sarga_customer_payments');
  console.log(rows.map(r => r.Field).join(', '));
  process.exit(0);
}
check();

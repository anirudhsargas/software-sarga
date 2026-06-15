const { pool } = require('../database');
(async () => {
  try {
    const id = 2;
    const [vendors] = await pool.query('SELECT * FROM vendors WHERE id = ?', [id]);
    const [invoices] = await pool.query('SELECT * FROM vendor_invoices WHERE vendor_id = ?', [id]);
    const [payments] = await pool.query('SELECT * FROM vendor_payments WHERE vendor_id = ?', [id]);
    console.log('vendor:', vendors[0]);
    console.log('invoices count:', invoices.length);
    console.log('payments count:', payments.length);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

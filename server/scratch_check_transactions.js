const { pool } = require('./database');
async function test() {
  try {
    const [payments] = await pool.query(`
      SELECT cp.id, cp.customer_name, cp.total_amount, cp.advance_paid, cp.payment_method, cp.book_type, cp.payment_target_book, cp.order_lines, cp.created_at
      FROM sarga_customer_payments cp
      WHERE DATE(cp.payment_date) = '2026-08-30'
    `);
    console.log('Today Payments:', payments.map(p => ({
      id: p.id,
      name: p.customer_name,
      total: p.total_amount,
      book_type: p.book_type,
      payment_target_book: p.payment_target_book,
      order_lines: p.order_lines
    })));

    const [jobs] = await pool.query(`
      SELECT j.id, j.payment_id, j.job_name, j.category, j.book_type, j.total_amount
      FROM sarga_jobs j
      WHERE DATE(j.created_at) = '2026-08-30'
    `);
    console.log('Today Jobs:', jobs);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();

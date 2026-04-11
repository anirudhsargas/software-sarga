require('dotenv').config();
const { pool } = require('./database');

(async () => {
    const [rows] = await pool.query(
        "SELECT id, customer_name, book_type, advance_paid, order_lines FROM sarga_customer_payments WHERE DATE(payment_date) = CURDATE() AND book_type = 'Laser' ORDER BY id DESC"
    );
    rows.forEach(r => {
        const lines = JSON.parse(r.order_lines || '[]');
        console.log(`Payment #${r.id}  ${r.customer_name}  book:${r.book_type}  paid:${r.advance_paid}  lines:${lines.length}  [${lines.map(l => l.product_name).join(', ')}]`);
    });
    console.log(`\nTotal Laser billing entries today: ${rows.length}`);
    process.exit(0);
})();

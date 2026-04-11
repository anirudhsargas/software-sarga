const mysql = require('mysql2/promise');
(async () => {
    const pool = await mysql.createPool({ host: 'localhost', user: 'sarga_app', password: 'Sarga@12345', database: 'sarga_db' });
    const [r] = await pool.query("UPDATE sarga_customer_payments SET book_type = 'Laser' WHERE id IN (23558, 23559, 23560)");
    console.log('Updated:', r.affectedRows, 'rows');
    await pool.end();
})();

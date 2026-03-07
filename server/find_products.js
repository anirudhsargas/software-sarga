const { pool } = require('./database');

async function findProducts() {
    try {
        const [rows] = await pool.query("SELECT id, product_name, category, price FROM sarga_products WHERE category = 'LASER' LIMIT 10");
        console.log('--- Laser Products ---');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
findProducts();

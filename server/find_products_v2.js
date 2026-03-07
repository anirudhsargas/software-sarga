const { pool } = require('./database');

async function findProducts() {
    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.name as product_name, s.name as subcategory_name
            FROM sarga_products p
            JOIN sarga_subcategories s ON p.subcategory_id = s.id
            JOIN sarga_categories c ON s.category_id = c.id
            WHERE c.name = 'LASER'
            LIMIT 10
        `);
        console.log('--- Laser Products ---');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
findProducts();

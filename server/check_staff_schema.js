const { pool } = require('./database');

async function checkSchema() {
    try {
        const [columns] = await pool.query("DESCRIBE sarga_staff");
        console.log('--- sarga_staff columns ---');
        console.log(JSON.stringify(columns, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkSchema();

const { pool } = require('./database');

async function listTables() {
    try {
        const [rows] = await pool.query("SHOW TABLES");
        console.log('--- Tables ---');
        console.log(JSON.stringify(rows.map(r => Object.values(r)[0]), null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
listTables();

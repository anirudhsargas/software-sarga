const { pool } = require('./database');

async function findStaff() {
    try {
        const [rows] = await pool.query("SELECT id, name, role, mobile FROM sarga_staff");
        console.log('--- Staff Info ---');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
findStaff();

const { pool } = require('./database');

async function findUserId() {
    try {
        const [rows] = await pool.query("SELECT id, name, role, user_id FROM sarga_staff");
        console.log('--- User ID Info ---');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
findUserId();

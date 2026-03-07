const { pool } = require('./database');

async function checkFirstLogin() {
    try {
        const [rows] = await pool.query("SELECT id, name, user_id, is_first_login FROM sarga_staff");
        console.log('--- First Login Info ---');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkFirstLogin();

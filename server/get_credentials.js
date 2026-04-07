const { pool } = require('./database');

async function getCredentials() {
    const roles = ['Admin', 'Accountant', 'Front Office', 'Designer'];
    console.log('Fetching credentials for verification...');
    
    for (const role of roles) {
        const [rows] = await pool.query("SELECT user_id, role, name FROM sarga_staff WHERE role = ? LIMIT 1", [role]);
        if (rows.length > 0) {
            console.log(`Role: ${role}, UserID: ${rows[0].user_id}, Name: ${rows[0].name}`);
        } else {
            console.log(`No user found for role: ${role}`);
        }
    }
    process.exit(0);
}

getCredentials().catch(err => {
    console.error(err);
    process.exit(1);
});

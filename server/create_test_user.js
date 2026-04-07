const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function createTestUser() {
    const userId = '1234567890';
    const password = 'TestPassword123!';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [branches] = await pool.query("SELECT id FROM sarga_branches LIMIT 1");
    const branchId = branches[0] ? branches[0].id : null;
    
    // Check if exists
    const [rows] = await pool.query("SELECT id FROM sarga_staff WHERE user_id = ?", [userId]);
    if (rows.length > 0) {
        await pool.query("UPDATE sarga_staff SET password = ?, role = 'Front Office', is_first_login = 0, branch_id = ? WHERE user_id = ?", [hashedPassword, branchId, userId]);
        console.log('Updated existing test user.');
    } else {
        await pool.query(
            "INSERT INTO sarga_staff (user_id, password, role, name, is_first_login, branch_id) VALUES (?, ?, ?, ?, ?, ?)",
            [userId, hashedPassword, 'Front Office', 'Test Agent', 0, branchId]
        );
        console.log('Created new test user.');
    }
    process.exit(0);
}

createTestUser().catch(err => {
    console.error(err);
    process.exit(1);
});

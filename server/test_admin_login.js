const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function testAdminLogin() {
    try {
        const [users] = await pool.query("SELECT id, name, user_id, password, is_first_login FROM sarga_staff WHERE user_id = ?", ['8547432287']);
        
        if (users.length === 0) {
            console.log("Admin user not found!");
            process.exit(1);
        }

        const admin = users[0];
        console.log("Admin User Found:");
        console.log(`  ID: ${admin.id}`);
        console.log(`  Name: ${admin.name}`);
        console.log(`  User ID: ${admin.user_id}`);
        console.log(`  Is First Login: ${admin.is_first_login}`);
        console.log(`  Password Hash: ${admin.password}`);
        
        // Test common passwords
        const testPasswords = ['admin', '123', 'password', '8547432287', 'Admin@123'];
        
        console.log("\nTesting passwords:");
        for (const pwd of testPasswords) {
            const match = await bcrypt.compare(pwd, admin.password);
            console.log(`  "${pwd}": ${match ? '✓ MATCH' : '✗ no match'}`);
        }
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

testAdminLogin();

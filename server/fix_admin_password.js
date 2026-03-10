const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function resetAdminPassword() {
    try {
        const newPassword = 'admin';
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await pool.query("UPDATE sarga_staff SET password = ? WHERE user_id = ?", [hashedPassword, '8547432287']);
        
        console.log("✓ Admin password reset to: 'admin'");
        console.log("✓ User ID: 8547432287");
        console.log("\nYou can now login with:");
        console.log("  User ID: 8547432287");
        console.log("  Password: admin");
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

resetAdminPassword();

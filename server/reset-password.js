const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function resetPassword() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: node reset-password.js <mobile_or_id> <new_password>');
        console.log('\nExample: node reset-password.js 8921135339 Password@123');
        process.exit(1);
    }

    const [userId, password] = args;

    if (!password || password.length < 6) {
        console.log('❌ Password must be at least 6 characters');
        process.exit(1);
    }

    try {
        // Show all users
        const [users] = await pool.query("SELECT id, name, user_id, role FROM sarga_staff ORDER BY id");
        console.log('\n📋 Available Users:');
        users.forEach(user => {
            console.log(`   ${user.id}. ${user.name} (${user.user_id}) - ${user.role}`);
        });

        // Find user
        let [userRows] = await pool.query(
            "SELECT id FROM sarga_staff WHERE user_id = ? OR id = ?",
            [userId, parseInt(userId)]
        );

        if (!userRows.length) {
            console.log(`\n❌ User "${userId}" not found`);
            process.exit(1);
        }

        const userRecord = userRows[0];
        const hashedPassword = await bcrypt.hash(password, 10);

        // Reset password and mark as first login
        await pool.query(
            "UPDATE sarga_staff SET password = ?, is_first_login = 1 WHERE id = ?",
            [hashedPassword, userRecord.id]
        );

        // Get updated user
        const [updatedUser] = await pool.query(
            "SELECT name, user_id, role FROM sarga_staff WHERE id = ?",
            [userRecord.id]
        );

        const user = updatedUser[0];
        console.log('\n✅ Password reset successful!');
        console.log('\n📱 Login Credentials:');
        console.log(`   Mobile: ${user.user_id}`);
        console.log(`   Password: ${password}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Role: ${user.role}`);
        console.log('\n⚠️  User will be asked to change password on first login');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

resetPassword();

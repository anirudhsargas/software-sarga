const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function checkPasswordHash() {
    try {
        const [users] = await pool.query(
            "SELECT id, name, user_id, password, is_first_login FROM sarga_staff WHERE user_id = ? OR id = ?",
            ['8921135339', 19]
        );

        if (!users.length) {
            console.log('❌ User not found');
            process.exit(1);
        }

        const user = users[0];
        console.log('\n📋 User Details:');
        console.log(`   ID: ${user.id}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Mobile: ${user.user_id}`);
        console.log(`   Is First Login: ${user.is_first_login}`);
        console.log(`   Password Hash Stored: ${user.password ? '✅ Yes' : '❌ No'}`);
        
        if (user.password) {
            console.log(`   Hash (first 50 chars): ${user.password.substring(0, 50)}...`);
            
            // Test bcrypt comparison
            console.log('\n🔐 Testing Password Comparison:');
            const testPassword = 'Welcome@123';
            
            try {
                const matches = await bcrypt.compare(testPassword, user.password);
                console.log(`   Password "${testPassword}" matches hash: ${matches ? '✅ YES' : '❌ NO'}`);
            } catch (err) {
                console.log(`   ❌ Bcrypt comparison error: ${err.message}`);
                console.log(`   Hash might be corrupted or not a valid bcrypt hash`);
            }
        } else {
            console.log('   ❌ No password hash stored in database!');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkPasswordHash();

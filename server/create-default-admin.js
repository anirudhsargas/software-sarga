const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function createDefaultAdmin() {
    try {
        console.log('Connecting to database...');
        
        // Check existing users
        const [existingUsers] = await pool.query("SELECT id, name, user_id, role FROM sarga_staff ORDER BY id");
        console.log('\n📋 Existing Users in Database:');
        if (existingUsers.length === 0) {
            console.log('   No staff members found.');
        } else {
            existingUsers.forEach(user => {
                console.log(`   • ID: ${user.id}, Name: ${user.name}, Mobile: ${user.user_id}, Role: ${user.role}`);
            });
        }

        // Create default admin if none exists with admin role
        const [adminUsers] = await pool.query("SELECT id FROM sarga_staff WHERE role = 'Admin'");
        
        if (adminUsers.length === 0 && existingUsers.length > 0) {
            console.log('\n⚠️  No admin users found. Making the first user an admin...');
            await pool.query(
                "UPDATE sarga_staff SET role = 'Admin' WHERE id = ? LIMIT 1",
                [existingUsers[0].id]
            );
            console.log('✅ First user promoted to Admin role');
        } else if (adminUsers.length === 0) {
            console.log('\n➕ Creating default admin user...');
            
            // Hash default password: "Admin@123"
            const hashedPassword = await bcrypt.hash('Admin@123', 10);
            
            const [result] = await pool.query(
                "INSERT INTO sarga_staff (user_id, name, password, role, is_first_login) VALUES (?, ?, ?, ?, ?)",
                ['8921135339', 'Admin User', hashedPassword, 'Admin', 1]
            );
            
            console.log('✅ Default admin created!');
            console.log('\n📱 Default Credentials:');
            console.log('   Mobile: 8921135339');
            console.log('   Password: Admin@123');
            console.log('   Role: Admin');
            console.log('\n⚠️  You will be asked to change password on first login');
        } else {
            console.log('\n✅ Admin users already exist');
        }

        // List all users again
        const [allUsers] = await pool.query("SELECT id, name, user_id, role FROM sarga_staff ORDER BY id");
        console.log('\n📋 Current Users:');
        allUsers.forEach(user => {
            console.log(`   • Mobile: ${user.user_id}, Name: ${user.name}, Role: ${user.role}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createDefaultAdmin();

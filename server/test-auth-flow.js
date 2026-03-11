const { pool } = require('./database');
const bcrypt = require('bcryptjs');

const normalizeMobile = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/\D/g, '');
    return cleaned.slice(-10);
};

async function testAuthFlow() {
    console.log('🧪 Testing Full Authentication Flow\n');
    
    const testUser = '8921135339';
    const testPassword = 'Welcome@123';
    
    try {
        // Step 1: Normalize user ID
        const normalizedUserId = normalizeMobile(testUser);
        console.log(`Step 1: Normalize User ID`);
        console.log(`   Input: "${testUser}"`);
        console.log(`   Normalized: "${normalizedUserId}" (length: ${normalizedUserId.length})`);
        
        // Step 2: Query database
        console.log(`\nStep 2: Query Database`);
        const [users] = await pool.query("SELECT id, name, user_id, password, is_first_login FROM sarga_staff WHERE RIGHT(user_id, 10) = ?", [normalizedUserId]);
        console.log(`   Query: SELECT * FROM sarga_staff WHERE RIGHT(user_id, 10) = ?`);
        console.log(`   Results: ${users.length} user(s) returned`);
        
        if (!users.length) {
            console.log(`   ❌ No user found!`);
            process.exit(1);
        }
        
        const user = users[0];
        console.log(`   ✅ User Found:`);
        console.log(`      ID: ${user.id}`);
        console.log(`      Name: ${user.name}`);
        console.log(`      Mobile: ${user.user_id}`);
        console.log(`      Is First Login: ${user.is_first_login}`);
        console.log(`      Password Hash Exists: ${!!user.password}`);
        
        if (!user.password) {
            console.log(`   ❌ User has no password hash!`);
            process.exit(1);
        }
        
        // Step 3: Test bcrypt comparison
        console.log(`\nStep 3: Bcrypt Password Comparison`);
        console.log(`   Input Password: "${testPassword}"`);
        console.log(`   Hash (first 40 chars): ${user.password.substring(0, 40)}...`);
        
        const validPassword = await bcrypt.compare(testPassword, user.password);
        console.log(`   bcrypt.compare() result: ${validPassword ? '✅ MATCH' : '❌ NO MATCH'}`);
        
        if (!validPassword) {
            console.log(`\n⚠️  Password doesn't match! Trying fallback logic...`);
            
            if (user.is_first_login) {
                console.log(`   User is in first_login mode, trying fallbacks:`);
                
                // Try mobile only
                const normalizedPassword = normalizeMobile(testPassword);
                console.log(`   - Normalized password "${normalizedPassword}": `, end='');
                const match1 = await bcrypt.compare(normalizedPassword, user.password);
                console.log(match1 ? '✅' : '❌');
                
                // Try +91 prefix
                if (/^\d{10}$/.test(testPassword)) {
                    const candidates = [`+91${testPassword}`, `91${testPassword}`];
                    for (const candidate of candidates) {
                        process.stdout.write(`   - With prefix "${candidate}": `);
                        const match = await bcrypt.compare(candidate, user.password);
                        console.log(match ? '✅' : '❌');
                        if (match) break;
                    }
                }
            }
        }
        
        // Step 4: Report result
        console.log(`\n${validPassword ? '✅ LOGIN SUCCESS' : '❌ LOGIN FAILED'}`);
        
        process.exit(validPassword ? 0 : 1);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

testAuthFlow();

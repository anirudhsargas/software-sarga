const { pool } = require('./database');

async function checkSchema() {
    try {
        const [result] = await pool.query("DESCRIBE sarga_staff");
        
        console.log('\n📋 sarga_staff Table Schema:');
        result.forEach(field => {
            console.log(`   ${field.Field.padEnd(25)} | ${field.Type.padEnd(20)} | Null: ${field.Null}`);
        });

        // Specifically check password column
        const passwordField = result.find(f => f.Field === 'password');
        if (passwordField) {
            console.log(`\n🔐 Password Column Details:`);
            console.log(`   Type: ${passwordField.Type}`);
            console.log(`   Null: ${passwordField.Null}`);
            
            // Check if VARCHAR is large enough
            const match = passwordField.Type.match(/varchar\((\d+)\)/i);
            if (match) {
                const maxLength = parseInt(match[1]);
                const bcryptHashLength = 60; // bcrypt hashes are always 60 chars
                console.log(`   Max Length: ${maxLength} chars`);
                console.log(`   BCrypt Hash Length: ${bcryptHashLength} chars`);
                console.log(`   Sufficient Size: ${maxLength >= bcryptHashLength ? '✅ YES' : '❌ NO - May truncate hash!'}`);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkSchema();

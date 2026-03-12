const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

/**
 * Sync Credentials Script
 * This script updates the password for a specific user to ensure it matches
 * the required hash format and value.
 * 
 * Usage: node server/scripts/sync-credentials.js
 */
async function syncCredentials() {
    console.log('--- Database Credential Sync ---');
    console.log(`Connecting to: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`Database: ${process.env.DB_NAME || 'sargabot'}`);

    const connectionConfigs = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sargabot',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : null
    };

    let connection;
    try {
        connection = await mysql.createConnection(connectionConfigs);
        console.log('✅ Connected to database.');

        const targetUser = '8921135339';
        const defaultPassword = `${targetUser}@Sarga`;
        
        console.log(`Updating password for user: ${targetUser}`);
        
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(defaultPassword, salt);

        const [result] = await connection.execute(
            'UPDATE sarga_staff SET password = ?, is_first_login = 0 WHERE user_id = ?',
            [hash, targetUser]
        );

        if (result.affectedRows > 0) {
            console.log(`✅ Success! User ${targetUser} password has been updated.`);
            console.log(`New password is: ${defaultPassword}`);
        } else {
            console.log(`⚠️ User ${targetUser} not found in the database.`);
        }

    } catch (error) {
        console.error('❌ Error during sync:', error.message);
    } finally {
        if (connection) await connection.end();
    }
}

syncCredentials();

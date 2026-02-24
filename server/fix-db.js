const { pool } = require('./database');

async function fixSchema() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Checking for old foreign key constraints...');

        // Find existing foreign keys on sarga_id_requests and sarga_audit_logs that point to sarga_staff
        const [constraints] = await connection.query(`
            SELECT TABLE_NAME, CONSTRAINT_NAME 
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE REFERENCED_TABLE_NAME = 'sarga_staff' 
            AND TABLE_SCHEMA = DATABASE()
        `);

        for (const c of constraints) {
            console.log(`Dropping constraint ${c.CONSTRAINT_NAME} from ${c.TABLE_NAME}...`);
            await connection.query(`ALTER TABLE ${c.TABLE_NAME} DROP FOREIGN KEY ${c.CONSTRAINT_NAME}`);
        }

        console.log('Adding fresh constraints with ON DELETE CASCADE/SET NULL...');

        // Add CASCADE to id change requests
        await connection.query(`
            ALTER TABLE sarga_id_requests 
            ADD CONSTRAINT fk_id_requests_staff 
            FOREIGN KEY (user_id_internal) 
            REFERENCES sarga_staff(id) 
            ON DELETE CASCADE
        `);

        // Add SET NULL to audit logs
        await connection.query(`
            ALTER TABLE sarga_audit_logs 
            ADD CONSTRAINT fk_audit_logs_staff 
            FOREIGN KEY (user_id_internal) 
            REFERENCES sarga_staff(id) 
            ON DELETE SET NULL
        `);

        console.log('Database schema updated successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error fixing schema:', err);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
}

fixSchema();

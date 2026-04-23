const { pool } = require('./database');

async function migrate() {
    const connection = await pool.getConnection();
    try {
        console.log('Starting migration for sarga_daily_credit_transactions...');

        // 1. Add new columns if they don't exist
        try {
            await connection.query("ALTER TABLE sarga_daily_credit_transactions ADD COLUMN book_type ENUM('Offset', 'Laser', 'Other') DEFAULT 'Offset'");
            console.log('✓ Added book_type column');
        } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

        try {
            await connection.query("ALTER TABLE sarga_daily_credit_transactions ADD COLUMN branch_id INT DEFAULT NULL");
            await connection.query("ALTER TABLE sarga_daily_credit_transactions ADD CONSTRAINT fk_credit_branch FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE");
            console.log('✓ Added branch_id column and constraint');
        } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') throw err; }

        try {
            await connection.query("ALTER TABLE sarga_daily_credit_transactions ADD COLUMN report_date DATE DEFAULT NULL");
            console.log('✓ Added report_date column');
        } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

        // 2. Make report_id nullable
        try {
            await connection.query("ALTER TABLE sarga_daily_credit_transactions MODIFY COLUMN report_id INT DEFAULT NULL");
            console.log('✓ Made report_id nullable');
        } catch (err) { console.error('Failed to make report_id nullable:', err.message); }

        // 3. Backfill data for existing Offset credits
        await connection.query(`
            UPDATE sarga_daily_credit_transactions txn
            JOIN sarga_daily_report_offset r ON txn.report_id = r.id
            SET txn.book_type = 'Offset',
                txn.branch_id = r.branch_id,
                txn.report_date = r.report_date
            WHERE txn.report_id IS NOT NULL AND txn.report_date IS NULL
        `);
        console.log('✓ Backfilled existing Offset credit data');

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        connection.release();
        process.exit();
    }
}

migrate();

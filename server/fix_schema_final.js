const { pool } = require('./database');

async function migrate() {
    try {
        console.log('--- MIGRATION: FIX REPORT SCHEMA AND PAYMENT TYPES ---');

        // 1. Add total_upi to sarga_daily_report_machine if missing
        const [reportCols] = await pool.query('DESCRIBE sarga_daily_report_machine');
        if (!reportCols.some(col => col.Field === 'total_upi')) {
            console.log('Adding total_upi to sarga_daily_report_machine...');
            await pool.query('ALTER TABLE sarga_daily_report_machine ADD COLUMN total_upi DECIMAL(10,2) DEFAULT 0 AFTER total_cash');
        }

        // 2. Update payment_type enum in sarga_machine_work_entries to include 'Paid'
        console.log("Updating payment_type enum to include 'Paid'...");
        await pool.query("ALTER TABLE sarga_machine_work_entries MODIFY COLUMN payment_type ENUM('Cash', 'UPI', 'Credit', 'Both', 'Paid')");

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();

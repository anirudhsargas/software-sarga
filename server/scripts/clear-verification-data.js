const { pool } = require('../database');

async function clearVerificationData() {
    console.log('--- STARTING VERIFICATION DATA CLEARING ---');
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        console.log('1. Deleting all stock verification records...');
        // Cascades to sarga_stock_verification_items
        const [stockRes] = await connection.query('DELETE FROM sarga_stock_verifications');
        console.log(`Deleted ${stockRes.affectedRows} stock verification records.`);

        console.log('2. Resetting payment verification status...');
        const [paymentRes] = await connection.query(`
            UPDATE sarga_customer_payments 
            SET verification_status = 'Pending', 
                verified_by = NULL, 
                verified_at = NULL, 
                verification_note = NULL
            WHERE verification_status != 'Pending' AND verification_status IS NOT NULL
        `);
        console.log(`Reset ${paymentRes.affectedRows} payment verification statuses.`);

        await connection.commit();
        console.log('--- CLEARING COMPLETED SUCCESSFULLY ---');
    } catch (err) {
        await connection.rollback();
        console.error('FAILED to clear verification data:', err.message);
        process.exit(1);
    } finally {
        connection.release();
        process.exit(0);
    }
}

clearVerificationData();

const { pool } = require('./database');
const { syncJobToMachineWorkEntry } = require('./routes/jobs');

async function testFix() {
    try {
        console.log('Testing sync with UPI payment simulation...');
        const mockJob = {
            id: 9999, // mock ID
            job_number: 'TEST-FIX-1',
            job_name: 'TEST SYNC',
            quantity: 1,
            total_amount: 50.00,
            advance_paid: 50.00,  // Full amount paid
            cash_amount: 0.00,    // 0 Cash
            upi_amount: 50.00,    // Full amount UPI
            balance_amount: 0.00,
            payment_status: 'Paid',
            customer_name: 'Test Customer'
        };

        // Use machine ID 1 for testing
        await syncJobToMachineWorkEntry(mockJob, 1, 1);

        const [entries] = await pool.query('SELECT * FROM sarga_machine_work_entries WHERE job_id = 9999');
        console.log('Result Work Entries:', JSON.stringify(entries, null, 2));

        // Cleanup test data
        await pool.query('DELETE FROM sarga_machine_work_entries WHERE job_id = 9999');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
testFix();

const { pool } = require('./database');
const { syncJobToMachineWorkEntry } = require('./routes/jobs');

async function test() {
    try {
        console.log('--- TESTING LASER SYNC ---');

        const userId = 1; // Admin
        const branchId = 4; // Meppayur

        console.log('Step 1: Creating Laser Job...');
        const jobNumber = `TEST-L-${Date.now().toString().slice(-4)}`;
        const [jobRes] = await pool.query(
            `INSERT INTO sarga_jobs 
            (customer_id, branch_id, job_number, job_name, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, category, machine_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [null, branchId, jobNumber, 'TEST LASER SYNC', 10, 5, 50, 0, 50, 'Unpaid', 'LASER', 6]
        );
        const jobId = jobRes.insertId;
        console.log(`Job Created: ID ${jobId}, Number ${jobNumber}`);

        console.log('Step 2: Triggering initial sync...');
        await syncJobToMachineWorkEntry({
            id: jobId,
            job_number: jobNumber,
            job_name: 'TEST LASER SYNC',
            quantity: 10,
            total_amount: 50,
            advance_paid: 0,
            balance_amount: 50,
            payment_status: 'Unpaid',
            customer_name: 'Test Runner'
        }, 6, userId);

        const [entry1] = await pool.query('SELECT * FROM sarga_machine_work_entries WHERE job_id = ?', [jobId]);
        console.log('Entry after initial sync:', entry1[0] ? `Found (Amt: ${entry1[0].total_amount}, Cash: ${entry1[0].cash_amount}, Type: ${entry1[0].payment_type})` : 'NOT FOUND');

        console.log('Step 3: Mimicking Payment update...');
        const payCash = 30;
        const payUpi = 20;
        const totalPaid = 50;

        await pool.query(
            "UPDATE sarga_jobs SET advance_paid = ?, balance_amount = 0, payment_status = 'Paid' WHERE id = ?",
            [totalPaid, jobId]
        );

        console.log('Step 4: Triggering payment sync...');
        await syncJobToMachineWorkEntry({
            id: jobId,
            job_number: jobNumber,
            job_name: 'TEST LASER SYNC',
            quantity: 10,
            total_amount: 50,
            advance_paid: payCash,
            cash_amount: payCash,
            upi_amount: payUpi,
            balance_amount: 0,
            payment_status: 'Paid',
            customer_name: 'Test Runner'
        }, 6, userId);

        const [entry2] = await pool.query('SELECT * FROM sarga_machine_work_entries WHERE job_id = ?', [jobId]);
        if (entry2[0]) {
            console.log('Entry after payment sync:');
            console.log(`  - Total: ${entry2[0].total_amount}`);
            console.log(`  - Cash: ${entry2[0].cash_amount}`);
            console.log(`  - UPI: ${entry2[0].upi_amount}`);
            console.log(`  - Type: ${entry2[0].payment_type}`);
            console.log(`  - Remarks: ${entry2[0].remarks}`);
        } else {
            console.log('ENTRY LOST!');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

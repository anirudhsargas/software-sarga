const { pool } = require('./database');

(async () => {
    try {
        // Find customer ID 1 (from the URL in screenshot)
        const [customers] = await pool.query('SELECT id, name, mobile FROM sarga_customers WHERE id = 1');
        console.log('Customer 1:', customers[0]);
        
        if (!customers[0]) {
            console.log('Customer ID 1 does not exist');
            process.exit(0);
        }
        
        // Find payments for this customer
        const mobile = customers[0].mobile;
        const [payments] = await pool.query(
            'SELECT id, total_amount, payment_date, created_at FROM sarga_customer_payments WHERE customer_mobile = ? ORDER BY created_at DESC',
            [mobile]
        );
        
        console.log(`\nFound ${payments.length} payments for this customer`);
        
        if (payments.length === 0) {
            console.log('No payments found');
            process.exit(0);
        }
        
        // Get date range of payments
        const firstPayment = payments[payments.length - 1].created_at;
        const lastPayment = payments[0].created_at;
        
        console.log(`\nPayment date range: ${firstPayment} to ${lastPayment}`);
        
        // Find jobs with null customer_id in the same date range
        const [orphanJobs] = await pool.query(
            `SELECT id, job_number, job_name, total_amount, created_at 
             FROM sarga_jobs 
             WHERE customer_id IS NULL 
             AND created_at >= ? 
             AND created_at <= ?
             ORDER BY created_at`,
            [firstPayment, lastPayment]
        );
        
        console.log(`\nFound ${orphanJobs.length} orphaned jobs in same time period:`);
        orphanJobs.forEach(j => {
            console.log(`  - Job ${j.id}: ${j.job_number} - ${j.job_name} - ₹${j.total_amount}`);
        });
        
        if (orphanJobs.length > 0) {
            const jobIds = orphanJobs.map(j => j.id);
            const [result] = await pool.query(
                'UPDATE sarga_jobs SET customer_id = ? WHERE id IN (?)',
                [customers[0].id, jobIds]
            );
            console.log(`\n✓ Updated ${result.affectedRows} jobs to link to customer ${customers[0].id} (${customers[0].name})`);
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
})();

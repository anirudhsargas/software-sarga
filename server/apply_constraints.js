const { pool } = require('./database');

async function applyConstraints() {
    const tableConstraints = {
        'sarga_vendor_payments': ['amount'],
        'sarga_staff_payments': ['amount'],
        'sarga_inventory': ['cost_price', 'sell_price'],
        'sarga_payments': ['amount', 'cash_amount', 'upi_amount'],
        'sarga_customer_payments': ['bill_amount', 'total_amount', 'net_amount', 'sgst_amount', 'cgst_amount', 'advance_paid', 'cash_amount', 'upi_amount', 'discount_amount'],
        'sarga_jobs': ['unit_price', 'total_amount'],
        'sarga_emi_master': ['loan_amount', 'monthly_emi'],
        'sarga_emi_payments': ['amount'],
        'sarga_kuri_master': ['total_amount', 'monthly_installment', 'prize_amount'],
        'sarga_kuri_payments': ['amount'],
        'sarga_staff': ['base_salary', 'daily_rate'],
        'sarga_staff_salary': ['base_salary', 'net_salary']
    };

    console.log('Applying CHECK constraints...');

    for (const [table, columns] of Object.entries(tableConstraints)) {
        for (const col of columns) {
            const constraintName = `chk_${table}_${col}_positive`;
            try {
                // Drop if exists first (MySQL 8.0.16+)
                await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraintName}`).catch(() => {});
                
                // Add constraint
                await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} CHECK (${col} >= 0)`);
                console.log(`Successfully added constraint to ${table}.${col}`);
            } catch (err) {
                console.error(`Failed to add constraint to ${table}.${col}:`, err.message);
            }
        }
    }

    process.exit(0);
}

applyConstraints().catch(err => {
    console.error(err);
    process.exit(1);
});

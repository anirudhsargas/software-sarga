const { pool } = require('../database');

const migrate = async () => {
  try {
    console.log('Starting migration: Add partial payment support...');

    // Add columns to sarga_payments table
    await pool.query(`
      ALTER TABLE sarga_payments 
      ADD COLUMN IF NOT EXISTS bill_total_amount DECIMAL(12, 2) DEFAULT 0
    `);
    console.log('✓ Added bill_total_amount column');

    await pool.query(`
      ALTER TABLE sarga_payments 
      ADD COLUMN IF NOT EXISTS is_partial_payment TINYINT(1) DEFAULT 0
    `);
    console.log('✓ Added is_partial_payment column');

    await pool.query(`
      ALTER TABLE sarga_payments 
      ADD COLUMN IF NOT EXISTS bill_reference_id INT DEFAULT NULL
    `);
    console.log('✓ Added bill_reference_id column');

    await pool.query(`
      ALTER TABLE sarga_payments 
      ADD COLUMN IF NOT EXISTS payment_status ENUM('Pending', 'Partially Paid', 'Fully Paid') DEFAULT 'Pending'
    `);
    console.log('✓ Added payment_status column');

    // Set payment_status for existing payments
    await pool.query(`
      UPDATE sarga_payments 
      SET payment_status = 'Fully Paid' 
      WHERE payment_status = 'Pending'
    `);
    console.log('✓ Updated existing payments status to Fully Paid');

    console.log('\n✅ Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  }
};

migrate();

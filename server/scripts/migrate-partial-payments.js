const { pool } = require('../database');

const addColumn = async (table, col, def) => {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log(`✓ Added ${col}`);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log(`  ${col} already exists — skipping`);
    } else {
      throw e;
    }
  }
};

const migrate = async () => {
  try {
    console.log('Starting migration: Add partial payment support...');

    await addColumn('sarga_payments', 'bill_total_amount', 'DECIMAL(12, 2) DEFAULT 0');
    await addColumn('sarga_payments', 'is_partial_payment', 'TINYINT(1) DEFAULT 0');
    await addColumn('sarga_payments', 'bill_reference_id', 'INT DEFAULT NULL');
    await addColumn('sarga_payments', 'payment_status', "ENUM('Pending', 'Partially Paid', 'Fully Paid') DEFAULT 'Fully Paid'");

    // Set payment_status for existing payments that have no status yet
    const [r] = await pool.query(`
      UPDATE sarga_payments 
      SET payment_status = 'Fully Paid' 
      WHERE payment_status = 'Pending' OR payment_status IS NULL
    `);
    console.log(`✓ Updated ${r.affectedRows} existing payments to Fully Paid`);

    console.log('\n✅ Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
};

migrate();

// Migration 033: Fix vendor tables, add missing columns, update payment modes
module.exports = async (connection) => {
  const dbName = process.env.DB_NAME || 'sarga_db';

  console.log('[Migration 033] Starting vendor tables schema updates...');

  // 1. Check and add columns to 'vendors' table
  const checkColumn = async (table, col) => {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [dbName, table, col]
    );
    return rows.length > 0;
  };

  // Add columns to vendors if missing
  const hasGstin = await checkColumn('vendors', 'gstin');
  if (!(await checkColumn('vendors', 'gst_number'))) {
    await connection.query(`ALTER TABLE vendors ADD COLUMN gst_number VARCHAR(20) NULL${hasGstin ? ' AFTER gstin' : ''}`);
    console.log('[Migration 033] Added vendors.gst_number column');
  }

  if (!(await checkColumn('vendors', 'vendor_type'))) {
    await connection.query(`ALTER TABLE vendors ADD COLUMN vendor_type ENUM('paper', 'ink', 'plate', 'service', 'other') DEFAULT 'other' AFTER category`);
    console.log('[Migration 033] Added vendors.vendor_type column');
  }

  if (!(await checkColumn('vendors', 'opening_balance'))) {
    await connection.query(`ALTER TABLE vendors ADD COLUMN opening_balance DECIMAL(12, 2) DEFAULT 0.00 AFTER credit_limit`);
    console.log('[Migration 033] Added vendors.opening_balance column');
  }

  if (!(await checkColumn('vendors', 'current_balance'))) {
    await connection.query(`ALTER TABLE vendors ADD COLUMN current_balance DECIMAL(12, 2) DEFAULT 0.00 AFTER opening_balance`);
    console.log('[Migration 033] Added vendors.current_balance column');
  }

  // Populate vendors columns
  // COPY gstin to gst_number (only where gst_number is NULL/empty AND gstin has data)
  if (hasGstin) {
    await connection.query(`
      UPDATE vendors 
      SET gst_number = COALESCE(NULLIF(gstin, ''), gst_number)
      WHERE gst_number IS NULL
    `);
  }
  // TODO: After verifying gst_number data, drop `gstin` column in migration 034
  await connection.query(`
    UPDATE vendors 
    SET vendor_type = CASE 
      WHEN category = 'paper' THEN 'paper'
      WHEN category = 'ink' THEN 'ink'
      WHEN category = 'equipment' THEN 'service'
      ELSE 'other'
    END
    WHERE vendor_type = 'other' OR vendor_type IS NULL
  `);

  // 2. Check and add columns to 'vendor_payments' table
  if (!(await checkColumn('vendor_payments', 'created_by'))) {
    await connection.query(`ALTER TABLE vendor_payments ADD COLUMN created_by INT NULL AFTER notes`);
    try {
      await connection.query(`ALTER TABLE vendor_payments ADD CONSTRAINT fk_vendor_payments_created_by FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL`);
    } catch (e) {
      if (e.code !== 'ER_FK_DUP_NAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    console.log('[Migration 033] Added vendor_payments.created_by column and FK constraint');
  }

  // Update existing payment_mode values to compatible values:
  // First, temporarily alter the column to include both old and new values so we don't violate constraints during transition
  await connection.query(`ALTER TABLE vendor_payments MODIFY COLUMN payment_mode ENUM('cash', 'upi', 'bank_transfer', 'cheque', 'bank', 'neft', 'rtgs') DEFAULT 'cash'`);
  
  // Now we can safely perform the update
  await connection.query(`UPDATE vendor_payments SET payment_mode = 'bank' WHERE payment_mode = 'bank_transfer'`);

  // Finally, alter to the target enum definition without the old 'bank_transfer' value
  await connection.query(`ALTER TABLE vendor_payments MODIFY COLUMN payment_mode ENUM('cash', 'bank', 'upi', 'cheque', 'neft', 'rtgs') DEFAULT 'cash'`);
  console.log('[Migration 033] Updated vendor_payments.payment_mode enum options');

  // 3. Check and add columns to 'vendor_invoices' table
  if (!(await checkColumn('vendor_invoices', 'gst_amount'))) {
    await connection.query(`ALTER TABLE vendor_invoices ADD COLUMN gst_amount DECIMAL(12, 2) DEFAULT 0.00 AFTER amount`);
    console.log('[Migration 033] Added vendor_invoices.gst_amount column');
  }

  if (!(await checkColumn('vendor_invoices', 'total_amount'))) {
    await connection.query(`ALTER TABLE vendor_invoices ADD COLUMN total_amount DECIMAL(12, 2) DEFAULT 0.00 AFTER gst_amount`);
    console.log('[Migration 033] Added vendor_invoices.total_amount column');
  }

  if (!(await checkColumn('vendor_invoices', 'payment_status'))) {
    await connection.query(`ALTER TABLE vendor_invoices ADD COLUMN payment_status ENUM('unpaid', 'partial', 'paid') DEFAULT 'unpaid' AFTER status`);
    console.log('[Migration 033] Added vendor_invoices.payment_status column');
  }

  // Populate vendor_invoices columns
  await connection.query(`UPDATE vendor_invoices SET total_amount = amount WHERE total_amount = 0 OR total_amount IS NULL`);
  await connection.query(`
    UPDATE vendor_invoices 
    SET payment_status = CASE 
      WHEN status = 'paid' THEN 'paid'
      WHEN status = 'partial' THEN 'partial'
      ELSE 'unpaid'
    END
    WHERE payment_status = 'unpaid'
  `);

  // 4. Update vendor current balances initially
  const [vendorsList] = await connection.query('SELECT id, opening_balance FROM vendors');
  for (const v of vendorsList) {
    const [billSum] = await connection.query('SELECT COALESCE(SUM(amount), 0) as total_billed FROM vendor_invoices WHERE vendor_id = ?', [v.id]);
    const [paySum] = await connection.query('SELECT COALESCE(SUM(amount), 0) as total_paid FROM vendor_payments WHERE vendor_id = ?', [v.id]);
    const calculated = (Number(v.opening_balance) || 0) + (Number(billSum[0].total_billed) || 0) - (Number(paySum[0].total_paid) || 0);
    await connection.query('UPDATE vendors SET current_balance = ? WHERE id = ?', [calculated, v.id]);
  }

  console.log('[Migration 033] Vendor tables schema updates completed successfully.');
};

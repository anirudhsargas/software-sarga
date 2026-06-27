// Migration 032: Fix schema drift, add missing FKs, create customer sessions table
// NOTE: 032_schema_fixes.sql renamed to .bak — do not run independently
module.exports = async (connection) => {
  const dbName = process.env.DB_NAME || 'sarga_db';

  // 1. Add missing columns to sarga_audit_logs
  const [auditCols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_audit_logs' AND COLUMN_NAME = 'entity_type'`,
    [dbName]
  );
  if (auditCols.length === 0) {
    await connection.query(`ALTER TABLE sarga_audit_logs ADD COLUMN entity_type VARCHAR(50) NULL AFTER details`);
    await connection.query(`ALTER TABLE sarga_audit_logs ADD COLUMN entity_id INT NULL AFTER entity_type`);
    await connection.query(`ALTER TABLE sarga_audit_logs ADD COLUMN ip_address VARCHAR(45) NULL AFTER entity_id`);
  }

  // 2. Add missing FKs on sarga_jobs
  const [fkCheck] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_jobs' AND CONSTRAINT_NAME IN ('fk_jobs_customer', 'fk_jobs_product')`,
    [dbName]
  );
  const existingFKs = fkCheck.map(r => r.CONSTRAINT_NAME);
  if (!existingFKs.includes('fk_jobs_customer')) {
    try {
      await connection.query(`ALTER TABLE sarga_jobs ADD CONSTRAINT fk_jobs_customer FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL`);
    } catch (e) { if (e.code !== 'ER_FK_DUP_NAME' && e.code !== 'ER_DUP_KEYNAME') throw e; }
  }
  if (!existingFKs.includes('fk_jobs_product')) {
    try {
      await connection.query(`ALTER TABLE sarga_jobs ADD CONSTRAINT fk_jobs_product FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE SET NULL`);
    } catch (e) { if (e.code !== 'ER_FK_DUP_NAME' && e.code !== 'ER_DUP_KEYNAME') throw e; }
  }

  // 3. Drop duplicate generated columns (from 024_dynamic_tables.sql)
  const [machineReadingsCols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_machine_readings' AND COLUMN_NAME = 'total_copies' AND EXTRA LIKE '%GENERATED%'`,
    [dbName]
  );
  if (machineReadingsCols.length > 0) {
    await connection.query(`ALTER TABLE sarga_machine_readings DROP COLUMN total_copies`);
  }
  const [dailyReportMachineCols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_daily_report_machine' AND COLUMN_NAME = 'total_copies' AND EXTRA LIKE '%GENERATED%'`,
    [dbName]
  );
  if (dailyReportMachineCols.length > 0) {
    await connection.query(`ALTER TABLE sarga_daily_report_machine DROP COLUMN total_copies`);
  }

  // 4. Create customer sessions table for token revocation
  const [sessionTables] = await connection.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_customer_sessions'`,
    [dbName]
  );
  if (sessionTables.length === 0) {
    await connection.query(`
      CREATE TABLE sarga_customer_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        session_token VARCHAR(500) NOT NULL,
        ip_address VARCHAR(45),
        user_agent VARCHAR(500),
        is_revoked TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        INDEX idx_customer_session_token (session_token(255)),
        INDEX idx_customer_id (customer_id),
        FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE
      )
    `);
  }

  // 5. Fix redundant migrations: add vendor_id FK to sarga_vendor_payments
  const [vendorPayCols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_vendor_payments' AND COLUMN_NAME = 'vendor_id'`,
    [dbName]
  );
  if (vendorPayCols.length === 0) {
    await connection.query(`ALTER TABLE sarga_vendor_payments ADD COLUMN vendor_id INT NULL AFTER id`);
  }

  // 6. Fix redundant migrations: add staff_user_id FK to sarga_staff_payments
  const [staffPayCols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_staff_payments' AND COLUMN_NAME = 'staff_user_id'`,
    [dbName]
  );
  if (staffPayCols.length === 0) {
    await connection.query(`ALTER TABLE sarga_staff_payments ADD COLUMN staff_user_id INT NULL AFTER id`);
  }

  console.log('[Migration 032] Schema fixes applied: audit_logs columns, missing FKs, customer sessions table');
};

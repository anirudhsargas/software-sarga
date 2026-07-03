// Migration 036: Create vendor_statements and vendor_statement_lines tables
// These tables are queried by GET /api/vendors/:id/statement (and related
// upload / reconcile routes) but were never included in a prior migration,
// causing 500 Internal Server Errors on first access in production.
module.exports = async (connection) => {
  console.log('[Migration 036] Creating vendor statement tables...');

  // vendor_statements: one record per uploaded bank statement per vendor
  await connection.query(`
    CREATE TABLE IF NOT EXISTS vendor_statements (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      vendor_id             INT          NOT NULL,
      statement_month       VARCHAR(20)  NULL        COMMENT 'e.g. 2024-06',
      file_name             VARCHAR(255) NULL,
      file_path             VARCHAR(500) NULL,
      raw_text              LONGTEXT     NULL        COMMENT 'Full extracted text for PDF uploads',
      reconciliation_status ENUM('pending','matched','has_discrepancy') NOT NULL DEFAULT 'pending',
      discrepancy_notes     TEXT         NULL,
      created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_vs_vendor FOREIGN KEY (vendor_id)
        REFERENCES vendors (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Migration 036] Created vendor_statements table');

  // vendor_statement_lines: individual rows parsed from each statement file
  await connection.query(`
    CREATE TABLE IF NOT EXISTS vendor_statement_lines (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      vendor_statement_id  INT            NOT NULL,
      line_date            DATE           NULL,
      description          VARCHAR(500)   NULL,
      amount               DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      type                 ENUM('debit','credit','unknown') NOT NULL DEFAULT 'unknown',
      match_status         ENUM('unmatched','matched','partial') NOT NULL DEFAULT 'unmatched',
      matched_invoice_id   INT            NULL COMMENT 'FK to vendor_invoices.id when reconciled',
      created_at           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_vsl_statement FOREIGN KEY (vendor_statement_id)
        REFERENCES vendor_statements (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Migration 036] Created vendor_statement_lines table');

  // Indexes for fast lookups — use plain CREATE INDEX (no IF NOT EXISTS on older MySQL)
  try {
    await connection.query(`
      ALTER TABLE vendor_statements
        ADD INDEX idx_vs_vendor_id (vendor_id)
    `);
  } catch (e) {
    if (e.code !== 'ER_DUP_KEYNAME') throw e;
  }

  try {
    await connection.query(`
      ALTER TABLE vendor_statement_lines
        ADD INDEX idx_vsl_statement_id (vendor_statement_id)
    `);
  } catch (e) {
    if (e.code !== 'ER_DUP_KEYNAME') throw e;
  }

  console.log('[Migration 036] Vendor statement tables created successfully.');
};

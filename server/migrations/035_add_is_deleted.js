// Migration 035: Add is_deleted and sync_enabled columns for soft-delete sync between Inventory and Product Library
// NOTE: No AFTER clauses to avoid ordering issues when columns don't exist yet
module.exports = async (connection) => {
  const dbName = process.env.DB_NAME || 'sarga_db';

  // 1. Add updated_at to sarga_inventory
  const [updatedAtCol] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_inventory' AND COLUMN_NAME = 'updated_at'`,
    [dbName]
  );
  if (updatedAtCol.length === 0) {
    await connection.query(`ALTER TABLE sarga_inventory ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
  }

  // 2. Add is_deleted to sarga_inventory
  const [invCol] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_inventory' AND COLUMN_NAME = 'is_deleted'`,
    [dbName]
  );
  if (invCol.length === 0) {
    await connection.query(`ALTER TABLE sarga_inventory ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0`);
    await connection.query(`ALTER TABLE sarga_inventory ADD INDEX idx_inventory_is_deleted (is_deleted)`);
  }

  // 3. Add is_deleted to sarga_products
  const [prodCol] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_products' AND COLUMN_NAME = 'is_deleted'`,
    [dbName]
  );
  if (prodCol.length === 0) {
    await connection.query(`ALTER TABLE sarga_products ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0`);
    await connection.query(`ALTER TABLE sarga_products ADD INDEX idx_products_is_deleted (is_deleted)`);
  }

  // 4. Add sync_enabled to sarga_products (default TRUE — linked mode)
  const [syncCol] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_products' AND COLUMN_NAME = 'sync_enabled'`,
    [dbName]
  );
  if (syncCol.length === 0) {
    await connection.query(`ALTER TABLE sarga_products ADD COLUMN sync_enabled TINYINT(1) NOT NULL DEFAULT 1`);
  }
};

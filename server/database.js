const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const loadSchemaFiles = async (connection, appliedMigrations) => {
  const schemaDir = path.join(__dirname, 'schemas');
  if (!fs.existsSync(schemaDir)) return;
  const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (appliedMigrations.has(file)) {
      continue;
    }
    if (file === '022_add_description_to_credit_transactions.sql') {
      const [cols] = await connection.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sarga_daily_credit_transactions'
          AND COLUMN_NAME = 'description'
      `);
      if (cols.length === 0) {
        await connection.query(`
          ALTER TABLE sarga_daily_credit_transactions
            ADD COLUMN description VARCHAR(500) NULL AFTER amount
        `);
      }
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [file]);
      appliedMigrations.add(file);
      continue;
    }
    if (file === '023_fix_credit_transactions_columns.sql') {
      const [cols] = await connection.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sarga_daily_credit_transactions'
          AND COLUMN_NAME = 'customer_id'
      `);
      if (cols.length === 0) {
        await connection.query(`
          ALTER TABLE sarga_daily_credit_transactions
            ADD COLUMN customer_id INT NULL AFTER description
        `);
      }
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [file]);
      appliedMigrations.add(file);
      continue;
    }
    if (file === '029_sheets_backup_jobs.sql') {
      const [tables] = await connection.query(`
        SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sarga_backup_jobs'
      `);
      if (tables.length === 0) {
        await connection.query(`
          CREATE TABLE sarga_backup_jobs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            triggered_by ENUM('cron', 'manual') NOT NULL DEFAULT 'cron',
            status ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL,
            tables_backed_up INT DEFAULT 0,
            rows_written INT DEFAULT 0,
            error_message TEXT NULL
          )
        `);
      }
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [file]);
      appliedMigrations.add(file);
      continue;
    }
    const rawSql = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    // Remove multi-line comments
    const noMultiLineComments = rawSql.replace(/\/\*[\s\S]*?\*\//g, '');
    // Filter out single-line comment lines starting with -- or #
    const cleanSql = noMultiLineComments
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('--') && !trimmed.startsWith('#');
      })
      .join('\n');
    // Split statements safely, respecting string literals and delimiters
    const statements = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;
    let inBacktick = false;
    for (let i = 0; i < cleanSql.length; i++) {
      const char = cleanSql[i];
      const prev = i > 0 ? cleanSql[i - 1] : '';
      if (!inQuotes && !inBacktick && (char === "'" || char === '"')) {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (inQuotes && char === quoteChar && prev !== '\\') {
        inQuotes = false;
        quoteChar = null;
        current += char;
      } else if (!inQuotes && char === '`' && prev !== '\\') {
        inBacktick = !inBacktick;
        current += char;
      } else if (char === ';' && !inQuotes && !inBacktick) {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = '';
      } else {
        current += char;
      }
    }
    const trimmed = current.trim();
    if (trimmed) statements.push(trimmed);
    for (const stmt of statements) {
      try {
        await connection.query(stmt);
      } catch (e) {
        const ignoredCodes = [
          'ER_TABLE_EXISTS_ERROR',  // CREATE TABLE IF NOT EXISTS (safety)
          'ER_DUP_KEYNAME',         // duplicate index name
          'ER_DUP_FIELDNAME',       // ADD COLUMN for existing column
          'ER_CANT_DROP_FIELD_OR_KEY', // DROP COLUMN/KEY that doesn't exist
          'ER_BAD_FIELD_ERROR',     // column doesn't exist (safe to skip)
        ];
        if (!ignoredCodes.includes(e.code)) throw e;
      }
    }
    await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [file]);
    appliedMigrations.add(file);
  }
};

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  acquireTimeout: 60000,
  connectTimeout: 10000,
  queryTimeout: 30000,
  ...((process.env.DB_SSL === 'true' || process.env.DB_SSL_MODE === 'REQUIRED' || process.env.PGSSLMODE === 'require') && {
    ssl: (() => {
      const caPath = path.join(__dirname, 'aiven-ca.pem');
      if (!fs.existsSync(caPath)) {
        throw new Error(
          'SSL is required (DB_SSL=true or DB_SSL_MODE=REQUIRED) but aiven-ca.pem is missing. ' +
          'Please place the CA certificate at ' + caPath
        );
      }
      return { ca: fs.readFileSync(caPath), rejectUnauthorized: true };
    })(),
  }),
});

const initDb = async () => {
  const connection = await pool.getConnection();
  try {
    // Ensure the tracking table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Fetch applied migrations
    const [rows] = await connection.query('SELECT migration_name FROM schema_migrations');
    const appliedMigrations = new Set(rows.map(r => r.migration_name));

    console.log(`[Migration] ${appliedMigrations.size} migrations already applied, skipping DB checks`);
    console.log('Starting database schema migration...');
    
    await loadSchemaFiles(connection, appliedMigrations);
    
    // Run the new sequential JS migration
    const migrateProductHierarchyName = '023_create_product_hierarchy.js';
    if (!appliedMigrations.has(migrateProductHierarchyName)) {
      const migrateProductHierarchy = require('./migrations/023_create_product_hierarchy');
      await migrateProductHierarchy(connection);
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [migrateProductHierarchyName]);
      appliedMigrations.add(migrateProductHierarchyName);
    }

    // Run schema fixes migration (adds missing columns, FKs, customer sessions)
    const migrateSchemaFixesName = '032_schema_fixes.js';
    if (!appliedMigrations.has(migrateSchemaFixesName)) {
      const migrateSchemaFixes = require('./migrations/032_schema_fixes');
      await migrateSchemaFixes(connection);
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [migrateSchemaFixesName]);
      appliedMigrations.add(migrateSchemaFixesName);
    }

    // Run vendor tables fixes migration (adds missing columns, updates payments mode enum, etc.)
    const migrateVendorTablesName = '033_fix_vendor_tables.js';
    if (!appliedMigrations.has(migrateVendorTablesName)) {
      const migrateVendorTables = require('./migrations/033_fix_vendor_tables');
      await migrateVendorTables(connection);
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [migrateVendorTablesName]);
      appliedMigrations.add(migrateVendorTablesName);
    }

    // Run legacy column removal migration (drops vendors.type and vendors.gstin after data verification)
    const migrateDropLegacyName = '034_drop_legacy_vendor_columns.js';
    if (!appliedMigrations.has(migrateDropLegacyName)) {
      const migrateDropLegacy = require('./migrations/034_drop_legacy_vendor_columns');
      await migrateDropLegacy(connection);
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [migrateDropLegacyName]);
      appliedMigrations.add(migrateDropLegacyName);
    }

    // Run is_deleted / sync_enabled migration for Inventory ↔ Product Library sync
    const migrateIsDeletedName = '035_add_is_deleted.js';
    if (!appliedMigrations.has(migrateIsDeletedName)) {
      const migrateIsDeleted = require('./migrations/035_add_is_deleted');
      await migrateIsDeleted(connection);
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [migrateIsDeletedName]);
      appliedMigrations.add(migrateIsDeletedName);
    }
    
    console.log('Database schema migration completed successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = { pool, initDb };

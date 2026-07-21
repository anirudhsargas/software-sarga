const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CURRENT_SCHEMA_VERSION = '045_enterprise_audit.sql';
const BOOTSTRAP_SCHEMA_NAME = 'server_bootstrap';

let poolInstance = null;
let poolInitPromise = null;

function createPoolInstance() {
  if (poolInstance) return Promise.resolve(poolInstance);

  if (!poolInitPromise) {
    poolInitPromise = (async () => {
      const poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 25,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        connectTimeout: 10000,
        maxIdle: 10,
        idleTimeout: 30000,
      };

      if (process.env.DB_SSL === 'true' || process.env.DB_SSL_MODE === 'REQUIRED' || process.env.PGSSLMODE === 'require') {
        const caPath = path.join(__dirname, 'aiven-ca.pem');
        if (!fs.existsSync(caPath)) {
          throw new Error(
            'SSL is required (DB_SSL=true or DB_SSL_MODE=REQUIRED) but aiven-ca.pem is missing. ' +
            'Please place the CA certificate at ' + caPath
          );
        }
        poolConfig.ssl = { ca: fs.readFileSync(caPath), rejectUnauthorized: true };
      }

      poolInstance = mysql.createPool(poolConfig);
      return poolInstance;
    })();
  }

  return poolInitPromise;
}

const pool = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'then') return undefined;
    if (prop === Symbol.toStringTag) return 'MySQLPoolProxy';
    return (...args) => createPoolInstance().then((instance) => {
      const value = instance[prop];
      if (typeof value === 'function') {
        return value.apply(instance, args);
      }
      if (args.length > 0) {
        throw new TypeError(`Property ${String(prop)} is not callable on the MySQL pool proxy`);
      }
      return value;
    });
  }
});

async function warmDatabasePool() {
  const startedAt = process.hrtime.bigint();
  const queries = [
    { name: 'SELECT 1', sql: 'SELECT 1 AS ok' },
    { name: 'products', sql: 'SELECT id FROM sarga_products LIMIT 1' },
    { name: 'inventory', sql: 'SELECT id FROM sarga_inventory LIMIT 1' },
    { name: 'branches', sql: 'SELECT id FROM sarga_branches LIMIT 1' },
    { name: 'company_settings', sql: 'SELECT setting_key FROM sarga_company_settings LIMIT 1' },
    { name: 'product_hierarchy', sql: 'SELECT id FROM product_hierarchy LIMIT 1' },
  ];

  // Use a single connection for all warm-up queries to pay the MySQL+SSL
  // handshake cost once (~1.8s for cross-region Aiven), not per-query.
  const connection = await pool.getConnection();
  try {
    const results = [];
    for (const { name, sql } of queries) {
      const stepStartedAt = process.hrtime.bigint();
      const [rows] = await connection.query(sql);
      const elapsedMs = Number(process.hrtime.bigint() - stepStartedAt) / 1e6;
      results.push({ name, rows: Array.isArray(rows) ? rows.length : 0, elapsedMs });
    }

    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`[DB Warmup] Completed in ${elapsedMs.toFixed(1)}ms (${results.length}/${queries.length} queries ok)`);
    results.forEach(step => {
      console.log(`[DB Warmup] ${step.name} in ${step.elapsedMs.toFixed(1)}ms (${step.rows} rows)`);
    });

    return { elapsedMs, successful: results, failed: [] };
  } finally {
    connection.release();
  }
}

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
          'ER_NO_SUCH_TABLE',       // ref table doesn't exist yet (safe to skip)
        ];
        if (!ignoredCodes.includes(e.code)) throw e;
      }
    }
    await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [file]);
    appliedMigrations.add(file);
  }
};

const initDb = async () => {
  const startedAt = process.hrtime.bigint();
  console.log('[Migration] initDb started');
  const connection = await pool.getConnection();
  try {
    let bootstrapMarker = null;
    try {
      const [versionRows] = await connection.query(
        'SELECT hash FROM schema_version WHERE name = ? AND status = ? LIMIT 1',
        [BOOTSTRAP_SCHEMA_NAME, 'applied']
      );
      bootstrapMarker = versionRows[0]?.hash || null;
    } catch (lookupErr) {
      console.log(`[Migration] Bootstrap marker lookup skipped: ${lookupErr.message}`);
    }

    if (bootstrapMarker === CURRENT_SCHEMA_VERSION) {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      console.log(`[Migration] Fast path hit (${BOOTSTRAP_SCHEMA_NAME}:${CURRENT_SCHEMA_VERSION}); skipping full migration scan in ${elapsedMs.toFixed(1)}ms`);
      return;
    }

    console.log(`[Migration] Bootstrap marker ${bootstrapMarker || 'missing'} -> ${CURRENT_SCHEMA_VERSION}; running migration scan`);

    // Ensure the tracking table exists only when a full scan is actually needed.
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

    console.log(`[Migration] ${appliedMigrations.size} migrations already applied, checking pending work`);
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

    // Create vendor_statements and vendor_statement_lines tables (were missing in production)
    const migrateVendorStatementsName = '036_create_vendor_statements.js';
    if (!appliedMigrations.has(migrateVendorStatementsName)) {
      const migrateVendorStatements = require('./migrations/036_create_vendor_statements');
      await migrateVendorStatements(connection);
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [migrateVendorStatementsName]);
      appliedMigrations.add(migrateVendorStatementsName);
    }

    // Add provider, billing_cycle to utility_connections and connection_record_id to utility_bills
    const migrateUtilityConnectionFieldsName = '037_add_utility_connection_fields.js';
    if (!appliedMigrations.has(migrateUtilityConnectionFieldsName)) {
      const migrateUtilityConnectionFields = require('./migrations/037_add_utility_connection_fields');
      await migrateUtilityConnectionFields(connection);
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [migrateUtilityConnectionFieldsName]);
      appliedMigrations.add(migrateUtilityConnectionFieldsName);
    }

    // Create paper_rate_history table and add current_rate_id to paper_types (was never wired into initDb)
    const migratePaperRateHistoryName = '2026_07_15_paper_rate_history.sql';
    if (!appliedMigrations.has(migratePaperRateHistoryName)) {
      const sqlPath = path.join(__dirname, 'migrations', migratePaperRateHistoryName);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const statements = sql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          return !trimmed.startsWith('--') && !trimmed.startsWith('#');
        })
        .join('\n')
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          await connection.query(stmt);
        } catch (e) {
          const ignoredCodes = ['ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_DUP_FIELDNAME', 'ER_CANT_DROP_FIELD_OR_KEY', 'ER_BAD_FIELD_ERROR'];
          if (!ignoredCodes.includes(e.code)) throw e;
        }
      }
      await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [migratePaperRateHistoryName]);
      appliedMigrations.add(migratePaperRateHistoryName);
    }

    await connection.query(
      'INSERT INTO schema_version (name, hash, applied_at, duration_ms, status) VALUES (?, ?, NOW(), ?, ?) ON DUPLICATE KEY UPDATE hash = VALUES(hash), applied_at = VALUES(applied_at), duration_ms = VALUES(duration_ms), status = VALUES(status)',
      [BOOTSTRAP_SCHEMA_NAME, CURRENT_SCHEMA_VERSION, Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6), 'applied']
    );

    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`Database schema migration completed successfully in ${elapsedMs.toFixed(1)}ms`);
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = { pool, initDb, warmDatabasePool, createPoolInstance, CURRENT_SCHEMA_VERSION };

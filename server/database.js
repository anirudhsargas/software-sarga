const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const loadSchemaFiles = async (connection) => {
  const schemaDir = path.join(__dirname, 'schemas');
  if (!fs.existsSync(schemaDir)) return;
  const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
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
      } else {
        await connection.query('DROP TABLE sarga_backup_jobs');
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
    const statements = cleanSql.split(';').filter(s => s.trim());
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
  ...((process.env.DB_SSL === 'true' || process.env.DB_SSL_MODE === 'REQUIRED' || process.env.PGSSLMODE === 'require') && {
    ssl: fs.existsSync(path.join(__dirname, 'aiven-ca.pem'))
      ? { ca: fs.readFileSync(path.join(__dirname, 'aiven-ca.pem')), rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  }),
});

const initDb = async () => {
  const connection = await pool.getConnection();
  try {
    console.log('Starting database schema migration...');
    await loadSchemaFiles(connection);
    
    // Run the new sequential JS migration
    const migrateProductHierarchy = require('./migrations/023_create_product_hierarchy');
    await migrateProductHierarchy(connection);
    
    console.log('Database schema migration completed successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = { pool, initDb };

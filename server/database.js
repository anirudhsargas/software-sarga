const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const loadSchemaFiles = async (connection) => {
  const schemaDir = path.join(__dirname, 'schemas');
  if (!fs.existsSync(schemaDir)) return;
  const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
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
    console.log('Database schema migration completed successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = { pool, initDb };

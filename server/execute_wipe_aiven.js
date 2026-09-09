const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const TARGET_TABLES = [
  'sarga_customers',
  'sarga_customer_payments',
  'sarga_customer_requests',
  'sarga_customer_sessions',
  'sarga_customer_designs',
  'sarga_customer_otps',
  'sarga_credit_customers',
  'sarga_credit_ledger',
  'sarga_daily_credit_transactions',
  'sarga_invoices',
  'sarga_invoice_sequence',
  'sarga_invoice_tracking',
  'sarga_jobs',
  'sarga_job_matter',
  'sarga_job_proofs',
  'sarga_job_staff_assignments',
  'sarga_job_status_history',
  'sarga_orders',
  'sarga_payments',
  'sarga_payment_transactions',
  'orders',
  'customers',
  'customer_logs',
  'invoices',
  'invoice_payments',
  'invoice_items',
  'work_jobs',
  'work_orders'
];

async function wipeData() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL_MODE === 'REQUIRED' ? { rejectUnauthorized: false } : undefined,
    });

    console.log('Connected to Aiven Database:', process.env.DB_HOST);
    
    // Disable foreign key checks for clean truncation
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('Disabled FOREIGN_KEY_CHECKS.');

    for (const tableName of TARGET_TABLES) {
      try {
        await connection.query(`TRUNCATE TABLE \`${tableName}\``);
        console.log(`[CLEARED] Table \`${tableName}\` successfully truncated.`);
      } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
          console.log(`[SKIP] Table \`${tableName}\` does not exist.`);
        } else {
          console.error(`[ERROR] Table \`${tableName}\`: ${err.message}`);
        }
      }
    }

    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Re-enabled FOREIGN_KEY_CHECKS.');

    console.log('\n--- VERIFICATION AFTER WIPING ---');
    for (const tableName of TARGET_TABLES) {
      try {
        const [res] = await connection.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
        console.log(`\`${tableName}\`: ${res[0].count} records remaining`);
      } catch (err) {
        // Table doesn't exist, ignore
      }
    }

  } catch (err) {
    console.error('Fatal Database Error:', err.message);
  } finally {
    if (connection) await connection.end();
  }
}

wipeData();

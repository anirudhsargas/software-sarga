const mysql = require('mysql2/promise');
require('dotenv').config();

// Create pool same as database.js
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ...(process.env.DB_SSL === 'true' && { ssl: { rejectUnauthorized: false } }),
});

async function testQuery() {
  let connection;
  
  try {
    console.log('\n=== Testing sarga_customer_payments table ===\n');
    
    connection = await pool.getConnection();
    console.log('✓ Database connection successful');
    
    // First, let's check the table structure
    console.log('\n1. Checking table structure...');
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'sarga_customer_payments' AND TABLE_SCHEMA = DATABASE()
    `);
    
    if (columns.length === 0) {
      console.log('❌ Table not found!');
    } else {
      console.log(`✓ Found ${columns.length} columns:`);
      columns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (Nullable: ${col.IS_NULLABLE}, Key: ${col.COLUMN_KEY || 'N/A'})`);
      });
    }
    
    // Try basic SELECT
    console.log('\n2. Running SELECT * query...');
    const [rows] = await connection.query('SELECT * FROM sarga_customer_payments LIMIT 5');
    console.log(`✓ Query successful. Rows found: ${rows.length}`);
    if (rows.length > 0) {
      console.log('\nSample data:');
      console.log(JSON.stringify(rows, null, 2));
    } else {
      console.log('(No data in table)');
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Error Code:', error.code);
    console.error('SQL State:', error.sqlState);
    if (error.sql) console.error('SQL:', error.sql);
  } finally {
    if (connection) connection.release();
    await pool.end();
    console.log('\n=== Test Complete ===\n');
  }
}

testQuery().catch(err => {
  console.error('Fatal error:', err);
});

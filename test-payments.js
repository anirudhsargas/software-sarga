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
  const connection = await pool.getConnection();
  
  try {
    console.log('\n=== Testing sarga_customer_payments table ===\n');
    
    // First, let's check the table structure
    console.log('1. Checking table structure...');
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'sarga_customer_payments' AND TABLE_SCHEMA = DATABASE()
    `);
    console.log('Table columns:', columns);
    
    // Try basic SELECT
    console.log('\n2. Running SELECT * query...');
    const [rows] = await connection.query('SELECT * FROM sarga_customer_payments LIMIT 5');
    console.log('Query successful. Rows found:', rows.length);
    console.log('Sample data:', JSON.stringify(rows, null, 2));
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Error Code:', error.code);
    console.error('SQL State:', error.sqlState);
    console.error('Stack:', error.stack);
  } finally {
    connection.release();
    await pool.end();
  }
}

testQuery().catch(console.error);

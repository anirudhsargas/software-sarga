require('dotenv').config();
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sarga_db'
});

(async () => {
  try {
    const conn = await pool.getConnection();
    const currentMonth = new Date().toISOString().split('T')[0].slice(0, 7);
    console.log('Current Month:', currentMonth);
    
    const [attendance] = await conn.query(
      'SELECT COUNT(*) as cnt FROM sarga_staff_attendance'
    );
    console.log('Total Attendance Records:', attendance[0].cnt);
    
    const [leave] = await conn.query(
      'SELECT COUNT(*) as cnt FROM sarga_staff_leave_balance'
    );
    console.log('Total Leave Balance Records:', leave[0].cnt);
    
    conn.release();
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

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
    
    // Set some salary values first
    await conn.query(
      'UPDATE sarga_staff SET base_salary = 15000, daily_rate = 500 WHERE id = 2'
    );
    console.log('Updated salaries for staff ID 2');
    
    // Insert some test attendance for February 2026
    const dates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const day of dates) {
      const date = new Date(2026, 1, day);
      const dayOfWeek = date.getDay();
      const status = dayOfWeek === 0 ? 'Holiday' : 'Present';
      
      await conn.query(
        'INSERT INTO sarga_staff_attendance (staff_id, attendance_date, status, created_by) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE status = ?',
        [2, date.toISOString().split('T')[0], status, status]
      );
    }
    console.log('Inserted test attendance records');
    
    // Insert test leave balance
    await conn.query(
      'INSERT INTO sarga_staff_leave_balance (staff_id, `year_month`, paid_leaves_used, unpaid_leaves_used) VALUES (?, ?, 0, 0) ON DUPLICATE KEY UPDATE paid_leaves_used = 0, unpaid_leaves_used = 0',
      [2, '2026-02']
    );
    console.log('Inserted test leave balance record');
    
    const [result] = await conn.query(
      'SELECT * FROM sarga_staff_attendance WHERE staff_id = 2 AND DATE_FORMAT(attendance_date, "%Y-%m") = "2026-02" ORDER BY attendance_date'
    );
    console.log('Test attendance records created:', result.length, 'records');
    
    conn.release();
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

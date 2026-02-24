require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const p = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  const alters = [
    'ALTER TABLE sarga_payments ADD COLUMN bill_total_amount DECIMAL(12,2) DEFAULT NULL',
    'ALTER TABLE sarga_payments ADD COLUMN is_partial_payment TINYINT(1) DEFAULT 0',
    "ALTER TABLE sarga_payments ADD COLUMN payment_status ENUM('Pending','Partially Paid','Fully Paid') DEFAULT 'Fully Paid'"
  ];
  
  for (const a of alters) {
    try {
      await p.query(a);
      console.log('OK:', a.slice(0, 70));
    } catch(e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('EXISTS:', a.slice(0, 70));
      else console.log('ERR:', e.message.slice(0, 80));
    }
  }
  
  await p.end();
  console.log('Done.');
})();

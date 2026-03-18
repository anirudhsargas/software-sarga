/**
 * Daily Data Seeder: Jobs, Payments, Vendors, Staff Payments
 * Fills every day from March 1, 2025 to today with realistic data
 * Usage: node server/scripts/seed-daily-data.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const START_DATE = new Date('2025-03-01');
const END_DATE = new Date();
const BRANCH_IDS = [4, 5];
const VENDOR_NAMES = ['VendorA', 'VendorB', 'VendorC', 'VendorD'];
const STAFF_NAMES = ['Staff1', 'Staff2', 'Staff3', 'Staff4'];
const PAY_METHODS = ['Cash', 'UPI', 'Both'];

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomPick(arr) { return arr[randomInt(0, arr.length - 1)]; }
function formatDate(d) { return d.toISOString().slice(0, 10); }

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });
  const conn = await pool.getConnection();
  try {
    let day = new Date(START_DATE);
    let totalJobs = 0, totalPayments = 0, totalVendors = 0, totalStaff = 0;
    while (day <= END_DATE) {
      const dateStr = formatDate(day);
      for (const branchId of BRANCH_IDS) {
        // Jobs
        for (let j = 0; j < randomInt(2, 6); j++) {
          await conn.query(
            `INSERT IGNORE INTO sarga_jobs
              (customer_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, status, delivery_date, category, subcategory)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [null, branchId, `DAILY-${dateStr}-${j}`, `Job ${j} ${dateStr}`, 'Daily seeded job', randomInt(10, 100), randomInt(5, 20), randomInt(100, 2000), randomInt(50, 500), randomInt(50, 500), randomPick(['Paid','Unpaid','Partial']), randomPick(['Completed','Pending','Processing']), dateStr, randomPick(['Offset','Laser','Binding']), randomPick(['TypeA','TypeB','TypeC'])]
          );
          totalJobs++;
        }
        // Customer Payments
        for (let p = 0; p < randomInt(1, 3); p++) {
          await conn.query(
            `INSERT INTO sarga_customer_payments
              (customer_id, customer_name, customer_mobile, bill_amount, total_amount, net_amount, sgst_amount, cgst_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, branch_id, reference_number, description, payment_date, order_lines)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [null, `Customer${p} ${dateStr}`, '9000000000', randomInt(100, 2000), randomInt(100, 2000), randomInt(100, 2000), 0, 0, randomInt(50, 500), randomInt(50, 500), randomPick(PAY_METHODS), randomInt(50, 500), randomInt(50, 500), branchId, `REF-${dateStr}-${p}`, 'Daily seeded payment', dateStr, JSON.stringify([])]
          );
          totalPayments++;
        }
        // Vendor Payments
        for (let v = 0; v < randomInt(1, 2); v++) {
          await conn.query(
            `INSERT INTO sarga_vendor_payments
              (vendor_name, amount, payment_method, branch_id, payment_date, description)
              VALUES (?, ?, ?, ?, ?, ?)`,
            [randomPick(VENDOR_NAMES), randomInt(100, 2000), randomPick(PAY_METHODS), branchId, dateStr, 'Daily seeded vendor payment']
          );
          totalVendors++;
        }
        // Staff Payments
        for (let s = 0; s < randomInt(1, 2); s++) {
          await conn.query(
            `INSERT INTO sarga_staff_payments
              (staff_name, amount, payment_method, branch_id, payment_date, description)
              VALUES (?, ?, ?, ?, ?, ?)`,
            [randomPick(STAFF_NAMES), randomInt(100, 2000), randomPick(PAY_METHODS), branchId, dateStr, 'Daily seeded staff payment']
          );
          totalStaff++;
        }
      }
      day.setDate(day.getDate() + 1);
    }
    console.log(`Seeded: Jobs=${totalJobs}, Payments=${totalPayments}, Vendor=${totalVendors}, Staff=${totalStaff}`);
  } finally {
    conn.release();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

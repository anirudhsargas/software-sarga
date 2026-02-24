/**
 * One-time migration script for Sarga DB schema changes.
 * 
 * Run this when deploying a new version:
 *   node scripts/migrate.js
 *
 * Each migration block is wrapped in try/catch with ER_DUP_FIELDNAME /
 * ER_DUP_KEYNAME guards so it's safe to re-run.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sarga_db',
  waitForConnections: true,
  connectionLimit: 5
});

const ignoreDup = (err) => {
  if (
    err.code === 'ER_DUP_FIELDNAME' ||
    err.code === 'ER_DUP_KEYNAME' ||
    err.code === 'ER_FK_DUP_NAME'
  ) return;
  throw err;
};

async function migrate() {
  const conn = await pool.getConnection();
  console.log('Running migrations...');

  try {
    // --- sarga_customers ---
    try {
      await conn.query("ALTER TABLE sarga_customers ADD COLUMN branch_id INT");
      await conn.query("ALTER TABLE sarga_customers ADD FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL");
    } catch (e) { ignoreDup(e); }

    try {
      await conn.query("ALTER TABLE sarga_customers ADD COLUMN gst VARCHAR(20)");
    } catch (e) { ignoreDup(e); }

    // --- sarga_product_categories ---
    try {
      await conn.query("ALTER TABLE sarga_product_categories ADD COLUMN position INT NOT NULL DEFAULT 0");
      await conn.query("UPDATE sarga_product_categories SET position = id WHERE position = 0");
    } catch (e) { ignoreDup(e); }

    // --- sarga_product_subcategories ---
    try {
      await conn.query("ALTER TABLE sarga_product_subcategories ADD COLUMN position INT NOT NULL DEFAULT 0");
      await conn.query("UPDATE sarga_product_subcategories SET position = id WHERE position = 0");
    } catch (e) { ignoreDup(e); }

    // --- sarga_products ---
    try {
      await conn.query("ALTER TABLE sarga_products MODIFY COLUMN calculation_type ENUM('Normal','Slab','Range') DEFAULT 'Normal'");
    } catch (e) { /* safe */ }

    try { await conn.query("ALTER TABLE sarga_products ADD COLUMN product_code VARCHAR(80)"); } catch (e) { ignoreDup(e); }
    try { await conn.query("ALTER TABLE sarga_products ADD COLUMN image_url VARCHAR(255)"); } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_products ADD COLUMN has_paper_rate TINYINT(1) DEFAULT 0");
      await conn.query("ALTER TABLE sarga_products ADD COLUMN paper_rate DECIMAL(10, 2) DEFAULT 0");
    } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_products ADD COLUMN has_double_side_rate TINYINT(1) DEFAULT 0");
    } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_products ADD COLUMN position INT NOT NULL DEFAULT 0");
      await conn.query("UPDATE sarga_products SET position = id WHERE position = 0");
    } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_products ADD COLUMN inventory_item_id INT DEFAULT NULL");
      await conn.query("ALTER TABLE sarga_products ADD FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE SET NULL");
    } catch (e) { ignoreDup(e); }

    // --- sarga_product_slabs ---
    try { await conn.query("ALTER TABLE sarga_product_slabs ADD COLUMN max_qty DECIMAL(10,2)"); } catch (e) { ignoreDup(e); }
    try { await conn.query("ALTER TABLE sarga_product_slabs ADD COLUMN offset_unit_rate DECIMAL(10,2) DEFAULT 0"); } catch (e) { ignoreDup(e); }
    try { await conn.query("ALTER TABLE sarga_product_slabs ADD COLUMN double_side_unit_rate DECIMAL(10,2) DEFAULT 0"); } catch (e) { ignoreDup(e); }

    // --- sarga_vendors ---
    try { await conn.query("ALTER TABLE sarga_vendors ADD COLUMN order_link TEXT"); } catch (e) { ignoreDup(e); }
    try { await conn.query("ALTER TABLE sarga_vendors ADD COLUMN gstin VARCHAR(20)"); } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_vendors ADD COLUMN type ENUM('Vendor','Utility','Salary','Rent','Other') NOT NULL DEFAULT 'Vendor' AFTER name");
    } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_vendors ADD COLUMN branch_id INT DEFAULT NULL");
      await conn.query("ALTER TABLE sarga_vendors ADD FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL");
    } catch (e) { ignoreDup(e); }

    // --- sarga_payments ---
    try {
      await conn.query("ALTER TABLE sarga_payments MODIFY COLUMN payment_method ENUM('Cash','UPI','Both','Cheque','Account Transfer','Bank Transfer') DEFAULT 'Cash'");
    } catch (e) { /* safe */ }
    try {
      await conn.query("ALTER TABLE sarga_payments ADD COLUMN vendor_id INT DEFAULT NULL");
      await conn.query("ALTER TABLE sarga_payments ADD FOREIGN KEY (vendor_id) REFERENCES sarga_vendors(id) ON DELETE SET NULL");
    } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_payments ADD COLUMN period_start DATE DEFAULT NULL");
      await conn.query("ALTER TABLE sarga_payments ADD COLUMN period_end DATE DEFAULT NULL");
    } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_payments ADD COLUMN staff_id INT DEFAULT NULL");
      await conn.query("ALTER TABLE sarga_payments ADD FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL");
    } catch (e) { ignoreDup(e); }
    try {
      await conn.query("ALTER TABLE sarga_payments MODIFY COLUMN payment_method VARCHAR(100) DEFAULT 'Cash'");
    } catch (e) { /* safe */ }
    try {
      await conn.query("ALTER TABLE sarga_payments MODIFY COLUMN payment_date DATETIME NOT NULL");
    } catch (e) { /* safe */ }
    try { await conn.query("ALTER TABLE sarga_payments ADD COLUMN cash_amount DECIMAL(12, 2) DEFAULT 0"); } catch (e) { ignoreDup(e); }
    try { await conn.query("ALTER TABLE sarga_payments ADD COLUMN upi_amount DECIMAL(12, 2) DEFAULT 0"); } catch (e) { ignoreDup(e); }

    // --- sarga_customer_payments ---
    try {
      await conn.query("ALTER TABLE sarga_customer_payments ADD COLUMN branch_id INT");
      await conn.query("ALTER TABLE sarga_customer_payments ADD FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL");
    } catch (e) { ignoreDup(e); }
    try { await conn.query("ALTER TABLE sarga_customer_payments ADD COLUMN cash_amount DECIMAL(12, 2) DEFAULT 0"); } catch (e) { ignoreDup(e); }
    try { await conn.query("ALTER TABLE sarga_customer_payments ADD COLUMN upi_amount DECIMAL(12, 2) DEFAULT 0"); } catch (e) { ignoreDup(e); }

    // --- sarga_jobs ---
    try {
      await conn.query("ALTER TABLE sarga_jobs ADD COLUMN branch_id INT");
      await conn.query("ALTER TABLE sarga_jobs ADD FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL");
    } catch (e) { ignoreDup(e); }

    try {
      const [fkRows] = await conn.query(
        `SELECT CONSTRAINT_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'sarga_jobs'
           AND COLUMN_NAME = 'customer_id'
           AND REFERENCED_TABLE_NAME = 'sarga_customers'`
      );
      if (fkRows.length > 0) {
        await conn.query(`ALTER TABLE sarga_jobs DROP FOREIGN KEY ${fkRows[0].CONSTRAINT_NAME}`);
      }
      await conn.query("ALTER TABLE sarga_jobs MODIFY COLUMN customer_id INT NULL");
      await conn.query("ALTER TABLE sarga_jobs ADD FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL");
    } catch (e) { /* safe */ }

    console.log('All migrations applied successfully.');
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

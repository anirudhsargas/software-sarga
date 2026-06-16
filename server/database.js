const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const loadSchemaFiles = async (connection) => {
  const schemaDir = path.join(__dirname, 'schemas');
  if (!fs.existsSync(schemaDir)) return;
  const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      try {
        await connection.query(stmt);
      } catch (e) {
        if (e.code !== 'ER_TABLE_EXISTS_ERROR' && e.code !== 'ER_DUP_KEYNAME') throw e;
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
  // Enable SSL when DB_SSL=true or DB_SSL_MODE=REQUIRED (required for Aiven and most cloud MySQL providers)
  ...((process.env.DB_SSL === 'true' || process.env.DB_SSL_MODE === 'REQUIRED') && {
    ssl: fs.existsSync(path.join(__dirname, 'aiven-ca.pem'))
      ? { ca: fs.readFileSync(path.join(__dirname, 'aiven-ca.pem')), rejectUnauthorized: true }
      : {},
  }),
});

const initDb = async () => {
  const connection = await pool.getConnection();
  const safeIndex = async (name, sql) => {
    try { await connection.query(sql); }
    catch (e) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }
  };

  try {
    // Load table schemas from server/schemas/*.sql (source of truth for CREATE TABLE)
    await loadSchemaFiles(connection);
    // Branch Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        address TEXT,
        phone VARCHAR(20),
        email VARCHAR(100),
        smtp_user VARCHAR(100),
        smtp_pass VARCHAR(100),
        upi_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add columns if upgrading existing DB

      // Vendor Payments Table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS sarga_vendor_payments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          vendor_name VARCHAR(150) NOT NULL,
          amount DECIMAL(12,2) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          branch_id INT,
          payment_date DATE NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
        )
      `);

      // Staff Payments Table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS sarga_staff_payments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          staff_name VARCHAR(150) NOT NULL,
          amount DECIMAL(12,2) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          branch_id INT,
          payment_date DATE NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
        )
      `);
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN email VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN smtp_user VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN smtp_pass VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN upi_id VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN short_name VARCHAR(10) DEFAULT NULL'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Seed internal short names for existing branches if not set
    await connection.query("UPDATE sarga_branches SET short_name = 'PBA' WHERE name LIKE '%erambra%' AND short_name IS NULL");
    await connection.query("UPDATE sarga_branches SET short_name = 'MPR' WHERE name LIKE '%eppayur%' AND short_name IS NULL");

    // Daily Job Sequence Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_job_seq (
        branch_id INT,
        seq_date DATE,
        last_seq INT DEFAULT 0,
        PRIMARY KEY (branch_id, seq_date)
      )
    `);

    // Staff Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        branch_id INT,
        image_url LONGTEXT,
        salary_type ENUM('Monthly', 'Daily') DEFAULT 'Monthly',
        base_salary DECIMAL(12, 2) DEFAULT 0,
        daily_rate DECIMAL(12, 2) DEFAULT 0,
        is_first_login TINYINT(1) DEFAULT 1,
        settings JSON DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
      )
    `);

    // Add is_active column and update image_url to LONGTEXT for base64 support
    try { await connection.query("ALTER TABLE sarga_staff ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query("ALTER TABLE sarga_staff ADD COLUMN settings JSON DEFAULT NULL"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query("ALTER TABLE sarga_staff MODIFY COLUMN image_url LONGTEXT"); } catch (e) { console.error('Error migrating staff image_url:', e.message); }

    // Inter-Branch Stock Requests Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_stock_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inventory_item_id INT NOT NULL,
        from_branch_id INT NOT NULL,
        to_branch_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'Pending',
        created_by INT NOT NULL,
        resolved_by INT DEFAULT NULL,
        resolved_at TIMESTAMP NULL,
        sent_by INT DEFAULT NULL,
        sent_at TIMESTAMP NULL,
        received_by INT DEFAULT NULL,
        received_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (from_branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (to_branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);
    // Migrate status column from ENUM to VARCHAR if needed
    try { await connection.query("ALTER TABLE sarga_stock_requests MODIFY COLUMN status VARCHAR(20) DEFAULT 'Pending'"); } catch(e) { /* ignore */ }
    // Add extra tracking columns
    try { await connection.query('ALTER TABLE sarga_stock_requests ADD COLUMN sent_by INT DEFAULT NULL'); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_stock_requests ADD COLUMN sent_at TIMESTAMP NULL'); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_stock_requests ADD COLUMN received_by INT DEFAULT NULL'); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_stock_requests ADD COLUMN received_at TIMESTAMP NULL'); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Per-Branch Stock Tracking Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_branch_stock (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inventory_item_id INT NOT NULL,
        branch_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_item_branch (inventory_item_id, branch_id),
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
      )
    `);

    // User ID Change Requests Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_id_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id_internal INT NOT NULL,
        old_user_id VARCHAR(50) NOT NULL,
        new_user_id VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL,
        FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);

    // Audit Logs Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id_internal INT,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Inventory Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        sku VARCHAR(80) UNIQUE,
        category VARCHAR(80),
        unit VARCHAR(30) DEFAULT 'pcs',
        quantity INT DEFAULT 0,
        reorder_level INT DEFAULT 0,
        cost_price DECIMAL(10, 2) DEFAULT 0,
        sell_price DECIMAL(10, 2) DEFAULT 0,
        hsn VARCHAR(20),
        discount DECIMAL(5, 2) DEFAULT 0,
        gst_rate DECIMAL(5, 2) DEFAULT 0,
        source_code VARCHAR(3),
        model_name VARCHAR(100),
        size_code VARCHAR(10),
        item_type ENUM('Retail', 'Consumable') DEFAULT 'Retail',
        vendor_name VARCHAR(255),
        vendor_contact VARCHAR(255),
        purchase_link TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add columns if upgrading existing DB
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN source_code VARCHAR(3)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN model_name VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN size_code VARCHAR(10)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query("ALTER TABLE sarga_inventory ADD COLUMN item_type ENUM('Retail', 'Consumable') DEFAULT 'Retail'"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN vendor_name VARCHAR(255)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN vendor_contact VARCHAR(255)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN purchase_link TEXT'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Paper Inventory Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_paper_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        paper_name VARCHAR(255) NOT NULL,
        size VARCHAR(50),
        gsm INT,
        ream_count INT DEFAULT 0,
        sheets_per_ream INT DEFAULT 500,
        total_sheets INT DEFAULT 0,
        reorder_level_reams INT DEFAULT 0,
        supplier_name VARCHAR(255),
        purchase_price_per_ream DECIMAL(10, 2) DEFAULT 0,
        branch ENUM('Perambra', 'Meppayur') NOT NULL,
        notes TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Paper Stock Adjustments Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_paper_adjustments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        paper_id INT NOT NULL,
        change_reams INT NOT NULL,
        reason VARCHAR(255),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (paper_id) REFERENCES sarga_paper_inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // --- NEW PAPER INVENTORY MODULE ---

    // Paper master (all paper types)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS paper_types (
        id INT PRIMARY KEY AUTO_INCREMENT,
        category ENUM('LASER', 'OFFSET') NOT NULL,
        size_name VARCHAR(50) NOT NULL,
        width_mm DECIMAL(8,2),
        height_mm DECIMAL(8,2),
        gsm INT,
        brand VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stock ledger (every inward/outward movement)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS paper_stock_movements (
        id INT PRIMARY KEY AUTO_INCREMENT,
        paper_type_id INT NOT NULL,
        branch_id INT NOT NULL,
        movement_type ENUM('INWARD','OUTWARD','ADJUSTMENT','TRANSFER') NOT NULL,
        quantity INT NOT NULL,
        unit ENUM('SHEETS','REAMS','PACKETS') DEFAULT 'SHEETS',
        unit_cost DECIMAL(10,2),
        total_cost DECIMAL(10,2),
        reference_type ENUM('PURCHASE','JOB','WASTE','TRANSFER','OPENING'),
        reference_id INT,
        notes TEXT,
        moved_by INT,
        moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (paper_type_id) REFERENCES paper_types(id),
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id)
      )
    `);

    // Current stock view (derived from movements)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS paper_stock_summary (
        id INT PRIMARY KEY AUTO_INCREMENT,
        paper_type_id INT NOT NULL,
        branch_id INT NOT NULL,
        current_sheets INT DEFAULT 0,
        reorder_level INT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_paper_branch (paper_type_id, branch_id),
        FOREIGN KEY (paper_type_id) REFERENCES paper_types(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
      )
    `);

    // Pre-seed paper types
    const [existingPaperTypes] = await connection.query('SELECT COUNT(*) as count FROM paper_types');
    if (existingPaperTypes[0].count === 0) {
      // Laser sizes
      await connection.query(`
        INSERT INTO paper_types (category, size_name, width_mm, height_mm) VALUES
        ('LASER', 'A4', 210, 297),
        ('LASER', 'A3', 297, 420),
        ('LASER', 'Legal', 215.9, 355.6),
        ('LASER', '12×18', 304.8, 457.2),
        ('LASER', '13×19', 330.2, 482.6)
      `);

      // Offset sizes
      await connection.query(`
        INSERT INTO paper_types (category, size_name, width_mm, height_mm, gsm) VALUES
        ('OFFSET', 'Double Demy', 886, 1118, 70),
        ('OFFSET', 'Double Demy', 886, 1118, 80),
        ('OFFSET', 'Double Demy', 886, 1118, 90),
        ('OFFSET', 'Demy', 444, 572, 70),
        ('OFFSET', 'Demy', 444, 572, 80),
        ('OFFSET', 'Crown', 386, 504, 70),
        ('OFFSET', 'Crown', 386, 504, 80),
        ('OFFSET', 'Demy Half', 572, 444, 70),
        ('OFFSET', 'Demy Half', 572, 444, 80),
        ('OFFSET', 'Full Scape', 343, 432, 70),
        ('OFFSET', 'Full Scape', 343, 432, 80)
      `);
    }

    // Alerts/Notifications Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        reference_id INT,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Consumables Inventory Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS consumables_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category ENUM('ink', 'chemical', 'plate', 'spare_part', 'other') NOT NULL DEFAULT 'other',
        unit ENUM('litre', 'kg', 'piece', 'box', 'set') NOT NULL DEFAULT 'piece',
        quantity_in_stock DECIMAL(12, 3) NOT NULL DEFAULT 0,
        reorder_level DECIMAL(12, 3) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(12, 2) DEFAULT 0,
        supplier_name VARCHAR(255),
        branch ENUM('Perambra', 'Meppayur') NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Consumables Stock Adjustments Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS consumables_inventory_adjustments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consumable_id INT NOT NULL,
        quantity_delta DECIMAL(12, 3) NOT NULL,
        reason VARCHAR(255),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Inventory Consumption Auditing
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_inventory_consumption (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inventory_item_id INT NOT NULL,
        quantity_consumed DECIMAL(10, 2) NOT NULL,
        consumed_by_user_id INT NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (consumed_by_user_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);

    // Inventory Reorders Tracking
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_inventory_reorders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inventory_item_id INT NOT NULL,
        quantity_received DECIMAL(10, 2) NOT NULL,
        cost_price DECIMAL(10, 2) NOT NULL,
        days_since_last_reorder INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
      )
    `);

    // Stock Verification Tables
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_stock_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        status ENUM('Draft', 'Completed') DEFAULT 'Draft',
        verified_by INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_month (month),
        FOREIGN KEY (verified_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_stock_verification_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        verification_id INT NOT NULL,
        inventory_item_id INT NOT NULL,
        system_quantity INT NOT NULL DEFAULT 0,
        physical_quantity INT DEFAULT NULL,
        notes VARCHAR(255) DEFAULT NULL,
        UNIQUE KEY idx_ver_item (verification_id, inventory_item_id),
        FOREIGN KEY (verification_id) REFERENCES sarga_stock_verifications(id) ON DELETE CASCADE,
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
      )
    `);

    // Purchase Orders (AI Stock Planning)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_purchase_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        status ENUM('pending', 'approved', 'ordered', 'received', 'cancelled') DEFAULT 'pending',
        total_estimated_cost DECIMAL(12, 2) DEFAULT 0,
        created_by INT DEFAULT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_purchase_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        purchase_order_id INT NOT NULL,
        inventory_item_id INT NOT NULL,
        suggested_qty DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(30) DEFAULT 'pcs',
        estimated_cost DECIMAL(10, 2) DEFAULT 0,
        vendor_name VARCHAR(255),
        urgency ENUM('immediate', 'this_week') DEFAULT 'this_week',
        FOREIGN KEY (purchase_order_id) REFERENCES sarga_purchase_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
      )
    `);


    // Customers Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mobile VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        type ENUM('Walk-in', 'Retail', 'Offset') NOT NULL DEFAULT 'Walk-in',
        email VARCHAR(100),
        gst VARCHAR(20),
        address TEXT,
        branch_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Customer Change Requests Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_customer_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_id INT NOT NULL,
        customer_id INT NOT NULL,
        action ENUM('EDIT', 'DELETE') NOT NULL,
        payload JSON,
        note TEXT,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL,
        FOREIGN KEY (requester_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE
      )
    `);

    // Discount Approval Requests
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_discount_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_id INT NOT NULL,
        discount_percent DECIMAL(5,2) NOT NULL,
        total_amount DECIMAL(12,2),
        customer_name VARCHAR(255),
        reason TEXT,
        approval_level ENUM('accountant_or_admin', 'admin_only') DEFAULT 'admin_only',
        status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
        reviewed_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL,
        FOREIGN KEY (requester_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);
    try { await connection.query("ALTER TABLE sarga_discount_requests ADD COLUMN approval_level ENUM('accountant_or_admin', 'admin_only') DEFAULT 'admin_only'"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Product Hierarchy: Categories
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_product_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        position INT NOT NULL DEFAULT 0,
        image_url LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await connection.query("ALTER TABLE sarga_product_categories ADD COLUMN image_url LONGTEXT"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query("ALTER TABLE sarga_product_categories MODIFY COLUMN image_url LONGTEXT"); } catch (e) { }
    try { await connection.query("ALTER TABLE sarga_product_categories ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Product Hierarchy: Sub-categories
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_product_subcategories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        position INT NOT NULL DEFAULT 0,
        image_url LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES sarga_product_categories(id) ON DELETE CASCADE
      )
    `);
    try { await connection.query("ALTER TABLE sarga_product_subcategories ADD COLUMN image_url LONGTEXT"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query("ALTER TABLE sarga_product_subcategories MODIFY COLUMN image_url LONGTEXT"); } catch (e) { }
    try { await connection.query("ALTER TABLE sarga_product_subcategories ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Products
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subcategory_id INT NOT NULL,
        name VARCHAR(150) NOT NULL,
        product_code VARCHAR(80),
        company_name VARCHAR(100) DEFAULT NULL,
        company_code VARCHAR(50) DEFAULT NULL,
        size VARCHAR(30) DEFAULT NULL,
        calculation_type ENUM('Normal', 'Slab', 'Range') DEFAULT 'Normal',
        description TEXT,
        image_url LONGTEXT,
        has_paper_rate TINYINT(1) DEFAULT 0,
        paper_rate DECIMAL(10, 2) DEFAULT 0,
        has_double_side_rate TINYINT(1) DEFAULT 0,
        position INT NOT NULL DEFAULT 0,
        inventory_item_id INT DEFAULT NULL,
        is_physical_product TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (subcategory_id) REFERENCES sarga_product_subcategories(id) ON DELETE CASCADE,
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE SET NULL
      )
    `);
    try { await connection.query("ALTER TABLE sarga_products MODIFY COLUMN image_url LONGTEXT"); } catch (e) { }
    // Ensure is_physical_product column exists (for existing tables)
    try {
      await connection.query(
        'ALTER TABLE sarga_products ADD COLUMN is_physical_product TINYINT(1) DEFAULT 0'
      );
    } catch (err) {
      // Column already exists, ignore
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
    // Ensure company metadata columns exist (for existing tables)
    try {
      await connection.query(
        'ALTER TABLE sarga_products ADD COLUMN company_name VARCHAR(100) DEFAULT NULL'
      );
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
    try {
      await connection.query(
        'ALTER TABLE sarga_products ADD COLUMN company_code VARCHAR(10) DEFAULT NULL'
      );
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
    try {
      await connection.query(
        'ALTER TABLE sarga_products ADD COLUMN size VARCHAR(30) DEFAULT NULL'
      );
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
    // Ensure is_active column exists (for existing tables)
    try {
      await connection.query(
        'ALTER TABLE sarga_products ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1'
      );
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    // Product Slabs (for Interpolation and SlabPlus)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_product_slabs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        min_qty DECIMAL(10,2) NOT NULL,
        max_qty DECIMAL(10,2),
        base_value DECIMAL(10,2) DEFAULT 0,
        unit_rate DECIMAL(10,2) DEFAULT 0,
        offset_unit_rate DECIMAL(10,2) DEFAULT 0,
        double_side_unit_rate DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
      )
    `);

    // Ensure has_double_side_rate column exists (for existing tables)
    try {
      await connection.query(`
        ALTER TABLE sarga_products ADD COLUMN has_double_side_rate TINYINT(1) DEFAULT 0
      `);
    } catch (err) {
      // Column already exists, ignore
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    // Ensure double_side_unit_rate column exists (for existing tables)
    try {
      await connection.query(`
        ALTER TABLE sarga_product_slabs ADD COLUMN double_side_unit_rate DECIMAL(10,2) DEFAULT 0
      `);
    } catch (err) {
      // Column already exists, ignore
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    // Product Extras Template
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_product_extras_template (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        purpose VARCHAR(150) NOT NULL,
        amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
      )
    `);

    // Product Usage Tracking (per staff)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_product_usage (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id_internal INT NOT NULL,
        entity_type ENUM('category', 'subcategory', 'product') NOT NULL,
        entity_id INT NOT NULL,
        usage_count INT NOT NULL DEFAULT 0,
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_usage (user_id_internal, entity_type, entity_id),
        FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);

    // Vendors / Payees Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_vendors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL UNIQUE,
        type ENUM('Vendor', 'Utility', 'Salary', 'Rent', 'Other') NOT NULL DEFAULT 'Vendor',
        contact_person VARCHAR(150),
        phone VARCHAR(20),
        address TEXT,
        branch_id INT DEFAULT NULL,
        order_link TEXT,
        gstin VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
      )
    `);

    // Vendor Bills Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_vendor_bills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        branch_id INT NOT NULL,
        bill_number VARCHAR(100),
        bill_date DATE NOT NULL,
        total_amount DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        INDEX idx_svb_vendor_id (vendor_id)
      )
    `);

    // Add description column to vendor_bills (for quick purchases)
    try {
      await connection.query(`ALTER TABLE sarga_vendor_bills ADD COLUMN description TEXT`);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    // Vendor Bill Items Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_vendor_bill_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_id INT NOT NULL,
        inventory_item_id INT NOT NULL,
        quantity DECIMAL(12, 2) NOT NULL,
        unit_cost DECIMAL(12, 2) NOT NULL,
        total_cost DECIMAL(12, 2) NOT NULL,
        FOREIGN KEY (bill_id) REFERENCES sarga_vendor_bills(id) ON DELETE CASCADE,
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
      )
    `);

    // Utility Bills Table (track utility bills/invoices separately from payments)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_utility_bills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        utility_type VARCHAR(150) NOT NULL,
        branch_id INT NOT NULL,
        bill_number VARCHAR(100),
        bill_date DATE NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        description TEXT,
        connection_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
      )
    `);

    // Utility Connections (store known consumer/connection numbers per branch + utility)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_utility_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        utility_type VARCHAR(150) NOT NULL,
        connection_id VARCHAR(100) NOT NULL,
        label VARCHAR(200),
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_utility_connection (branch_id, utility_type, connection_id)
      )
    `);

    // Payments Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        type ENUM('Vendor', 'Utility', 'Salary', 'Rent', 'Other') NOT NULL,
        payee_name VARCHAR(150) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        idempotency_key VARCHAR(100),
        payment_method VARCHAR(100) DEFAULT 'Cash',
        reference_number VARCHAR(100),
        description TEXT,
        payment_date DATETIME NOT NULL,
        vendor_id INT DEFAULT NULL,
        staff_id INT DEFAULT NULL,
        period_start DATE DEFAULT NULL,
        period_end DATE DEFAULT NULL,
        cash_amount DECIMAL(12, 2) DEFAULT 0,
        upi_amount DECIMAL(12, 2) DEFAULT 0,
        bill_total_amount DECIMAL(12, 2) DEFAULT 0,
        is_partial_payment TINYINT(1) DEFAULT 0,
        bill_reference_id INT DEFAULT NULL,
        payment_status ENUM('Pending', 'Partially Paid', 'Fully Paid') DEFAULT 'Fully Paid',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        INDEX idx_sp_vendor_id (vendor_id)
      )
    `);
    try { await connection.query('ALTER TABLE sarga_payments ADD COLUMN idempotency_key VARCHAR(100)'); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    await safeIndex('uniq_payments_idempotency_key', 'CREATE UNIQUE INDEX uniq_payments_idempotency_key ON sarga_payments (idempotency_key)');

    // Payment Methods Table (for custom payment methods)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_payment_methods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default payment methods
    const defaultMethods = ['Cash', 'UPI', 'Both', 'Cheque', 'Account Transfer', 'Bank Transfer'];
    for (const method of defaultMethods) {
      try {
        await connection.query(
          "INSERT IGNORE INTO sarga_payment_methods (name, is_active) VALUES (?, 1)",
          [method]
        );
      } catch (err) {
        // Ignore duplicates
      }
    }

    // Rent Locations (master setup)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_rent_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        property_name VARCHAR(150) NOT NULL,
        location VARCHAR(200),
        owner_name VARCHAR(150),
        owner_mobile VARCHAR(20),
        monthly_rent DECIMAL(12, 2) DEFAULT 0,
        due_day INT DEFAULT 1,
        advance_deposit DECIMAL(12, 2) DEFAULT 0,
        branch_id INT DEFAULT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
      )
    `);

    // Vendor/Utility Add Requests (Front Office staff can request new vendors/utilities)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_vendor_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_type ENUM('Vendor', 'Utility') NOT NULL,
        name VARCHAR(150) NOT NULL,
        contact_person VARCHAR(150),
        phone VARCHAR(20),
        address TEXT,
        gstin VARCHAR(50),
        branch_id INT DEFAULT NULL,
        requested_by INT NOT NULL,
        request_reason TEXT,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        reviewed_by INT DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
        FOREIGN KEY (requested_by) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Ensure request_type supports Rent and Kuri
    try {
      await connection.query(`
        ALTER TABLE sarga_vendor_requests
        MODIFY request_type ENUM('Vendor', 'Utility', 'Rent', 'Kuri') NOT NULL
      `);
    } catch (err) {
      // Ignore if enum already updated or table missing
    }

    // Payment Frequency Tracking (for suggesting admin to add as default category)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_payment_suggestions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payee_name VARCHAR(150) NOT NULL,
        payment_category VARCHAR(100),
        occurrence_count INT DEFAULT 1,
        total_amount_paid DECIMAL(14, 2) DEFAULT 0,
        last_payment_date DATETIME,
        suggested_as_vendor TINYINT(1) DEFAULT 0,
        suggestion_dismissed TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_payee (payee_name, payment_category)
      )
    `);

    // EMI (Finance Commitments) Master Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_emi_master (
        id INT AUTO_INCREMENT PRIMARY KEY,
        emi_type ENUM('Loan', 'Vehicle', 'Machine', 'Personal', 'Business') NOT NULL,
        institution_name VARCHAR(150) NOT NULL,
        loan_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
        monthly_emi DECIMAL(12, 2) NOT NULL DEFAULT 0,
        start_date DATE NOT NULL,
        end_date DATE,
        due_day INT DEFAULT 5,
        account_number VARCHAR(100),
        branch_id INT DEFAULT NULL,
        description TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
      )
    `);

    // EMI Payment History
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_emi_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        emi_id INT NOT NULL,
        payment_date DATETIME NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        payment_method VARCHAR(100),
        reference_number VARCHAR(100),
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (emi_id) REFERENCES sarga_emi_master(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Kuri / Chit Fund Master Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_kuri_master (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kuri_name VARCHAR(150) NOT NULL,
        organizer_name VARCHAR(150),
        organizer_phone VARCHAR(20),
        total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
        monthly_installment DECIMAL(12, 2) NOT NULL DEFAULT 0,
        start_date DATE NOT NULL,
        end_date DATE,
        due_day INT DEFAULT 5,
        prize_taken TINYINT(1) DEFAULT 0,
        prize_amount DECIMAL(14, 2) DEFAULT 0,
        prize_date DATE,
        branch_id INT DEFAULT NULL,
        description TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
      )
    `);

    // Kuri Payment History (supports daily/small payments)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_kuri_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kuri_id INT NOT NULL,
        payment_date DATETIME NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        payment_method VARCHAR(100),
        reference_number VARCHAR(100),
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (kuri_id) REFERENCES sarga_kuri_master(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Staff Salary Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff_salary (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        base_salary DECIMAL(12, 2) NOT NULL DEFAULT 0,
        net_salary DECIMAL(12, 2),
        payment_month DATE NOT NULL,
        bonus DECIMAL(12, 2) DEFAULT 0,
        deduction DECIMAL(12, 2) DEFAULT 0,
        paid_date DATETIME,
        payment_method VARCHAR(100),
        reference_number VARCHAR(100),
        notes TEXT,
        status ENUM('Pending', 'Paid', 'Partial') DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);

    // Staff Salary Payments (transaction log)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff_salary_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        payment_date DATETIME NOT NULL,
        payment_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        payment_method VARCHAR(100),
        idempotency_key VARCHAR(100),
        reference_number VARCHAR(100),
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);
    try { await connection.query('ALTER TABLE sarga_staff_salary_payments ADD COLUMN idempotency_key VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    await safeIndex('uniq_staff_salary_payment_idem', 'CREATE UNIQUE INDEX uniq_staff_salary_payment_idem ON sarga_staff_salary_payments (staff_id, idempotency_key)');

    // Staff Attendance Table (for daily wage staff and tracking work days)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff_attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        attendance_date DATE NOT NULL,
        status ENUM('Present', 'Absent', 'Leave', 'Holiday') DEFAULT 'Present',
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_attendance (staff_id, attendance_date)
      )
    `);

    // Staff Leave Balance Table (track monthly leaves)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff_leave_balance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        \`year_month\` VARCHAR(7) NOT NULL,
        paid_leaves_used INT DEFAULT 0,
        unpaid_leaves_used INT DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        UNIQUE KEY unique_leave_balance (staff_id, \`year_month\`)
      )
    `);

    // Attendance Change Requests
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_attendance_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        attendance_date DATE NOT NULL,
        requested_status ENUM('Present', 'Absent', 'Half Day', 'Leave', 'Holiday') NOT NULL,
        requested_time TIME,
        requested_notes TEXT,
        requested_by VARCHAR(50) NOT NULL,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);

    // Customer Payments Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_customer_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT,
        customer_name VARCHAR(150) NOT NULL,
        customer_mobile VARCHAR(20),
        bill_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(12, 2) NOT NULL,
        net_amount DECIMAL(12, 2) DEFAULT 0,
        sgst_amount DECIMAL(12, 2) DEFAULT 0,
        cgst_amount DECIMAL(12, 2) DEFAULT 0,
        advance_paid DECIMAL(12, 2) DEFAULT 0,
        balance_amount DECIMAL(12, 2) DEFAULT 0,
        payment_method ENUM('Cash', 'UPI', 'Both', 'Cheque', 'Account Transfer') DEFAULT 'Cash',
        cash_amount DECIMAL(12, 2) DEFAULT 0,
        upi_amount DECIMAL(12, 2) DEFAULT 0,
        branch_id INT,
        reference_number VARCHAR(100),
        description TEXT,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        discount_amount DECIMAL(12,2) DEFAULT 0,
        payment_date DATE NOT NULL,
        order_lines JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL
      )
    `);

    // Jobs Table (Updated to include Product ID and Extras)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT,
        product_id INT,
        branch_id INT,
        job_number VARCHAR(20) UNIQUE,
        job_name VARCHAR(150) NOT NULL,
        description TEXT,
        quantity DECIMAL(10,2) DEFAULT 1,
        unit_price DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) DEFAULT 0,
        advance_paid DECIMAL(10,2) DEFAULT 0,
        balance_amount DECIMAL(10,2) DEFAULT 0,
        applied_extras JSON,
        category VARCHAR(100),
        subcategory VARCHAR(100),
        machine_id INT DEFAULT NULL,
        status ENUM('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production', 'Approval Pending', 'Completed', 'Delivered', 'Cancelled') DEFAULT 'Pending',
        payment_status ENUM('Unpaid', 'Partial', 'Paid') DEFAULT 'Unpaid',
        delivery_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
        FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE SET NULL
      )
    `);

    // Ensure columns exist in sarga_jobs
    const jobsCols = [
      { name: 'product_id', type: 'INT' },
      { name: 'applied_extras', type: 'JSON' },
      { name: 'category', type: 'VARCHAR(100)' },
      { name: 'subcategory', type: 'VARCHAR(100)' },
      { name: 'machine_id', type: 'INT' },
      { name: 'payment_id', type: 'INT DEFAULT NULL' },
      { name: 'waste_prints', type: 'INT NOT NULL DEFAULT 0' },
      { name: 'proof_prints', type: 'INT NOT NULL DEFAULT 0' },
      { name: 'machine_print_count', type: 'INT DEFAULT NULL' },
      { name: 'paper_cost', type: 'DECIMAL(12,2) DEFAULT 0' },
      { name: 'machine_cost', type: 'DECIMAL(12,2) DEFAULT 0' },
      { name: 'labour_cost', type: 'DECIMAL(12,2) DEFAULT 0' },
      { name: 'total_cost', type: 'DECIMAL(12,2) DEFAULT 0' },
      { name: 'profit', type: 'DECIMAL(12,2) DEFAULT 0' },
      { name: 'margin', type: 'DECIMAL(5,4) DEFAULT 0' },
      { name: 'used_sheets', type: 'INT DEFAULT 0' },
      { name: 'required_sheets', type: 'INT DEFAULT 0' }
    ];

    for (const col of jobsCols) {
      try {
        await connection.query(`ALTER TABLE sarga_jobs ADD COLUMN ${col.name} ${col.type}`);
      } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    }

    // Ensure foreign key for machine_id in sarga_jobs
    try {
      await connection.query(`
        ALTER TABLE sarga_jobs 
        ADD CONSTRAINT fk_jobs_machine 
        FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE SET NULL
      `);
    } catch (err) { }

    // ─── Job Matter Images (attached at billing time, no customer required) ──
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_job_matter (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        file_url LONGTEXT NOT NULL,
        original_name VARCHAR(300),
        file_size INT DEFAULT 0,
        notes TEXT,
        uploaded_by INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Ensure columns exist in sarga_customer_payments
    const payCols = [
      { name: 'bill_amount', type: 'DECIMAL(12, 2) NOT NULL DEFAULT 0' },
      { name: 'net_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'sgst_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'cgst_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'cash_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'upi_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'cheque_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'account_transfer_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'order_lines', type: 'JSON' },
      { name: 'branch_id', type: 'INT' },
      { name: 'discount_percent', type: 'DECIMAL(5,2) DEFAULT 0' },
      { name: 'discount_amount', type: 'DECIMAL(12,2) DEFAULT 0' },
      { name: 'verification_status', type: "ENUM('Pending','Verified','Rejected','Not in Statement') DEFAULT 'Pending'" },
      { name: 'verified_by', type: 'INT' },
      { name: 'verified_at', type: 'TIMESTAMP NULL' },
      { name: 'verification_note', type: 'TEXT' }
    ];

    for (const col of payCols) {
      try {
        await connection.query(`ALTER TABLE sarga_customer_payments ADD COLUMN ${col.name} ${col.type}`);
      } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    }
    try { await connection.query('ALTER TABLE sarga_customer_payments ADD COLUMN idempotency_key VARCHAR(100)'); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    await safeIndex('uniq_customer_payments_idempotency_key', 'CREATE UNIQUE INDEX uniq_customer_payments_idempotency_key ON sarga_customer_payments (idempotency_key)');

    // Ensure verification_status ENUM includes 'Not in Statement'
    try {
      await connection.query(`ALTER TABLE sarga_customer_payments MODIFY COLUMN verification_status ENUM('Pending','Verified','Rejected','Not in Statement') DEFAULT 'Pending'`);
    } catch (err) { /* ignore if already correct */ }

    // Add coupon_code column to customer_payments
    try { await connection.query("ALTER TABLE sarga_customer_payments ADD COLUMN coupon_code VARCHAR(50) DEFAULT NULL"); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

    // Add book_type column to customer_payments (Offset = default, Laser for laser/photocopy bills)
    try { await connection.query("ALTER TABLE sarga_customer_payments ADD COLUMN book_type VARCHAR(20) DEFAULT 'Offset'"); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

    // ── Internal billing columns ──
    // customer_type on sarga_customers: 'customer' (default) or 'internal'
    try { await connection.query("ALTER TABLE sarga_customers ADD COLUMN client_type VARCHAR(20) DEFAULT 'customer'"); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    // internal_branch stores which department an internal client belongs to
    try { await connection.query("ALTER TABLE sarga_customers ADD COLUMN internal_branch VARCHAR(50) DEFAULT NULL"); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

    // Pre-seed internal clients (if not already present)
    const internalClients = [
      { name: 'Sarga Offset',  branch: 'offset' },
      { name: 'Sarga Digital', branch: 'digital' },
      { name: 'Sarga Admin',   branch: 'admin' }
    ];
    for (const ic of internalClients) {
      const [existing] = await connection.query(
        "SELECT id FROM sarga_customers WHERE client_type = 'internal' AND internal_branch = ?", [ic.branch]
      );
      if (existing.length === 0) {
        // Use a deterministic fake mobile so UNIQUE constraint is satisfied
        const fakeMobile = `99999${ic.branch.padEnd(5, '0').slice(0, 5)}`;
        try {
          await connection.query(
            "INSERT INTO sarga_customers (mobile, name, type, client_type, internal_branch, branch_id) VALUES (?, ?, 'Walk-in', 'internal', ?, NULL)",
            [fakeMobile, ic.name, ic.branch]
          );
        } catch (err) { if (err.code !== 'ER_DUP_ENTRY') throw err; }
      }
    }

    // is_internal + internal_department columns on sarga_customer_payments
    try { await connection.query("ALTER TABLE sarga_customer_payments ADD COLUMN is_internal TINYINT(1) DEFAULT 0"); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    try { await connection.query("ALTER TABLE sarga_customer_payments ADD COLUMN internal_department VARCHAR(50) DEFAULT NULL"); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

    // Coupons Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        discount_type ENUM('percent', 'amount') DEFAULT 'percent',
        discount_value DECIMAL(10,2) NOT NULL,
        usage_type ENUM('one_time', 'limited', 'unlimited') DEFAULT 'unlimited',
        max_uses INT DEFAULT NULL,
        used_count INT DEFAULT 0,
        min_order_amount DECIMAL(12,2) DEFAULT 0,
        expiry_date DATE DEFAULT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Customer Refunds Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_refunds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        customer_id INT,
        idempotency_key VARCHAR(100),
        refund_amount DECIMAL(12,2) NOT NULL,
        refund_method ENUM('Cash','UPI','Cheque','Account Transfer') DEFAULT 'Cash',
        reason TEXT,
        processed_by INT,
        branch_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE
      )
    `);
    try { await connection.query('ALTER TABLE sarga_refunds ADD COLUMN idempotency_key VARCHAR(100)'); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    await safeIndex('uniq_refunds_idempotency_key', 'CREATE UNIQUE INDEX uniq_refunds_idempotency_key ON sarga_refunds (idempotency_key)');

    // Job Staff Assignment Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_job_staff_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        staff_id INT NOT NULL,
        role VARCHAR(50),
        assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_date DATETIME,
        status ENUM('Pending', 'In Progress', 'Completed') DEFAULT 'Pending',
        FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);

    // Office & Admin Expenses Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_office_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        expense_type ENUM('Stationery', 'Office Supplies', 'Furniture', 'Equipment', 'Software', 'Internet', 'Phone', 'Maintenance', 'Other') NOT NULL,
        vendor_name VARCHAR(150),
        amount DECIMAL(12, 2) NOT NULL,
        payment_method VARCHAR(100) DEFAULT 'Cash',
        reference_number VARCHAR(100),
        description TEXT,
        expense_date DATE NOT NULL,
        bill_number VARCHAR(100),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Transport & Delivery Expenses Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_transport_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        transport_type ENUM('Delivery', 'Fuel', 'Vehicle Maintenance', 'Vehicle Rent', 'Driver Charges', 'Toll', 'Parking', 'Other') NOT NULL,
        vehicle_number VARCHAR(50),
        driver_name VARCHAR(100),
        amount DECIMAL(12, 2) NOT NULL,
        payment_method VARCHAR(100) DEFAULT 'Cash',
        reference_number VARCHAR(100),
        description TEXT,
        expense_date DATE NOT NULL,
        bill_number VARCHAR(100),
        from_location VARCHAR(200),
        to_location VARCHAR(200),
        distance_km DECIMAL(8, 2),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Miscellaneous Expenses Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_misc_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        expense_category VARCHAR(150) NOT NULL,
        vendor_name VARCHAR(150),
        amount DECIMAL(12, 2) NOT NULL,
        payment_method VARCHAR(100) DEFAULT 'Cash',
        reference_number VARCHAR(100),
        description TEXT,
        expense_date DATE NOT NULL,
        bill_number VARCHAR(100),
        is_recurring TINYINT(1) DEFAULT 0,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Petty Cash Management Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_petty_cash (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type ENUM('Opening', 'Cash In', 'Cash Out') NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        description TEXT,
        reference_number VARCHAR(100),
        balance_after DECIMAL(12, 2) NOT NULL DEFAULT 0,
        received_from VARCHAR(150),
        paid_to VARCHAR(150),
        category VARCHAR(100),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Bills & Documents Storage Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_bills_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        document_type ENUM('Vendor Bill', 'Utility Bill', 'Rent Receipt', 'EMI Receipt', 'Kuri Receipt', 'Transport Bill', 'Office Bill', 'Petty Cash Receipt', 'Other') NOT NULL,
        related_tab VARCHAR(50),
        related_id INT,
        vendor_name VARCHAR(150),
        bill_number VARCHAR(100),
        bill_date DATE NOT NULL,
        amount DECIMAL(12, 2),
        file_path VARCHAR(500),
        file_name VARCHAR(255),
        file_type VARCHAR(50),
        file_size_kb INT,
        description TEXT,
        uploaded_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        INDEX idx_document_type (document_type),
        INDEX idx_vendor_name (vendor_name),
        INDEX idx_bill_date (bill_date),
        INDEX idx_related (related_tab, related_id)
      )
    `);

    // ==================== AI FEATURES ====================
    console.log("Setting up AI Features tables...");

    // Staff Activity Log (detailed activity tracking for anomaly detection)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff_activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        device_info VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        INDEX idx_activity_staff (staff_id),
        INDEX idx_activity_type (action_type),
        INDEX idx_activity_time (created_at)
      )
    `);

    // Fraud Alerts (flagged anomalies)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_fraud_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        alert_type VARCHAR(100) NOT NULL,
        severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
        message TEXT,
        details JSON,
        status ENUM('ACTIVE', 'RESOLVED', 'DISMISSED') DEFAULT 'ACTIVE',
        resolved_by INT,
        resolved_at DATETIME,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        INDEX idx_fraud_status (status),
        INDEX idx_fraud_severity (severity),
        INDEX idx_fraud_staff (staff_id),
        INDEX idx_fraud_time (created_at)
      )
    `);

    // Design Pre-flight Checks
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_design_checks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500),
        file_type VARCHAR(50),
        file_size_kb INT,
        result_json JSON,
        passed TINYINT(1) DEFAULT 0,
        total_issues INT DEFAULT 0,
        critical_issues INT DEFAULT 0,
        warnings INT DEFAULT 0,
        checked_by INT,
        job_id INT DEFAULT NULL,
        proof_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (checked_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        INDEX idx_design_time (created_at),
        INDEX idx_design_job (job_id)
      )
    `);

    // Add job_id and proof_id to design_checks if missing (migration)
    try {
      await connection.query(`ALTER TABLE sarga_design_checks ADD COLUMN job_id INT DEFAULT NULL AFTER checked_by`);
      await connection.query(`ALTER TABLE sarga_design_checks ADD COLUMN proof_id INT DEFAULT NULL AFTER job_id`);
      await connection.query(`ALTER TABLE sarga_design_checks ADD INDEX idx_design_job (job_id)`);
    } catch (e) { /* columns already exist */ }

    // Seed Default Branch
    const [branches] = await connection.query("SELECT * FROM sarga_branches LIMIT 1");
    let defaultBranchId = null;
    if (branches.length === 0) {
      const [res] = await connection.query("INSERT INTO sarga_branches (name, address) VALUES (?, ?)", ['Main Branch', 'Default Address']);
      defaultBranchId = res.insertId;
      console.log("Default branch seeded.");
    } else {
      defaultBranchId = branches[0].id;
    }

    // Assign existing data to default branch
    if (defaultBranchId) {
      await connection.query("UPDATE sarga_staff SET branch_id = ? WHERE branch_id IS NULL", [defaultBranchId]);
      await connection.query("UPDATE sarga_jobs SET branch_id = ? WHERE branch_id IS NULL", [defaultBranchId]);
      await connection.query("UPDATE sarga_customers SET branch_id = ? WHERE branch_id IS NULL", [defaultBranchId]);
      await connection.query("UPDATE sarga_customer_payments SET branch_id = ? WHERE branch_id IS NULL", [defaultBranchId]);
    }

    // ==================== THREE BOOKS SYSTEM ====================
    console.log("Setting up Three Books System tables...");

    // Machine Master Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_machines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_name VARCHAR(150) NOT NULL,
        machine_type ENUM('Offset', 'Digital', 'Binding', 'Lamination', 'Cutting', 'Other') NOT NULL,
        counter_type ENUM('Manual', 'Automatic') DEFAULT 'Manual',
        branch_id INT NOT NULL,
        location VARCHAR(200),
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
      )
    `);

    // Add book_type to machines (Offset/Laser/Other) if missing
    try {
      await connection.query("ALTER TABLE sarga_machines ADD COLUMN book_type ENUM('Offset','Laser','Other') DEFAULT NULL");
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

    // Machine Daily Readings Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_machine_readings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_id INT NOT NULL,
        reading_date DATE NOT NULL,
        opening_count INT NOT NULL DEFAULT 0,
        closing_count INT DEFAULT NULL,
        total_copies INT DEFAULT 0,
        notes TEXT,
        created_by INT,
        updated_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_machine_date (machine_id, reading_date)
      )
    `);

    // Machine Counter Mismatch Requests
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_machine_count_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_id INT NOT NULL,
        reading_date DATE NOT NULL,
        expected_count INT DEFAULT NULL,
        entered_count INT NOT NULL,
        submitted_by INT,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        admin_note TEXT,
        reviewed_by INT,
        reviewed_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
        FOREIGN KEY (submitted_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Daily Report Master (Offset Book)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_daily_report_offset (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_date DATE NOT NULL,
        branch_id INT NOT NULL,
        opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
        closing_balance DECIMAL(12, 2) DEFAULT 0,
        total_collected DECIMAL(12, 2) DEFAULT 0,
        total_expenses DECIMAL(12, 2) DEFAULT 0,
        total_credit_out DECIMAL(12, 2) DEFAULT 0,
        total_credit_in DECIMAL(12, 2) DEFAULT 0,
        status ENUM('Draft', 'Finalized') DEFAULT 'Draft',
        created_by INT,
        finalized_by INT,
        finalized_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        FOREIGN KEY (finalized_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_branch_date (branch_id, report_date)
      )
    `);

    // Work Entries in Daily Report
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_daily_work_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT NOT NULL,
        work_name VARCHAR(200) NOT NULL,
        work_details TEXT,
        payment_type ENUM('Cash', 'UPI', 'Both', 'Credit') NOT NULL,
        cash_amount DECIMAL(12, 2) DEFAULT 0,
        upi_amount DECIMAL(12, 2) DEFAULT 0,
        amount_collected DECIMAL(12, 2) NOT NULL,
        remarks TEXT,
        entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
      )
    `);

    // Daily Expenses (linked to report)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_daily_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT NOT NULL,
        expense_description VARCHAR(200) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        payment_method ENUM('Cash', 'UPI', 'Both') DEFAULT 'Cash',
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
      )
    `);

    // Credit Transactions (linked to report)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_daily_credit_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT DEFAULT NULL,
        book_type ENUM('Offset', 'Laser', 'Other') DEFAULT 'Offset',
        branch_id INT DEFAULT NULL,
        report_date DATE DEFAULT NULL,
        transaction_type ENUM('Credit Out', 'Credit In') NOT NULL,
        customer_name VARCHAR(150) NOT NULL,
        customer_phone VARCHAR(20),
        amount DECIMAL(12, 2) NOT NULL,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
      )
    `);
    try { await connection.query("ALTER TABLE sarga_daily_credit_transactions MODIFY COLUMN report_id INT DEFAULT NULL"); } catch (err) { }
    try { await connection.query("ALTER TABLE sarga_daily_credit_transactions ADD COLUMN book_type ENUM('Offset', 'Laser', 'Other') DEFAULT 'Offset'"); } catch (err) { }
    try { await connection.query("ALTER TABLE sarga_daily_credit_transactions ADD COLUMN branch_id INT DEFAULT NULL"); } catch (err) { }
    try { await connection.query("ALTER TABLE sarga_daily_credit_transactions ADD COLUMN report_date DATE DEFAULT NULL"); } catch (err) { }
    try { await connection.query("ALTER TABLE sarga_daily_credit_transactions ADD CONSTRAINT fk_credit_branch FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE"); } catch (err) { }


    // Machine Staff Assignments (many-to-many)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_machine_staff_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_id INT NOT NULL,
        staff_id INT NOT NULL,
        assigned_by INT,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        assignment_opening_count BIGINT NOT NULL DEFAULT 0,
        FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_machine_staff (machine_id, staff_id)
      )
    `);

    try {
      await connection.query(`ALTER TABLE sarga_machine_staff_assignments ADD COLUMN assignment_opening_count BIGINT NOT NULL DEFAULT 0`);
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }


    // Daily Machine Report Master
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_daily_report_machine (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_date DATE NOT NULL,
        machine_id INT NOT NULL,
        branch_id INT NOT NULL,
        book_type ENUM('Offset','Laser','Other') DEFAULT NULL,
        opening_count INT NOT NULL DEFAULT 0,
        closing_count INT DEFAULT NULL,
        total_copies INT DEFAULT 0,
        total_amount DECIMAL(12, 2) DEFAULT 0,
        total_cash DECIMAL(12, 2) DEFAULT 0,
        total_credit DECIMAL(12, 2) DEFAULT 0,
        credit_cash_in DECIMAL(12, 2) DEFAULT 0,
        credit_cash_out DECIMAL(12, 2) DEFAULT 0,
        status ENUM('Draft', 'Finalized') DEFAULT 'Draft',
        created_by INT,
        finalized_by INT,
        finalized_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        FOREIGN KEY (finalized_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_machine_date (machine_id, report_date)
      )
    `);

    // Ensure daily_report_machine has book_type column (upgrade-safe)
    try {
      await connection.query("ALTER TABLE sarga_daily_report_machine ADD COLUMN book_type ENUM('Offset','Laser','Other') DEFAULT NULL");
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

    // Machine Work Entries
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_machine_work_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT NOT NULL,
        customer_name VARCHAR(150) NOT NULL,
        work_details TEXT NOT NULL,
        copies INT NOT NULL,
        payment_type ENUM('Cash', 'UPI', 'Credit') NOT NULL,
        cash_amount DECIMAL(12, 2) DEFAULT 0,
        upi_amount DECIMAL(12, 2) DEFAULT 0,
        credit_amount DECIMAL(12, 2) DEFAULT 0,
        total_amount DECIMAL(12, 2) NOT NULL,
        remarks TEXT,
        entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES sarga_daily_report_machine(id) ON DELETE CASCADE
      )
    `);

    // Machine Credit Movements
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_machine_credit_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT NOT NULL,
        movement_type ENUM('Cash In', 'Cash Out') NOT NULL,
        customer_name VARCHAR(150) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES sarga_daily_report_machine(id) ON DELETE CASCADE
      )
    `);

    // Internal transfers between books (Offset / Laser / Other)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_internal_transfers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        from_book_type ENUM('Offset','Laser','Other') NOT NULL,
        to_book_type ENUM('Offset','Laser','Other') NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        note TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);
    try { await connection.query("CREATE INDEX idx_internal_transfers_branch_date ON sarga_internal_transfers (branch_id, created_at)"); } catch (e) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }

    // Credit Customer Master
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_credit_customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT,
        customer_name VARCHAR(150) NOT NULL,
        customer_phone VARCHAR(20),
        credit_limit DECIMAL(12, 2) DEFAULT 0,
        current_balance DECIMAL(12, 2) DEFAULT 0,
        branch_id INT NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
      )
    `);

    // Credit Ledger
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_credit_ledger (
        id INT AUTO_INCREMENT PRIMARY KEY,
        credit_customer_id INT NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type ENUM('Credit Given', 'Payment Received', 'Adjustment') NOT NULL,
        debit_amount DECIMAL(12, 2) DEFAULT 0,
        credit_amount DECIMAL(12, 2) DEFAULT 0,
        balance_after DECIMAL(12, 2) NOT NULL,
        reference_type VARCHAR(50),
        reference_id INT,
        description TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (credit_customer_id) REFERENCES sarga_credit_customers(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        INDEX idx_customer_date (credit_customer_id, transaction_date)
      )
    `);

    // Daily Report Opening Balances (per book type per day)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_daily_opening_balances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_date DATE NOT NULL,
        branch_id INT NOT NULL,
        book_type ENUM('Offset', 'Laser', 'Other') NOT NULL,
        cash_opening DECIMAL(12, 2) DEFAULT 0,
        entered_by INT,
        is_locked TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (entered_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_branch_date_book (branch_id, report_date, book_type)
      )
    `);

    // Add is_locked column if not exists (for existing installations)
    try {
      await connection.query(`ALTER TABLE sarga_daily_opening_balances ADD COLUMN is_locked TINYINT(1) DEFAULT 0`);
    } catch (e) { /* column already exists */ }

    // Opening Balance / Machine Count Change Requests
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_opening_change_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_id INT NOT NULL,
        branch_id INT NOT NULL,
        report_date DATE NOT NULL,
        request_type ENUM('balance', 'machine_count') NOT NULL,
        book_type ENUM('Offset', 'Laser', 'Other') NULL,
        machine_id INT NULL,
        current_value DECIMAL(12, 2) DEFAULT 0,
        requested_value DECIMAL(12, 2) DEFAULT 0,
        note TEXT,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        reviewed_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL,
        FOREIGN KEY (requester_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Cash Book Staff Assignments (which staff handles Offset/Laser/Other cash opening)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_book_staff_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_type ENUM('Offset', 'Laser', 'Other') NOT NULL,
        staff_id INT NOT NULL,
        branch_id INT NOT NULL,
        assigned_by INT,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_book_staff_branch (book_type, staff_id, branch_id)
      )
    `);

    // Enhance Jobs table for Workbook
    try {
      await connection.query(`
        ALTER TABLE sarga_jobs
        ADD COLUMN entry_date DATE,
        ADD COLUMN due_date_original DATE,
        ADD COLUMN workbook_remarks TEXT,
        ADD COLUMN priority ENUM('Low', 'Medium', 'High', 'Urgent') DEFAULT 'Medium'
      `);
      // Update existing records
      await connection.query(`
        UPDATE sarga_jobs 
        SET entry_date = DATE(created_at), 
            due_date_original = delivery_date 
        WHERE entry_date IS NULL
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error('Error enhancing jobs table:', err);
      }
    }

    // Enhance Staff Attendance for time tracking
    try {
      await connection.query(`
        ALTER TABLE sarga_staff_attendance 
        ADD COLUMN in_time TIME,
        ADD COLUMN out_time TIME,
        ADD COLUMN work_hours DECIMAL(4, 2)
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error('Error enhancing attendance table:', err);
      }
    }

    // Add 'Half Day' to attendance status enum if missing
    try {
      await connection.query(`
        ALTER TABLE sarga_staff_attendance
        MODIFY COLUMN status ENUM('Present','Absent','Leave','Holiday','Half Day') DEFAULT 'Present'
      `);
    } catch (err) {
      console.error('Error adding Half Day enum:', err);
    }

    // Enhance Attendance Requests for gone_time tracking
    try {
      await connection.query(`
        ALTER TABLE sarga_attendance_requests 
        ADD COLUMN requested_gone_time TIME AFTER requested_time
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error('Error enhancing attendance requests table:', err);
      }
    }

    console.log("Three Books System tables created successfully.");

    // Job Status History and new Cost fields
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_job_status_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        status VARCHAR(50) NOT NULL,
        staff_id INT,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    const newJobsCols = [
      { name: 'paper_cost', type: 'DECIMAL(10,2) DEFAULT 0' },
      { name: 'machine_cost', type: 'DECIMAL(10,2) DEFAULT 0' },
      { name: 'labour_cost', type: 'DECIMAL(10,2) DEFAULT 0' },
      { name: 'total_cost', type: 'DECIMAL(10,2) DEFAULT 0' },
      { name: 'profit', type: 'DECIMAL(10,2) DEFAULT 0' },
      { name: 'margin', type: 'DECIMAL(6,4) DEFAULT 0' },
      { name: 'required_sheets', type: 'INT DEFAULT 0' },
      { name: 'used_sheets', type: 'INT DEFAULT 0' },
      { name: 'paper_size', type: 'VARCHAR(30) DEFAULT NULL' },
      { name: 'plate_count', type: 'INT DEFAULT 0' },
      { name: 'plate_details', type: 'TEXT' }
    ];

    // Paper Usage Logs Table (per-stage tracking)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_paper_usage_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        stage VARCHAR(80) NOT NULL,
        paper_size VARCHAR(30) DEFAULT NULL,
        sheets_used INT NOT NULL DEFAULT 0,
        sheets_wasted INT NOT NULL DEFAULT 0,
        notes TEXT,
        logged_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (logged_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // Paper cut mapping: parent sheet -> child size mapping (e.g., double to dummy cuts)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_paper_cut_map (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parent_inventory_item_id INT NOT NULL,
        child_size_code VARCHAR(100) NOT NULL,
        pieces_per_parent INT NOT NULL DEFAULT 1,
        loss_pct DECIMAL(5,2) DEFAULT 0,
        min_waste INT DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_parent_child (parent_inventory_item_id, child_size_code),
        FOREIGN KEY (parent_inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
      )
    `);

    // ─── Customer Design History ─────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_customer_designs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        job_id INT DEFAULT NULL,
        title VARCHAR(200) NOT NULL,
        file_url LONGTEXT NOT NULL,
        file_type VARCHAR(30) DEFAULT 'image',
        original_name VARCHAR(300),
        file_size INT DEFAULT 0,
        notes TEXT,
        tags VARCHAR(500),
        uploaded_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE SET NULL,
        FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);
    try { await connection.query("ALTER TABLE sarga_customer_designs MODIFY COLUMN file_url LONGTEXT"); } catch (e) { }

    // ─── Job Proofs (Proof Approval Workflow) ────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_job_proofs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        file_url LONGTEXT NOT NULL,
        original_name VARCHAR(300),
        file_size INT DEFAULT 0,
        file_type VARCHAR(30) DEFAULT 'image',
        status ENUM('Pending', 'Approved', 'Rejected', 'Revision Requested') DEFAULT 'Pending',
        designer_notes TEXT,
        customer_feedback TEXT,
        uploaded_by INT,
        reviewed_by INT,
        reviewed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);
    try { await connection.query("ALTER TABLE sarga_job_proofs MODIFY COLUMN file_url LONGTEXT"); } catch (e) { }

    for (const col of newJobsCols) {
      try {
        await connection.query(`ALTER TABLE sarga_jobs ADD COLUMN ${col.name} ${col.type}`);
      } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    }

    // ─── Enhanced Audit Log columns ───
    const auditCols = [
      { name: 'entity_type', type: "VARCHAR(50) DEFAULT NULL AFTER details" },
      { name: 'entity_id', type: "INT DEFAULT NULL AFTER entity_type" },
      { name: 'field_name', type: "VARCHAR(100) DEFAULT NULL AFTER entity_id" },
      { name: 'old_value', type: "TEXT DEFAULT NULL AFTER field_name" },
      { name: 'new_value', type: "TEXT DEFAULT NULL AFTER old_value" },
      { name: 'ip_address', type: "VARCHAR(45) DEFAULT NULL AFTER new_value" },
    ];
    for (const col of auditCols) {
      try { await connection.query(`ALTER TABLE sarga_audit_logs ADD COLUMN ${col.name} ${col.type}`); }
      catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
    }

    // ─── Invoice Sequence Table (gap-free, per-financial-year) ───
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_invoice_sequence (
        id INT AUTO_INCREMENT PRIMARY KEY,
        financial_year VARCHAR(10) NOT NULL,
        last_number INT NOT NULL DEFAULT 0,
        prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_fy_prefix (financial_year, prefix)
      )
    `);

    // ─── Invoice Registry (links invoice numbers to payments/jobs for traceability) ───
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(30) NOT NULL UNIQUE,
        financial_year VARCHAR(10) NOT NULL,
        payment_id INT DEFAULT NULL,
        customer_id INT DEFAULT NULL,
        total_amount DECIMAL(12,2) DEFAULT 0,
        tax_amount DECIMAL(12,2) DEFAULT 0,
        net_amount DECIMAL(12,2) DEFAULT 0,
        status ENUM('Active', 'Cancelled', 'Credit Note') DEFAULT 'Active',
        generated_by INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES sarga_customer_payments(id) ON DELETE SET NULL,
        FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
        FOREIGN KEY (generated_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

    // AI cache table — stores generated insights, forecasts, etc.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_ai_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cache_key VARCHAR(255) NOT NULL UNIQUE,
        cache_value JSON NOT NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Expense Categorizer Training Data (OCR text → category labels)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_expense_training (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ocr_text TEXT NOT NULL,
        category VARCHAR(150) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_exp_train_category (category)
      )
    `);

    // Indexes for audit and invoice tables
    await safeIndex('idx_audit_entity', 'CREATE INDEX idx_audit_entity ON sarga_audit_logs (entity_type, entity_id)');
    await safeIndex('idx_audit_action', 'CREATE INDEX idx_audit_action ON sarga_audit_logs (action)');
    await safeIndex('idx_invoice_fy', 'CREATE INDEX idx_invoice_fy ON sarga_invoices (financial_year)');
    await safeIndex('idx_invoice_payment', 'CREATE INDEX idx_invoice_payment ON sarga_invoices (payment_id)');
    await safeIndex('idx_invoice_customer', 'CREATE INDEX idx_invoice_customer ON sarga_invoices (customer_id)');

    try {
      await connection.query(`ALTER TABLE sarga_job_staff_assignments ADD COLUMN stage VARCHAR(50) DEFAULT NULL`);
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }

    // Make staff_id nullable for role-based assignments
    try {
      await connection.query(`ALTER TABLE sarga_job_staff_assignments MODIFY COLUMN staff_id INT NULL`);
    } catch (err) { console.log('staff_id nullable migration:', err.message); }


    // Seed Default Admin
    const adminId = '8547432287';
    const adminPass = 'admin';
    const [rows] = await connection.query("SELECT * FROM sarga_staff WHERE user_id = ?", [adminId]);

    if (rows.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPass, 10);
      await connection.query(
        "INSERT INTO sarga_staff (user_id, password, role, name, is_first_login, branch_id) VALUES (?, ?, ?, ?, ?, ?)",
        [adminId, hashedPassword, 'Admin', 'Default Admin', 1, defaultBranchId]
      );
      console.log("Default admin seeded successfully in MySQL.");
    }
    // Ensure sarga_inventory has new columns
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN hsn VARCHAR(20)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN discount DECIMAL(5, 2) DEFAULT 0'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_inventory ADD COLUMN gst_rate DECIMAL(5, 2) DEFAULT 0'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }


    // Jobs — filtered by status, branch, customer, and date
    await safeIndex('idx_jobs_status', 'CREATE INDEX idx_jobs_status ON sarga_jobs (status)');
    await safeIndex('idx_jobs_branch', 'CREATE INDEX idx_jobs_branch ON sarga_jobs (branch_id)');
    await safeIndex('idx_jobs_customer', 'CREATE INDEX idx_jobs_customer ON sarga_jobs (customer_id)');
    await safeIndex('idx_jobs_branch_status', 'CREATE INDEX idx_jobs_branch_status ON sarga_jobs (branch_id, status)');
    await safeIndex('idx_jobs_customer_status', 'CREATE INDEX idx_jobs_customer_status ON sarga_jobs (customer_id, status)');
    await safeIndex('idx_jobs_branch_customer_status', 'CREATE INDEX idx_jobs_branch_customer_status ON sarga_jobs (branch_id, customer_id, status)');
    await safeIndex('idx_jobs_created', 'CREATE INDEX idx_jobs_created ON sarga_jobs (created_at)');
    await safeIndex('idx_jobs_delivery', 'CREATE INDEX idx_jobs_delivery ON sarga_jobs (delivery_date)');
    await safeIndex('idx_jobs_payment_status', 'CREATE INDEX idx_jobs_payment_status ON sarga_jobs (payment_status)');

    // Job assignments — looked up by job and staff
    await safeIndex('idx_assignments_job', 'CREATE INDEX idx_assignments_job ON sarga_job_staff_assignments (job_id)');
    await safeIndex('idx_assignments_staff', 'CREATE INDEX idx_assignments_staff ON sarga_job_staff_assignments (staff_id)');

    // Customer payments — filtered by customer, date, branch
    await safeIndex('idx_cp_customer', 'CREATE INDEX idx_cp_customer ON sarga_customer_payments (customer_id)');
    await safeIndex('idx_cp_date', 'CREATE INDEX idx_cp_date ON sarga_customer_payments (payment_date)');
    await safeIndex('idx_cp_branch', 'CREATE INDEX idx_cp_branch ON sarga_customer_payments (branch_id)');
    await safeIndex('idx_cp_branch_date', 'CREATE INDEX idx_cp_branch_date ON sarga_customer_payments (branch_id, payment_date)');
    await safeIndex('idx_cp_customer_date', 'CREATE INDEX idx_cp_customer_date ON sarga_customer_payments (customer_id, payment_date)');
    await safeIndex('idx_cp_branch_customer_date', 'CREATE INDEX idx_cp_branch_customer_date ON sarga_customer_payments (branch_id, customer_id, payment_date)');

    // Vendor payments — filtered by branch, date, type
    await safeIndex('idx_pay_branch', 'CREATE INDEX idx_pay_branch ON sarga_payments (branch_id)');
    await safeIndex('idx_pay_date', 'CREATE INDEX idx_pay_date ON sarga_payments (payment_date)');
    await safeIndex('idx_pay_type', 'CREATE INDEX idx_pay_type ON sarga_payments (type)');

    // Staff — branch lookup
    await safeIndex('idx_staff_branch', 'CREATE INDEX idx_staff_branch ON sarga_staff (branch_id)');
    await safeIndex('idx_customers_branch', 'CREATE INDEX idx_customers_branch ON sarga_customers (branch_id)');
    await safeIndex('idx_vendors_branch', 'CREATE INDEX idx_vendors_branch ON sarga_vendors (branch_id)');

    // Attendance — date-based queries
    await safeIndex('idx_att_date', 'CREATE INDEX idx_att_date ON sarga_staff_attendance (attendance_date)');

    // Audit logs — timestamp range queries
    await safeIndex('idx_audit_ts', 'CREATE INDEX idx_audit_ts ON sarga_audit_logs (timestamp)');

    // Request tables — status lookups
    await safeIndex('idx_idreq_status', 'CREATE INDEX idx_idreq_status ON sarga_id_requests (status)');
    await safeIndex('idx_custreq_status', 'CREATE INDEX idx_custreq_status ON sarga_customer_requests (status)');
    await safeIndex('idx_discreq_status', 'CREATE INDEX idx_discreq_status ON sarga_discount_requests (status)');
    await safeIndex('idx_attreq_status', 'CREATE INDEX idx_attreq_status ON sarga_attendance_requests (status)');
    await safeIndex('idx_vendreq_status', 'CREATE INDEX idx_vendreq_status ON sarga_vendor_requests (status)');
    await safeIndex('idx_vendreq_branch', 'CREATE INDEX idx_vendreq_branch ON sarga_vendor_requests (branch_id)');
    await safeIndex('idx_vendreq_branch_status', 'CREATE INDEX idx_vendreq_branch_status ON sarga_vendor_requests (branch_id, status)');

    // Daily reporting and approval queues — branch/status lookups
    await safeIndex('idx_drm_branch_status', 'CREATE INDEX idx_drm_branch_status ON sarga_daily_report_machine (branch_id, status)');
    await safeIndex('idx_ocr_branch_status', 'CREATE INDEX idx_ocr_branch_status ON sarga_opening_change_requests (branch_id, status)');

    // Machine count requests — status lookup
    await safeIndex('idx_mcount_status', 'CREATE INDEX idx_mcount_status ON sarga_machine_count_requests (status)');
    await safeIndex('idx_mcount_machine', 'CREATE INDEX idx_mcount_machine ON sarga_machine_count_requests (machine_id)');

    // Refunds — job lookup
    await safeIndex('idx_refunds_job', 'CREATE INDEX idx_refunds_job ON sarga_refunds (job_id)');
    await safeIndex('idx_refunds_customer', 'CREATE INDEX idx_refunds_customer ON sarga_refunds (customer_id)');

    // Customer designs — customer + job lookup
    await safeIndex('idx_designs_customer', 'CREATE INDEX idx_designs_customer ON sarga_customer_designs (customer_id)');
    await safeIndex('idx_designs_job', 'CREATE INDEX idx_designs_job ON sarga_customer_designs (job_id)');

    // Job proofs — job lookup
    await safeIndex('idx_proofs_job', 'CREATE INDEX idx_proofs_job ON sarga_job_proofs (job_id)');

    // Additional performance indexes
    await safeIndex('idx_staff_userid', 'CREATE INDEX idx_staff_userid ON sarga_staff (user_id)');
    await safeIndex('idx_att_staff', 'CREATE INDEX idx_att_staff ON sarga_staff_attendance (staff_id)');
    await safeIndex('idx_salary_staff', 'CREATE INDEX idx_salary_staff ON sarga_staff_salary (staff_id)');
    await safeIndex('idx_inventory_sku', 'CREATE INDEX idx_inventory_sku ON sarga_inventory (sku)');
    await safeIndex('idx_customers_mobile', 'CREATE INDEX idx_customers_mobile ON sarga_customers (mobile)');

    // ===== NEW INDEXES FOR PERFORMANCE OPTIMIZATION (12 Missing Indexes) =====
    
    // Products table - subcategory filtering
    await safeIndex('idx_products_subcategory', 'CREATE INDEX idx_products_subcategory ON sarga_products (subcategory_id)');
    
    // Vendor bills - vendor and date lookups
    await safeIndex('idx_vb_vendor_id', 'CREATE INDEX idx_vb_vendor_id ON sarga_vendor_bills (vendor_id)');
    await safeIndex('idx_vb_bill_date', 'CREATE INDEX idx_vb_bill_date ON sarga_vendor_bills (bill_date)');
    await safeIndex('idx_vb_vendor_date', 'CREATE INDEX idx_vb_vendor_date ON sarga_vendor_bills (vendor_id, bill_date)');
    await safeIndex('idx_vb_branch_date', 'CREATE INDEX idx_vb_branch_date ON sarga_vendor_bills (branch_id, bill_date)');
    
    // Inventory additional indexes
    await safeIndex('idx_inventory_category', 'CREATE INDEX idx_inventory_category ON sarga_inventory (category)');
    await safeIndex('idx_inventory_reorder', 'CREATE INDEX idx_inventory_reorder ON sarga_inventory (quantity, reorder_level)');
    await safeIndex('idx_inventory_created', 'CREATE INDEX idx_inventory_created ON sarga_inventory (created_at)');
    
    // Staff additional indexes
    await safeIndex('idx_staff_role', 'CREATE INDEX idx_staff_role ON sarga_staff (role)');
    await safeIndex('idx_staff_branch_role', 'CREATE INDEX idx_staff_branch_role ON sarga_staff (branch_id, role)');
    await safeIndex('idx_staff_is_first_login', 'CREATE INDEX idx_staff_is_first_login ON sarga_staff (is_first_login)');
    
    // Customers additional indexes
    await safeIndex('idx_customers_type', 'CREATE INDEX idx_customers_type ON sarga_customers (type)');
    await safeIndex('idx_customers_branch_type', 'CREATE INDEX idx_customers_branch_type ON sarga_customers (branch_id, type)');
    await safeIndex('idx_customers_created_at', 'CREATE INDEX idx_customers_created_at ON sarga_customers (created_at)');
    
    // Job-Staff assignments
    await safeIndex('idx_job_staff_stage', 'CREATE INDEX idx_job_staff_stage ON sarga_job_staff_assignments (stage)');
    
    // ===== CHECK CONSTRAINTS FOR DATA INTEGRITY =====
    // Prevent negative values in financial and quantity fields
    
    try {
      await connection.query('ALTER TABLE sarga_inventory ADD CONSTRAINT chk_inventory_quantity CHECK (quantity >= 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Inventory quantity constraint:', err.message); }
    
    try {
      await connection.query('ALTER TABLE sarga_inventory ADD CONSTRAINT chk_inventory_cost_price CHECK (cost_price >= 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Inventory cost_price constraint:', err.message); }
    
    try {
      await connection.query('ALTER TABLE sarga_inventory ADD CONSTRAINT chk_inventory_sell_price CHECK (sell_price >= 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Inventory sell_price constraint:', err.message); }
    
    try {
      await connection.query('ALTER TABLE sarga_payments ADD CONSTRAINT chk_payments_amount CHECK (amount > 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Payments amount constraint:', err.message); }
    
    try {
      await connection.query('ALTER TABLE sarga_customer_payments ADD CONSTRAINT chk_cp_total_amount CHECK (total_amount >= 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Customer payments amount constraint:', err.message); }
    
    try {
      await connection.query('ALTER TABLE sarga_jobs ADD CONSTRAINT chk_jobs_quantity CHECK (quantity > 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Jobs quantity constraint:', err.message); }
    
    try {
      await connection.query('ALTER TABLE sarga_jobs ADD CONSTRAINT chk_jobs_total_amount CHECK (total_amount >= 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Jobs total_amount constraint:', err.message); }

    try {
      await connection.query('ALTER TABLE sarga_jobs ADD CONSTRAINT chk_jobs_advance_paid CHECK (advance_paid >= 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Jobs advance_paid constraint:', err.message); }

    try {
      await connection.query('ALTER TABLE sarga_vendor_bills ADD CONSTRAINT chk_vb_total_amount CHECK (total_amount >= 0)');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_CONSTRAINT_NAME') console.log('Vendor bills amount constraint:', err.message); }

    // Add ip_address column to sarga_machines (upgrade-safe)
    try { await connection.query('ALTER TABLE sarga_machines ADD COLUMN ip_address VARCHAR(45) DEFAULT NULL'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    // Add SNMP/login credential columns (upgrade-safe)
    try { await connection.query("ALTER TABLE sarga_machines ADD COLUMN snmp_community VARCHAR(100) DEFAULT 'public'"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_machines ADD COLUMN mpr_username VARCHAR(100) DEFAULT NULL'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_machines ADD COLUMN mpr_password VARCHAR(255) DEFAULT NULL'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Waste & Proof print columns on machine_readings (upgrade-safe)
    try { await connection.query('ALTER TABLE sarga_machine_readings ADD COLUMN waste_prints INT NOT NULL DEFAULT 0'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_machine_readings ADD COLUMN proof_prints INT NOT NULL DEFAULT 0'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Waste & Proof print columns on daily_report_machine (upgrade-safe)
    try { await connection.query('ALTER TABLE sarga_daily_report_machine ADD COLUMN waste_prints INT NOT NULL DEFAULT 0'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_daily_report_machine ADD COLUMN proof_prints INT NOT NULL DEFAULT 0'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Waste & Proof copies per work entry (upgrade-safe)
    try { await connection.query('ALTER TABLE sarga_machine_work_entries ADD COLUMN waste_copies INT NOT NULL DEFAULT 0'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_machine_work_entries ADD COLUMN proof_copies INT NOT NULL DEFAULT 0'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // CCTV Cameras Table — stores camera IP, credentials, branch mapping
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_cctv_cameras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        branch VARCHAR(50) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        port INT NOT NULL DEFAULT 554,
        username VARCHAR(100) NOT NULL DEFAULT 'admin',
        password VARCHAR(255) NOT NULL,
        rtsp_path VARCHAR(255) NOT NULL DEFAULT '/Streaming/Channels/101',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await safeIndex('idx_cctv_cam_branch', 'CREATE INDEX idx_cctv_cam_branch ON sarga_cctv_cameras (branch)');

    // CCTV Face Data Table — stores face encoding references per staff
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_cctv_face_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        label VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
      )
    `);
    await safeIndex('idx_cctv_face_staff', 'CREATE INDEX idx_cctv_face_staff ON sarga_cctv_face_data (staff_id)');

    // CCTV Attendance Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_cctv_attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        branch VARCHAR(50) NOT NULL,
        event_type ENUM('entry', 'exit', 'manual') NOT NULL,
        source ENUM('face_recognition', 'manual') NOT NULL DEFAULT 'manual',
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        noted_by INT NULL,
        date DATE GENERATED ALWAYS AS (DATE(timestamp)) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (noted_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);
    await safeIndex('idx_cctv_att_staff_date', 'CREATE INDEX idx_cctv_att_staff_date ON sarga_cctv_attendance (staff_id, date)');
    await safeIndex('idx_cctv_att_branch_date', 'CREATE INDEX idx_cctv_att_branch_date ON sarga_cctv_attendance (branch, date)');

    // ===== SCHEDULE / SHIFT MANAGEMENT =====
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        schedule_name VARCHAR(100) NOT NULL DEFAULT 'General Shift',
        shift_start TIME NOT NULL DEFAULT '09:00:00',
        shift_end TIME NOT NULL DEFAULT '18:00:00',
        break_minutes INT NOT NULL DEFAULT 60,
        working_days VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6',
        effective_from DATE NOT NULL,
        effective_to DATE DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);
    await safeIndex('idx_sched_staff', 'CREATE INDEX idx_sched_staff ON sarga_staff_schedules (staff_id, is_active)');
    await safeIndex('idx_sched_dates', 'CREATE INDEX idx_sched_dates ON sarga_staff_schedules (effective_from, effective_to)');

    // ===== LATE TIME TRACKING =====
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff_latetime (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        attendance_date DATE NOT NULL,
        scheduled_start TIME NOT NULL,
        actual_start TIME NOT NULL,
        late_minutes INT NOT NULL DEFAULT 0,
        reason TEXT,
        excused TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        UNIQUE KEY unique_late (staff_id, attendance_date)
      )
    `);
    await safeIndex('idx_late_staff_date', 'CREATE INDEX idx_late_staff_date ON sarga_staff_latetime (staff_id, attendance_date)');
    await safeIndex('idx_late_date', 'CREATE INDEX idx_late_date ON sarga_staff_latetime (attendance_date)');

    // ===== OVERTIME TRACKING =====
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff_overtime (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        overtime_date DATE NOT NULL,
        scheduled_end TIME NOT NULL,
        actual_end TIME NOT NULL,
        overtime_minutes INT NOT NULL DEFAULT 0,
        overtime_type ENUM('Weekday', 'Weekend', 'Holiday') NOT NULL DEFAULT 'Weekday',
        approved TINYINT(1) NOT NULL DEFAULT 0,
        approved_by INT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (approved_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_overtime (staff_id, overtime_date)
      )
    `);
    await safeIndex('idx_ot_staff_date', 'CREATE INDEX idx_ot_staff_date ON sarga_staff_overtime (staff_id, overtime_date)');
    await safeIndex('idx_ot_date', 'CREATE INDEX idx_ot_date ON sarga_staff_overtime (overtime_date)');
    await safeIndex('idx_ot_approved', 'CREATE INDEX idx_ot_approved ON sarga_staff_overtime (approved)');

    // Vendor Management Tables
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        phone VARCHAR(20),
        email VARCHAR(255),
        gstin VARCHAR(20),
        address TEXT,
        city VARCHAR(100),
        vendor_code VARCHAR(10),
        category ENUM('offset_supplies','chemicals','paper','ink','equipment','other') DEFAULT 'other',
        credit_days INT DEFAULT 0,
        credit_limit DECIMAL(12,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_vendor_name (name)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendor_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        invoice_number VARCHAR(100),
        invoice_date DATE NOT NULL,
        due_date DATE,
        amount DECIMAL(12,2) NOT NULL,
        paid_amount DECIMAL(12,2) DEFAULT 0,
        status ENUM('pending','partial','paid','overdue') DEFAULT 'pending',
        branch ENUM('perambra','meppayur','common') DEFAULT 'common',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        INDEX idx_vendor_invoice_status (vendor_id, status),
        INDEX idx_invoice_due_date (due_date),
        INDEX idx_invoice_branch (branch)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendor_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_invoice_id INT NOT NULL,
        vendor_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        payment_date DATE NOT NULL,
        payment_mode ENUM('cash','upi','bank_transfer','cheque') DEFAULT 'cash',
        reference_number VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_invoice_id) REFERENCES vendor_invoices(id),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id),
        INDEX idx_payment_vendor (vendor_id),
        INDEX idx_payment_date (payment_date)
      )
    `);

    // Initialize sample vendor data if vendors table is empty
    try {
      const [existingVendors] = await connection.query('SELECT COUNT(*) as count FROM vendors');
      if (existingVendors[0].count === 0) {
        // Insert sample vendors
        await connection.query(`
          INSERT INTO vendors (name, contact_person, phone, email, gstin, address, city, vendor_code, category, credit_days, credit_limit, notes) VALUES
          ('Suprabhat Trading Corporation', 'Mr. Rajesh Kumar', '+91-9876543210', 'rajesh@suprabhat.com', '33AAAAA0000A1Z5', '123 Industrial Area, Sivakasi', 'Sivakasi', 'STR', 'offset_supplies', 30, 50000.00, 'Reliable offset printing supplies vendor'),
          ('Monotech Systems', 'Ms. Priya Sharma', '+91-9876543211', 'priya@monotech.com', '29BBBBB1111B1Z6', '456 Tech Park, Chennai', 'Chennai', 'MNT', 'chemicals', 45, 75000.00, 'Specialized in printing chemicals'),
          ('Kerala Paper Mart', 'Mr. Suresh Nair', '+91-9876543212', 'suresh@kpm.com', '32CCCCC2222C1Z7', '789 Paper Street, Kozhikode', 'Kozhikode', 'KPM', 'paper', 15, 25000.00, 'Local paper supplier with good quality'),
          ('Riya Ink Suppliers', 'Mrs. Meera Patel', '+91-9876543213', 'meera@riyainks.com', '24DDDDD3333D1Z8', '321 Ink Lane, Calicut', 'Calicut', 'RIS', 'ink', 0, 15000.00, 'Cash basis supplier for inks')
        `);

        // Insert sample invoices
        await connection.query(`
          INSERT INTO vendor_invoices (vendor_id, invoice_number, invoice_date, due_date, amount, paid_amount, status, branch, notes) VALUES
          (1, 'STC-2024-001', '2024-04-01', '2024-05-01', 15000.00, 15000.00, 'paid', 'perambra', 'Offset plates and chemicals'),
          (1, 'STC-2024-002', '2024-04-15', '2024-05-15', 12000.00, 6000.00, 'partial', 'meppayur', 'Paper supplies'),
          (1, 'STC-2024-003', '2024-03-20', '2024-04-20', 8000.00, 0.00, 'overdue', 'common', 'Ink cartridges'),
          (2, 'MS-2024-001', '2024-04-05', '2024-05-20', 25000.00, 25000.00, 'paid', 'perambra', 'Chemical supplies'),
          (2, 'MS-2024-002', '2024-04-20', '2024-06-04', 18000.00, 0.00, 'pending', 'meppayur', 'Developer solutions'),
          (3, 'KPM-2024-001', '2024-04-10', '2024-04-25', 10000.00, 10000.00, 'paid', 'common', 'Art paper 100gsm'),
          (3, 'KPM-2024-002', '2024-04-25', '2024-05-10', 7500.00, 5000.00, 'partial', 'perambra', 'Cardstock paper'),
          (4, 'RIS-2024-001', '2024-04-12', '2024-04-12', 5000.00, 5000.00, 'paid', 'meppayur', 'CMYK ink set'),
          (4, 'RIS-2024-002', '2024-04-28', '2024-04-28', 3000.00, 0.00, 'pending', 'common', 'Spot color inks')
        `);

        // Insert sample payments
        await connection.query(`
          INSERT INTO vendor_payments (vendor_invoice_id, vendor_id, amount, payment_date, payment_mode, reference_number, notes) VALUES
          (1, 1, 15000.00, '2024-04-15', 'bank_transfer', 'BT001234', 'Full payment for offset supplies'),
          (2, 1, 6000.00, '2024-04-20', 'cheque', 'CHQ567890', 'Partial payment for paper supplies'),
          (4, 2, 25000.00, '2024-04-10', 'upi', 'UPI987654', 'Chemical supplies payment'),
          (6, 3, 10000.00, '2024-04-15', 'cash', 'CASH001', 'Art paper payment'),
          (7, 3, 5000.00, '2024-04-28', 'bank_transfer', 'BT005678', 'Partial payment for cardstock'),
          (8, 4, 5000.00, '2024-04-12', 'cash', 'CASH002', 'CMYK ink set payment')
        `);

        console.log('Sample vendor data initialized');
      }
    } catch (err) {
      logger.warn('Warning: Could not initialize sample vendor data:', err.message);
    }

    // Product Images Cache Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_product_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inventory_item_id INT NOT NULL,
        image_url LONGTEXT,
        source ENUM('Uploaded', 'Cached', 'Generated', 'Category', 'Default') DEFAULT 'Default',
        confidence INT DEFAULT 0,
        is_locked TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_inv_item (inventory_item_id),
        FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
      )
    `);

    // Inventory Settings Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_inventory_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        auto_assign_images TINYINT(1) DEFAULT 1,
        cache_images TINYINT(1) DEFAULT 1,
        generate_missing TINYINT(1) DEFAULT 1,
        category_placeholders TINYINT(1) DEFAULT 1,
        ask_before_saving TINYINT(1) DEFAULT 1,
        image_quality ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    try {
      await connection.query('INSERT IGNORE INTO sarga_inventory_settings (id) VALUES (1)');
    } catch (e) {
      // Ignore
    }

    // Performance indexes for frequently queried tables
    await safeIndex('idx_staff_user_id', 'CREATE INDEX idx_staff_user_id ON sarga_staff (user_id)');
    await safeIndex('idx_staff_branch_role', 'CREATE INDEX idx_staff_branch_role ON sarga_staff (branch_id, role)');
    await safeIndex('idx_staff_is_active', 'CREATE INDEX idx_staff_is_active ON sarga_staff (is_active)');
    await safeIndex('idx_payments_date_branch', 'CREATE INDEX idx_payments_date_branch ON sarga_payments (payment_date, branch_id)');
    await safeIndex('idx_payments_type_date', 'CREATE INDEX idx_payments_type_date ON sarga_payments (type, payment_date)');
    await safeIndex('idx_payments_vendor_date', 'CREATE INDEX idx_payments_vendor_date ON sarga_payments (vendor_id, payment_date)');
    await safeIndex('idx_jobs_created_status', 'CREATE INDEX idx_jobs_created_status ON sarga_jobs (created_at, status)');
    await safeIndex('idx_jobs_customer_status', 'CREATE INDEX idx_jobs_customer_status ON sarga_jobs (customer_id, status)');
    await safeIndex('idx_jobs_branch_status', 'CREATE INDEX idx_jobs_branch_status ON sarga_jobs (branch_id, status)');
    await safeIndex('idx_jobs_created_branch', 'CREATE INDEX idx_jobs_created_branch ON sarga_jobs (created_at, branch_id)');
    await safeIndex('idx_customers_mobile', 'CREATE INDEX idx_customers_mobile ON sarga_customers (mobile)');
    await safeIndex('idx_customers_branch_type', 'CREATE INDEX idx_customers_branch_type ON sarga_customers (branch_id, type)');
    await safeIndex('idx_products_subcategory', 'CREATE INDEX idx_products_subcategory ON sarga_products (subcategory_id)');
    await safeIndex('idx_products_is_active', 'CREATE INDEX idx_products_is_active ON sarga_products (is_active)');
    await safeIndex('idx_inventory_category', 'CREATE INDEX idx_inventory_category ON sarga_inventory (category)');
    await safeIndex('idx_paper_stock_branch', 'CREATE INDEX idx_paper_stock_branch ON paper_stock_summary (branch_id)');
    await safeIndex('idx_paper_type_active', 'CREATE INDEX idx_paper_type_active ON paper_types (is_active)');
    await safeIndex('idx_stock_requests_status', 'CREATE INDEX idx_stock_requests_status ON sarga_stock_requests (status)');
    await safeIndex('idx_stock_requests_branch', 'CREATE INDEX idx_stock_requests_branch ON sarga_stock_requests (from_branch_id, to_branch_id)');

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = { pool, initDb };

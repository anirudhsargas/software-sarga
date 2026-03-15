const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Enable SSL when DB_SSL=true (required for Aiven and most cloud MySQL providers)
  ...(process.env.DB_SSL === 'true' && { ssl: { rejectUnauthorized: false } }),
});

const initDb = async () => {
  const connection = await pool.getConnection();
  const safeIndex = async (name, sql) => {
    try { await connection.query(sql); }
    catch (e) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }
  };

  try {
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
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN email VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN smtp_user VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN smtp_pass VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query('ALTER TABLE sarga_branches ADD COLUMN upi_id VARCHAR(100)'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Staff Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_staff (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        branch_id INT,
        image_url VARCHAR(255),
        salary_type ENUM('Monthly', 'Daily') DEFAULT 'Monthly',
        base_salary DECIMAL(12, 2) DEFAULT 0,
        daily_rate DECIMAL(12, 2) DEFAULT 0,
        is_first_login TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
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


    // Customers Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mobile VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        type ENUM('Walk-in', 'Retail', 'Association', 'Offset') NOT NULL DEFAULT 'Walk-in',
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
        image_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await connection.query("ALTER TABLE sarga_product_categories ADD COLUMN image_url VARCHAR(255)"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query("ALTER TABLE sarga_product_categories ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Product Hierarchy: Sub-categories
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_product_subcategories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        position INT NOT NULL DEFAULT 0,
        image_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES sarga_product_categories(id) ON DELETE CASCADE
      )
    `);
    try { await connection.query("ALTER TABLE sarga_product_subcategories ADD COLUMN image_url VARCHAR(255)"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await connection.query("ALTER TABLE sarga_product_subcategories ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // Products
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subcategory_id INT NOT NULL,
        name VARCHAR(150) NOT NULL,
        product_code VARCHAR(80),
        calculation_type ENUM('Normal', 'Slab', 'Range') DEFAULT 'Normal',
        description TEXT,
        image_url VARCHAR(255),
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
    // Ensure is_physical_product column exists (for existing tables)
    try {
      await connection.query(
        'ALTER TABLE sarga_products ADD COLUMN is_physical_product TINYINT(1) DEFAULT 0'
      );
    } catch (err) {
      // Column already exists, ignore
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
        FOREIGN KEY (vendor_id) REFERENCES sarga_vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
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

    // Payments Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        type ENUM('Vendor', 'Utility', 'Salary', 'Rent', 'Other') NOT NULL,
        payee_name VARCHAR(150) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
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
        FOREIGN KEY (vendor_id) REFERENCES sarga_vendors(id) ON DELETE SET NULL,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

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
        reference_number VARCHAR(100),
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
      )
    `);

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
        status ENUM('Pending', 'Processing', 'Completed', 'Delivered', 'Cancelled') DEFAULT 'Pending',
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
      { name: 'payment_id', type: 'INT DEFAULT NULL' }
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

    // Ensure columns exist in sarga_customer_payments
    const payCols = [
      { name: 'bill_amount', type: 'DECIMAL(12, 2) NOT NULL DEFAULT 0' },
      { name: 'net_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'sgst_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'cgst_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'cash_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'upi_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
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

    // Ensure verification_status ENUM includes 'Not in Statement'
    try {
      await connection.query(`ALTER TABLE sarga_customer_payments MODIFY COLUMN verification_status ENUM('Pending','Verified','Rejected','Not in Statement') DEFAULT 'Pending'`);
    } catch (err) { /* ignore if already correct */ }

    // Customer Refunds Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_refunds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        customer_id INT,
        refund_amount DECIMAL(12,2) NOT NULL,
        refund_method ENUM('Cash','UPI','Cheque','Account Transfer') DEFAULT 'Cash',
        reason TEXT,
        processed_by INT,
        branch_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE
      )
    `);

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
        report_id INT NOT NULL,
        transaction_type ENUM('Credit Out', 'Credit In') NOT NULL,
        customer_name VARCHAR(150) NOT NULL,
        customer_phone VARCHAR(20),
        amount DECIMAL(12, 2) NOT NULL,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
      )
    `);

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

    // ─── Customer Design History ─────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_customer_designs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        job_id INT DEFAULT NULL,
        title VARCHAR(200) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
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

    // ─── Job Proofs (Proof Approval Workflow) ────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_job_proofs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        file_url VARCHAR(500) NOT NULL,
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

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = { pool, initDb };

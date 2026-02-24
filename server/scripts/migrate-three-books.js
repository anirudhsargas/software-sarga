const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const migrateThreeBooks = async () => {
    const connection = await pool.getConnection();
    try {
        console.log('Starting Three Books System Migration...\n');

        // ==================== MACHINE MANAGEMENT ====================
        console.log('Creating Machine Management tables...');

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
        console.log('✓ sarga_machines table created');

        // Machine Daily Readings Table
        await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_machine_readings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_id INT NOT NULL,
        reading_date DATE NOT NULL,
        opening_count INT NOT NULL DEFAULT 0,
        closing_count INT DEFAULT NULL,
        total_copies INT AS (closing_count - opening_count) STORED,
        notes TEXT,
        created_by INT NOT NULL,
        updated_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        UNIQUE KEY unique_machine_date (machine_id, reading_date)
      )
    `);
        console.log('✓ sarga_machine_readings table created');

        // ==================== DAILY REPORT OFFSET ====================
        console.log('\nCreating Daily Report Offset tables...');

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
        created_by INT NOT NULL,
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
        console.log('✓ sarga_daily_report_offset table created');

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
        console.log('✓ sarga_daily_work_entries table created');

        // Enhance Staff Attendance for time tracking
        console.log('\nEnhancing staff attendance table...');
        await connection.query(`
      ALTER TABLE sarga_staff_attendance 
      ADD COLUMN IF NOT EXISTS in_time TIME,
      ADD COLUMN IF NOT EXISTS out_time TIME,
      ADD COLUMN IF NOT EXISTS work_hours DECIMAL(4, 2)
    `).catch(err => {
            if (err.code !== 'ER_DUP_FIELDNAME') throw err;
            console.log('  (columns already exist, skipping)');
        });
        console.log('✓ sarga_staff_attendance enhanced');

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
        console.log('✓ sarga_daily_expenses table created');

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
        console.log('✓ sarga_daily_credit_transactions table created');

        // ==================== DAILY REPORT MACHINE ====================
        console.log('\nCreating Daily Report Machine tables...');

        // Daily Machine Report Master
        await connection.query(`
      CREATE TABLE IF NOT EXISTS sarga_daily_report_machine (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_date DATE NOT NULL,
        machine_id INT NOT NULL,
        branch_id INT NOT NULL,
        opening_count INT NOT NULL DEFAULT 0,
        closing_count INT DEFAULT NULL,
        total_copies INT AS (closing_count - opening_count) STORED,
        total_amount DECIMAL(12, 2) DEFAULT 0,
        total_cash DECIMAL(12, 2) DEFAULT 0,
        total_credit DECIMAL(12, 2) DEFAULT 0,
        credit_cash_in DECIMAL(12, 2) DEFAULT 0,
        credit_cash_out DECIMAL(12, 2) DEFAULT 0,
        status ENUM('Draft', 'Finalized') DEFAULT 'Draft',
        created_by INT NOT NULL,
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
        console.log('✓ sarga_daily_report_machine table created');

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
        console.log('✓ sarga_machine_work_entries table created');

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
        console.log('✓ sarga_machine_credit_movements table created');

        // ==================== WORKBOOK ENHANCEMENTS ====================
        console.log('\nEnhancing Jobs table for Workbook...');

        await connection.query(`
      ALTER TABLE sarga_jobs
      ADD COLUMN IF NOT EXISTS entry_date DATE,
      ADD COLUMN IF NOT EXISTS due_date_original DATE,
      ADD COLUMN IF NOT EXISTS workbook_remarks TEXT,
      ADD COLUMN IF NOT EXISTS priority ENUM('Low', 'Medium', 'High', 'Urgent') DEFAULT 'Medium'
    `).catch(err => {
            if (err.code !== 'ER_DUP_FIELDNAME') throw err;
            console.log('  (columns already exist, skipping)');
        });
        console.log('✓ sarga_jobs enhanced');

        // Update existing records
        await connection.query(`
      UPDATE sarga_jobs 
      SET entry_date = DATE(created_at), 
          due_date_original = delivery_date 
      WHERE entry_date IS NULL
    `);
        console.log('✓ Existing job records updated');

        // ==================== CREDIT MANAGEMENT ====================
        console.log('\nCreating Credit Management tables...');

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
        console.log('✓ sarga_credit_customers table created');

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
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (credit_customer_id) REFERENCES sarga_credit_customers(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
        INDEX idx_customer_date (credit_customer_id, transaction_date)
      )
    `);
        console.log('✓ sarga_credit_ledger table created');

        console.log('\n✅ Three Books System Migration Completed Successfully!\n');
        console.log('Summary:');
        console.log('  - Machine Management: 2 tables');
        console.log('  - Daily Report Offset: 4 tables');
        console.log('  - Daily Report Machine: 3 tables');
        console.log('  - Workbook: Enhanced sarga_jobs');
        console.log('  - Credit Management: 2 tables');
        console.log('  Total: 11 new tables + 2 enhanced tables\n');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
};

// Run migration
migrateThreeBooks()
    .then(() => {
        console.log('Migration script completed.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Migration script failed:', err);
        process.exit(1);
    });

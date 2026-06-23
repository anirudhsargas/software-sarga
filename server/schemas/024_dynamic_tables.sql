-- Centralized Dynamic Tables Migration
-- Consolidates all tables previously created dynamically by routes/helpers/scripts.

-- 1. Quotes Tables
CREATE TABLE IF NOT EXISTS sarga_quotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_number VARCHAR(30) NOT NULL UNIQUE,
    customer_id INT,
    customer_name VARCHAR(150),
    customer_mobile VARCHAR(20),
    customer_email VARCHAR(150),
    customer_address TEXT,
    customer_gst VARCHAR(30),
    date DATE NOT NULL,
    valid_until DATE,
    status ENUM('draft','sent','accepted','rejected','expired','converted') DEFAULT 'draft',
    notes TEXT,
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    converted_invoice_id INT,
    branch_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_quote_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (quote_id) REFERENCES sarga_quotes(id) ON DELETE CASCADE
);

-- 2. Products / Links Tables
CREATE TABLE IF NOT EXISTS sarga_product_image_requests (
    id INT NOT NULL AUTO_INCREMENT,
    product_id INT NOT NULL,
    current_image_url VARCHAR(255) DEFAULT NULL,
    proposed_image_url VARCHAR(255) NOT NULL,
    requested_by INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    admin_note TEXT NULL,
    requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_product_status (product_id, status),
    KEY idx_status_requested_at (status, requested_at),
    CONSTRAINT fk_product_image_requests_product
        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sarga_product_links (
    id INT NOT NULL AUTO_INCREMENT,
    product_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_product_links_product (product_id),
    CONSTRAINT fk_product_links_product
        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sarga_product_update_requests (
    id INT NOT NULL AUTO_INCREMENT,
    product_id INT NOT NULL,
    current_data LONGTEXT NULL,
    proposed_data LONGTEXT NOT NULL,
    requested_by INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    admin_note TEXT NULL,
    requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_product_update_status (product_id, status),
    KEY idx_update_status_requested_at (status, requested_at),
    CONSTRAINT fk_product_update_requests_product
        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Password Reset
CREATE TABLE IF NOT EXISTS sarga_password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

-- 4. Invoice Features & Seeding
CREATE TABLE IF NOT EXISTS sarga_invoice_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL UNIQUE,
    status ENUM('draft','pending','sent','paid','partially_paid','overdue','cancelled','refunded','on_hold') DEFAULT 'draft',
    due_date DATE,
    sent_at DATETIME,
    sent_to_email VARCHAR(150),
    paid_at DATETIME,
    is_overdue BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES sarga_customer_payments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_recurring_invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    customer_name VARCHAR(150),
    customer_mobile VARCHAR(20),
    customer_email VARCHAR(150),
    frequency ENUM('daily','weekly','monthly','quarterly','annually') NOT NULL,
    items JSON,
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    next_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    last_generated_at DATETIME,
    branch_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_payment_modes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_tax_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rate DECIMAL(5,2) NOT NULL,
    type ENUM('percentage','fixed') DEFAULT 'percentage',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    applies_to ENUM('all','product','service') DEFAULT 'all',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_company_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_i18n_overrides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    locale VARCHAR(10) NOT NULL DEFAULT 'en',
    message_key VARCHAR(200) NOT NULL,
    message_value TEXT NOT NULL,
    UNIQUE KEY uq_locale_key (locale, message_key)
);

INSERT IGNORE INTO sarga_payment_modes (name, description, is_default, sort_order) VALUES
    ('Cash', 'Cash payment', TRUE, 1),
    ('UPI', 'UPI payment', FALSE, 2),
    ('Bank Transfer', 'Bank/NEFT/RTGS transfer', FALSE, 3),
    ('Cheque', 'Cheque payment', FALSE, 4),
    ('Credit', 'Credit/Due payment', FALSE, 5);

INSERT IGNORE INTO sarga_tax_settings (name, rate, is_default, applies_to) VALUES
    ('GST 5%', 5, FALSE, 'all'),
    ('GST 12%', 12, FALSE, 'all'),
    ('GST 18%', 18, TRUE, 'all'),
    ('GST 28%', 28, FALSE, 'all'),
    ('No Tax', 0, FALSE, 'all');

INSERT IGNORE INTO sarga_company_settings (setting_key, setting_value) VALUES
    ('company_name', 'Sarga Digital Press'),
    ('company_address', ''),
    ('company_phone', ''),
    ('company_email', ''),
    ('company_gst', ''),
    ('company_logo_url', ''),
    ('invoice_prefix', 'INV'),
    ('invoice_footer_text', 'Thank you for your business!'),
    ('invoice_terms', 'Payment due within 30 days.'),
    ('default_currency', 'INR'),
    ('default_language', 'en');

ALTER TABLE sarga_customer_payments ADD COLUMN converted_from_quote INT DEFAULT NULL;

-- 5. Customer OTP & Website Chat
CREATE TABLE IF NOT EXISTS sarga_customer_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_website_chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(50),
    user_message TEXT,
    bot_response TEXT,
    rule_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. AI Anomaly Behaviour Profile
CREATE TABLE IF NOT EXISTS sarga_staff_behavior_profile (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT NOT NULL UNIQUE,
    avg_login_hour DECIMAL(5,2) DEFAULT 0,
    std_login_hour DECIMAL(5,2) DEFAULT 0,
    avg_discount_pct DECIMAL(5,2) DEFAULT 0,
    std_discount_pct DECIMAL(5,2) DEFAULT 0,
    avg_order_value DECIMAL(12,2) DEFAULT 0,
    std_order_value DECIMAL(12,2) DEFAULT 0,
    avg_daily_actions INT DEFAULT 0,
    std_daily_actions INT DEFAULT 0,
    known_devices TEXT,
    last_computed TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

-- 7. Inventory to Paper Inventory Mapping
CREATE TABLE IF NOT EXISTS sarga_inventory_to_paper_inventory (
  inventory_item_id INT NOT NULL,
  paper_item_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (inventory_item_id, paper_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Three Books System Tables
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
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS sarga_daily_expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    expense_description VARCHAR(200) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    payment_method ENUM('Cash', 'UPI', 'Both') DEFAULT 'Cash',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS sarga_machine_credit_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    movement_type ENUM('Cash In', 'Cash Out') NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES sarga_daily_report_machine(id) ON DELETE CASCADE
);

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
);

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
);

ALTER TABLE sarga_staff_attendance 
ADD COLUMN IF NOT EXISTS in_time TIME,
ADD COLUMN IF NOT EXISTS out_time TIME,
ADD COLUMN IF NOT EXISTS work_hours DECIMAL(4, 2);

ALTER TABLE sarga_jobs
ADD COLUMN IF NOT EXISTS entry_date DATE,
ADD COLUMN IF NOT EXISTS due_date_original DATE,
ADD COLUMN IF NOT EXISTS workbook_remarks TEXT,
ADD COLUMN IF NOT EXISTS priority ENUM('Low', 'Medium', 'High', 'Urgent') DEFAULT 'Medium';

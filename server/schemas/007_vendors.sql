-- Vendors, bills, and payments tables
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
);

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
);

CREATE TABLE IF NOT EXISTS sarga_vendor_bill_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  inventory_item_id INT NOT NULL,
  quantity DECIMAL(12, 2) NOT NULL,
  unit_cost DECIMAL(12, 2) NOT NULL,
  total_cost DECIMAL(12, 2) NOT NULL,
  FOREIGN KEY (bill_id) REFERENCES sarga_vendor_bills(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS sarga_utility_connections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  utility_type VARCHAR(150) NOT NULL,
  provider VARCHAR(200) DEFAULT NULL,
  billing_cycle VARCHAR(50) DEFAULT 'monthly',
  connection_id VARCHAR(100) NOT NULL,
  label VARCHAR(200),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_utility_connection (branch_id, utility_type, connection_id)
);

CREATE TABLE IF NOT EXISTS sarga_utility_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utility_type VARCHAR(150) NOT NULL,
  branch_id INT NOT NULL,
  bill_number VARCHAR(100),
  bill_date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  connection_id VARCHAR(100),
  connection_record_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_record_id) REFERENCES sarga_utility_connections(id) ON DELETE SET NULL
);

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
);

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
  category ENUM('offset_supplies','chemicals','paper','ink','equipment','frame','memento','id_card','other') DEFAULT 'other',
  credit_days INT DEFAULT 0,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_vendor_name (name)
);

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
);

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
);

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
  FOREIGN KEY (vendor_id) REFERENCES sarga_vendors(id) ON DELETE SET NULL,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_payment_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

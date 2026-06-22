-- Finance, EMI, Kuri, expenses, and daily report tables
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
);

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
);

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
);

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
);

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
);

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
);

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
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS sarga_invoice_sequence (
  id INT AUTO_INCREMENT PRIMARY KEY,
  financial_year VARCHAR(10) NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fy_prefix (financial_year, prefix)
);

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
);

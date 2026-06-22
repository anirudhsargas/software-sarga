-- Machines and daily production reporting
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
);

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
);

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
  created_by INT,
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
);

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
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (credit_customer_id) REFERENCES sarga_credit_customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  INDEX idx_customer_date (credit_customer_id, transaction_date)
);

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
);

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
);

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
);

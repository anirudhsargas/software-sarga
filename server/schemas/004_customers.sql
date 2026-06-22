-- Customer and payments tables
CREATE TABLE IF NOT EXISTS sarga_customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mobile VARCHAR(15) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('Walk-in', 'Retail', 'Offset') NOT NULL DEFAULT 'Walk-in',
  email VARCHAR(100),
  gst VARCHAR(20),
  address TEXT,
  branch_id INT,
  client_type VARCHAR(50) DEFAULT 'customer',
  internal_branch VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
);

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
);

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
);

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
);

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
);

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
);

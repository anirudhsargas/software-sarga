-- Jobs and related tables
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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS sarga_job_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  staff_id INT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

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
);

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
);

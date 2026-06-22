-- Core tables: branches, staff, job sequence
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
);

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
);

CREATE TABLE IF NOT EXISTS sarga_job_seq (
  branch_id INT,
  seq_date DATE,
  last_seq INT DEFAULT 0,
  PRIMARY KEY (branch_id, seq_date)
);

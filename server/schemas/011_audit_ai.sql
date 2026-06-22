-- Audit, AI, alerts, and security tables
CREATE TABLE IF NOT EXISTS sarga_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id_internal INT,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  reference_id INT,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_id_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id_internal INT NOT NULL,
  old_user_id VARCHAR(50) NOT NULL,
  new_user_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS sarga_ai_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cache_key VARCHAR(255) NOT NULL UNIQUE,
  cache_value JSON NOT NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_expense_training (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ocr_text TEXT NOT NULL,
  category VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_exp_train_category (category)
);

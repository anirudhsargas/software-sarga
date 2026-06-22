-- Staff salary, attendance, and scheduling tables
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
);

CREATE TABLE IF NOT EXISTS sarga_staff_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_name VARCHAR(150) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  branch_id INT,
  payment_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_staff_salary_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  payment_date DATETIME NOT NULL,
  payment_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(100),
  idempotency_key VARCHAR(100),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

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
);

CREATE TABLE IF NOT EXISTS sarga_staff_leave_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  `year_month` VARCHAR(7) NOT NULL,
  paid_leaves_used INT DEFAULT 0,
  unpaid_leaves_used INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  UNIQUE KEY unique_leave_balance (staff_id, `year_month`)
);

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
);

CREATE TABLE IF NOT EXISTS sarga_staff_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  schedule_name VARCHAR(100) NOT NULL DEFAULT 'General Shift',
  shift_start TIME NOT NULL DEFAULT '09:00:00',
  shift_end TIME NOT NULL DEFAULT '18:00:00',
  break_minutes INT NOT NULL DEFAULT 60,
  working_days VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6',
  effective_from DATE NOT NULL,
  effective_to DATE DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_staff_latetime (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  scheduled_start TIME NOT NULL,
  actual_start TIME NOT NULL,
  late_minutes INT NOT NULL DEFAULT 0,
  reason TEXT,
  excused TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  UNIQUE KEY unique_late (staff_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS sarga_staff_overtime (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  overtime_date DATE NOT NULL,
  scheduled_end TIME NOT NULL,
  actual_end TIME NOT NULL,
  overtime_minutes INT NOT NULL DEFAULT 0,
  overtime_type ENUM('Weekday', 'Weekend', 'Holiday') NOT NULL DEFAULT 'Weekday',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  approved_by INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_overtime (staff_id, overtime_date)
);

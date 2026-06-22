-- Bill Shortcuts feature (also in migrations/022_bill_shortcuts.sql)
CREATE TABLE IF NOT EXISTS bill_shortcuts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  product_id INT NULL,
  price DECIMAL(10,2) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'page',
  customer_type ENUM('walk_in','regular','credit') NOT NULL DEFAULT 'walk_in',
  payment_mode ENUM('cash','upi','card','credit') NOT NULL DEFAULT 'cash',
  icon_name VARCHAR(50) NOT NULL DEFAULT 'bolt',
  color VARCHAR(20) NOT NULL DEFAULT 'purple',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bill_shortcuts_branch (branch_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shortcut_suggestions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_branch_id INT NOT NULL,
  target_branch_id INT NOT NULL,
  shortcut_data JSON NOT NULL,
  suggested_by INT NOT NULL,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shortcut_suggestions_target (target_branch_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

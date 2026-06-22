-- Quick Shortcuts Table
CREATE TABLE IF NOT EXISTS sarga_quick_shortcuts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  display_name VARCHAR(150),
  category VARCHAR(100),
  subcategory VARCHAR(100),
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(50),
  branch_id INT DEFAULT NULL,
  status ENUM('active', 'inactive', 'archived') DEFAULT 'active',
  default_price DECIMAL(12,2) DEFAULT 0.00,
  pricing_mode ENUM('fixed', 'quantity', 'formula', 'tier', 'manual') DEFAULT 'fixed',
  pricing_formula TEXT,
  unit VARCHAR(20) DEFAULT 'pcs',
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  inventory_item_id INT DEFAULT NULL,
  expense_link VARCHAR(150),
  tags VARCHAR(255),
  auto_receipt BOOLEAN DEFAULT FALSE,
  auto_print BOOLEAN DEFAULT FALSE,
  auto_save BOOLEAN DEFAULT TRUE,
  auto_close BOOLEAN DEFAULT TRUE,
  keyboard_shortcut VARCHAR(20),
  sort_order INT DEFAULT 0,
  confirmation_required BOOLEAN DEFAULT FALSE,
  require_customer BOOLEAN DEFAULT FALSE,
  require_login_permission BOOLEAN DEFAULT FALSE,
  enable_offline BOOLEAN DEFAULT TRUE,
  enable_voice_trigger BOOLEAN DEFAULT TRUE,
  enable_barcode_trigger BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- Tier Pricing Configuration
CREATE TABLE IF NOT EXISTS sarga_quick_shortcut_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shortcut_id INT NOT NULL,
  min_qty DECIMAL(10,2) NOT NULL,
  max_qty DECIMAL(10,2),
  price DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (shortcut_id) REFERENCES sarga_quick_shortcuts(id) ON DELETE CASCADE
);

-- Usage Tracking for Analytics & Smart Suggestions
CREATE TABLE IF NOT EXISTS sarga_quick_shortcut_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shortcut_id INT NOT NULL,
  user_id INT NOT NULL,
  branch_id INT NOT NULL,
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_shortcut_user (shortcut_id, user_id, branch_id),
  FOREIGN KEY (shortcut_id) REFERENCES sarga_quick_shortcuts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

-- Role/Permission Overrides
CREATE TABLE IF NOT EXISTS sarga_quick_shortcut_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shortcut_id INT NOT NULL,
  role VARCHAR(50) NOT NULL,
  can_use BOOLEAN DEFAULT TRUE,
  can_edit_price BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (shortcut_id) REFERENCES sarga_quick_shortcuts(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_shortcut_role (shortcut_id, role)
);

-- Inventory and stock tables
CREATE TABLE IF NOT EXISTS sarga_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  sku VARCHAR(80) UNIQUE,
  category VARCHAR(80),
  unit VARCHAR(30) DEFAULT 'pcs',
  quantity INT DEFAULT 0,
  reorder_level INT DEFAULT 0,
  cost_price DECIMAL(10, 2) DEFAULT 0,
  sell_price DECIMAL(10, 2) DEFAULT 0,
  hsn VARCHAR(20),
  discount DECIMAL(5, 2) DEFAULT 0,
  gst_rate DECIMAL(5, 2) DEFAULT 0,
  source_code VARCHAR(3),
  model_name VARCHAR(100),
  size_code VARCHAR(100),
  item_type ENUM('Retail', 'Consumable') DEFAULT 'Retail',
  vendor_name VARCHAR(255),
  vendor_contact VARCHAR(255),
  purchase_link TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_stock_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  from_branch_id INT NOT NULL,
  to_branch_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'Pending',
  created_by INT NOT NULL,
  resolved_by INT DEFAULT NULL,
  resolved_at TIMESTAMP NULL,
  sent_by INT DEFAULT NULL,
  sent_at TIMESTAMP NULL,
  received_by INT DEFAULT NULL,
  received_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (from_branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (to_branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_branch_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  branch_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_item_branch (inventory_item_id, branch_id),
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_inventory_consumption (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  quantity_consumed DECIMAL(10, 2) NOT NULL,
  consumed_by_user_id INT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (consumed_by_user_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_inventory_reorders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  quantity_received DECIMAL(10, 2) NOT NULL,
  cost_price DECIMAL(10, 2) NOT NULL,
  days_since_last_reorder INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_stock_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month VARCHAR(7) NOT NULL,
  status ENUM('Draft', 'Completed') DEFAULT 'Draft',
  verified_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_month (month),
  FOREIGN KEY (verified_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_stock_verification_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  verification_id INT NOT NULL,
  inventory_item_id INT NOT NULL,
  system_quantity INT NOT NULL DEFAULT 0,
  physical_quantity INT DEFAULT NULL,
  notes VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY idx_ver_item (verification_id, inventory_item_id),
  FOREIGN KEY (verification_id) REFERENCES sarga_stock_verifications(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  status ENUM('pending', 'approved', 'ordered', 'received', 'cancelled') DEFAULT 'pending',
  total_estimated_cost DECIMAL(12, 2) DEFAULT 0,
  created_by INT DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_purchase_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT NOT NULL,
  inventory_item_id INT NOT NULL,
  suggested_qty DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(30) DEFAULT 'pcs',
  estimated_cost DECIMAL(10, 2) DEFAULT 0,
  vendor_name VARCHAR(255),
  urgency ENUM('immediate', 'this_week') DEFAULT 'this_week',
  FOREIGN KEY (purchase_order_id) REFERENCES sarga_purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);

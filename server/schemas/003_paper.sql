-- Paper inventory and consumables
CREATE TABLE IF NOT EXISTS sarga_paper_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paper_name VARCHAR(255) NOT NULL,
  size VARCHAR(50),
  gsm INT,
  ream_count INT DEFAULT 0,
  sheets_per_ream INT DEFAULT 500,
  total_sheets INT DEFAULT 0,
  reorder_level_reams INT DEFAULT 0,
  supplier_name VARCHAR(255),
  purchase_price_per_ream DECIMAL(10, 2) DEFAULT 0,
  branch ENUM('Perambra', 'Meppayur') NOT NULL,
  notes TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_paper_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paper_id INT NOT NULL,
  change_reams INT NOT NULL,
  reason VARCHAR(255),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_id) REFERENCES sarga_paper_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS paper_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category ENUM('LASER', 'OFFSET') NOT NULL,
  size_name VARCHAR(50) NOT NULL,
  width_mm DECIMAL(8,2),
  height_mm DECIMAL(8,2),
  gsm INT,
  brand VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_stock_movements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  paper_type_id INT NOT NULL,
  branch_id INT NOT NULL,
  movement_type ENUM('INWARD','OUTWARD','ADJUSTMENT','TRANSFER') NOT NULL,
  quantity INT NOT NULL,
  unit ENUM('SHEETS','REAMS','PACKETS') DEFAULT 'SHEETS',
  unit_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  reference_type ENUM('PURCHASE','JOB','WASTE','TRANSFER','OPENING'),
  reference_id INT,
  notes TEXT,
  moved_by INT,
  moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_type_id) REFERENCES paper_types(id),
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id)
);

CREATE TABLE IF NOT EXISTS paper_stock_summary (
  id INT PRIMARY KEY AUTO_INCREMENT,
  paper_type_id INT NOT NULL,
  branch_id INT NOT NULL,
  current_sheets INT DEFAULT 0,
  reorder_level INT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_paper_branch (paper_type_id, branch_id),
  FOREIGN KEY (paper_type_id) REFERENCES paper_types(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consumables_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category ENUM('ink', 'chemical', 'plate', 'spare_part', 'other') NOT NULL DEFAULT 'other',
  unit ENUM('litre', 'kg', 'piece', 'box', 'set') NOT NULL DEFAULT 'piece',
  quantity_in_stock DECIMAL(12, 3) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(12, 3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12, 2) DEFAULT 0,
  supplier_name VARCHAR(255),
  branch ENUM('Perambra', 'Meppayur') NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consumables_inventory_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consumable_id INT NOT NULL,
  quantity_delta DECIMAL(12, 3) NOT NULL,
  reason VARCHAR(255),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_paper_cut_map (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_inventory_item_id INT NOT NULL,
  child_size_code VARCHAR(100) NOT NULL,
  pieces_per_parent INT NOT NULL DEFAULT 1,
  loss_pct DECIMAL(5,2) DEFAULT 0,
  min_waste INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parent_child (parent_inventory_item_id, child_size_code),
  FOREIGN KEY (parent_inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);

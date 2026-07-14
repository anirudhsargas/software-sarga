-- ERP Enhancements: Multi-branch staff, Accountant restrictions, Consumables rate history

-- 1. Staff Branch Assignments (multi-branch)
CREATE TABLE IF NOT EXISTS staff_branch_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  branch_id INT NOT NULL,
  is_primary TINYINT(1) DEFAULT 0,
  permissions JSON DEFAULT NULL,
  assigned_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_branch (staff_id, branch_id),
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- 2. Enhance consumables_inventory with paper-like specs
ALTER TABLE consumables_inventory
  ADD COLUMN gsm INT DEFAULT NULL AFTER unit,
  ADD COLUMN size_name VARCHAR(50) DEFAULT NULL AFTER gsm,
  ADD COLUMN brand VARCHAR(100) DEFAULT NULL AFTER size_name,
  ADD COLUMN finish VARCHAR(50) DEFAULT NULL AFTER brand,
  ADD COLUMN color VARCHAR(50) DEFAULT NULL AFTER finish,
  ADD COLUMN supplier_id INT DEFAULT NULL AFTER supplier_name,
  ADD COLUMN sku VARCHAR(100) DEFAULT NULL AFTER notes,
  ADD COLUMN min_stock_level DECIMAL(12,3) DEFAULT NULL AFTER reorder_level,
  ADD COLUMN max_stock_level DECIMAL(12,3) DEFAULT NULL AFTER min_stock_level,
  ADD COLUMN location VARCHAR(100) DEFAULT NULL AFTER max_stock_level;

-- 3. Consumable Rate History / Versioning
CREATE TABLE IF NOT EXISTS consumable_rate_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consumable_id INT NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  supplier_name VARCHAR(255) DEFAULT NULL,
  supplier_id INT DEFAULT NULL,
  purchase_order_ref VARCHAR(100) DEFAULT NULL,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consumable_rate (consumable_id, effective_date DESC),
  FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- 4. Add current_rate_id to consumables_inventory (points to latest rate)
ALTER TABLE consumables_inventory
  ADD COLUMN current_rate_id INT DEFAULT NULL AFTER unit_cost,
  ADD FOREIGN KEY (current_rate_id) REFERENCES consumable_rate_history(id) ON DELETE SET NULL;

-- 5. Consumable Purchase History
CREATE TABLE IF NOT EXISTS consumable_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consumable_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  supplier_name VARCHAR(255) DEFAULT NULL,
  supplier_id INT DEFAULT NULL,
  purchase_date DATE NOT NULL,
  invoice_ref VARCHAR(100) DEFAULT NULL,
  branch_id INT DEFAULT NULL,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consumable_purchase (consumable_id, purchase_date DESC),
  FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- 6. Consumable Stock Adjustments - add new columns for better tracking
ALTER TABLE consumables_inventory_adjustments
  ADD COLUMN adjustment_type ENUM('INWARD','OUTWARD','WASTE','RETURN','TRANSFER') DEFAULT 'INWARD' AFTER consumable_id,
  ADD COLUMN branch_id INT DEFAULT NULL AFTER adjustment_type,
  ADD COLUMN reference_type VARCHAR(50) DEFAULT NULL AFTER reason,
  ADD COLUMN reference_id INT DEFAULT NULL AFTER reference_type,
  ADD FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL;

-- 7. Update paper_stock_movements to support TRANSFER_OUT and TRANSFER_IN
ALTER TABLE paper_stock_movements
  MODIFY COLUMN movement_type ENUM('INWARD','OUTWARD','ADJUSTMENT','TRANSFER','TRANSFER_OUT','TRANSFER_IN') NOT NULL;

-- 8. Add consumable_cost column to sarga_jobs
ALTER TABLE sarga_jobs
  ADD COLUMN consumable_cost DECIMAL(14,2) DEFAULT 0 AFTER paper_cost;

-- 9. Job consumables usage tracking
CREATE TABLE IF NOT EXISTS job_consumable_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  consumable_id INT NOT NULL,
  quantity_used DECIMAL(12,3) NOT NULL,
  rate_at_time DECIMAL(12,2) NOT NULL,
  total_cost DECIMAL(14,2) NOT NULL,
  unit VARCHAR(20) DEFAULT NULL,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_consumable (job_id, consumable_id),
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

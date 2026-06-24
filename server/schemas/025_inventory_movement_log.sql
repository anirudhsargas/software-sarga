-- Inventory movement log for branch-level stock tracking
CREATE TABLE IF NOT EXISTS sarga_inventory_movement_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  branch_id INT NOT NULL,
  movement_type ENUM('Transfer In', 'Transfer Out', 'Adjustment', 'Purchase', 'Consumption') NOT NULL,
  quantity_change DECIMAL(10, 2) NOT NULL,
  quantity_before DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quantity_after DECIMAL(10, 2) NOT NULL DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id INT,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  INDEX idx_item_branch (inventory_item_id, branch_id),
  INDEX idx_movement_type (movement_type),
  INDEX idx_created_at (created_at)
);

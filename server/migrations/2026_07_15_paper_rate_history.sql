-- Paper rate history tracking (mirrors consumable_rate_history)

CREATE TABLE IF NOT EXISTS paper_rate_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paper_type_id INT NOT NULL,
  rate DECIMAL(12, 2) NOT NULL,
  effective_date DATE NOT NULL,
  unit_type ENUM('Sheets', 'Reams', 'Packets') DEFAULT 'Reams',
  supplier_name VARCHAR(255),
  supplier_id INT,
  purchase_order_ref VARCHAR(255),
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_type_id) REFERENCES paper_types(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

ALTER TABLE paper_types
  ADD COLUMN current_rate_id INT DEFAULT NULL AFTER brand,
  ADD FOREIGN KEY (current_rate_id) REFERENCES paper_rate_history(id) ON DELETE SET NULL;

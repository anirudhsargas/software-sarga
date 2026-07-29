CREATE TABLE IF NOT EXISTS press_sheets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  width_mm DECIMAL(8,2) NOT NULL,
  height_mm DECIMAL(8,2) NOT NULL,
  gripper_margin_mm DECIMAL(6,2) DEFAULT 10,
  side_margin_mm DECIMAL(6,2) DEFAULT 5,
  branch_id INT NULL,
  is_active BOOLEAN DEFAULT 1,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS imposition_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  job_id INT NULL,
  press_sheet_id INT NOT NULL,
  trim_width_mm DECIMAL(8,2) NOT NULL,
  trim_height_mm DECIMAL(8,2) NOT NULL,
  bleed_mm DECIMAL(6,2) DEFAULT 3,
  gutter_mm DECIMAL(6,2) DEFAULT 4,
  orientation ENUM('portrait','landscape') NOT NULL,
  n_up INT NOT NULL,
  order_qty INT NOT NULL,
  sheets_required INT NOT NULL,
  yield_qty INT NOT NULL,
  spoilage_qty INT NOT NULL,
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (press_sheet_id) REFERENCES press_sheets(id),
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

INSERT INTO press_sheets (name, width_mm, height_mm, gripper_margin_mm, side_margin_mm) VALUES
('19x25 offset dummy', 482.6, 635, 10, 5),
('22x30 offset dummy', 558.8, 762, 10, 5),
('SRA3', 320, 450, 10, 5),
('SRA2', 450, 640, 10, 5),
('SRA1', 640, 900, 10, 5),
('A3', 297, 420, 10, 5),
('A2', 420, 594, 10, 5),
('13x19', 330, 483, 10, 5),
('12x18', 305, 457, 10, 5)
ON DUPLICATE KEY UPDATE name = VALUES(name);

CREATE TABLE IF NOT EXISTS cutting_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  paper_type_id INT NOT NULL,
  source_size_id INT NOT NULL,
  source_qty_sheets DECIMAL(10,2) NOT NULL,
  wastage_qty_sheets DECIMAL(10,2) DEFAULT 0,
  performed_by INT NOT NULL,
  notes VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (paper_type_id) REFERENCES paper_types(id) ON DELETE CASCADE,
  FOREIGN KEY (source_size_id) REFERENCES paper_types(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cutting_job_outputs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cutting_job_id INT NOT NULL,
  output_size_id INT NOT NULL,
  output_qty_sheets DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (cutting_job_id) REFERENCES cutting_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (output_size_id) REFERENCES paper_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_branch_id INT NOT NULL,
  to_branch_id INT NOT NULL,
  paper_type_id INT NOT NULL,
  size_id INT NOT NULL,
  qty_dispatched DECIMAL(10,2) NOT NULL,
  qty_received DECIMAL(10,2) NULL,
  status ENUM('dispatched','in_transit','received') DEFAULT 'dispatched',
  dispatched_by INT NOT NULL,
  received_by INT NULL,
  dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  received_at DATETIME NULL,
  FOREIGN KEY (from_branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (to_branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (paper_type_id) REFERENCES paper_types(id) ON DELETE CASCADE,
  FOREIGN KEY (size_id) REFERENCES paper_types(id) ON DELETE CASCADE,
  FOREIGN KEY (dispatched_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  FOREIGN KEY (received_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

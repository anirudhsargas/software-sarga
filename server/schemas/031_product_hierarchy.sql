-- Migration 031: Create product_hierarchy table
-- This table was missing from the database causing startup WARNING and potential 520 errors.
-- The table is checked at startup in server/index.js (SHOW TABLES LIKE 'product_hierarchy').

CREATE TABLE IF NOT EXISTS product_hierarchy (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100) DEFAULT NULL,
  item_type VARCHAR(100) DEFAULT NULL,
  display_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

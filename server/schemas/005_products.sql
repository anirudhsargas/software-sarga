-- Product hierarchy and products
CREATE TABLE IF NOT EXISTS sarga_product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  position INT NOT NULL DEFAULT 0,
  image_url LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_product_subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  image_url LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES sarga_product_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subcategory_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  product_code VARCHAR(80),
  company_name VARCHAR(100) DEFAULT NULL,
  company_code VARCHAR(50) DEFAULT NULL,
  size VARCHAR(30) DEFAULT NULL,
  calculation_type ENUM('Normal', 'Slab', 'Range') DEFAULT 'Normal',
  description TEXT,
  image_url LONGTEXT,
  has_paper_rate TINYINT(1) DEFAULT 0,
  paper_rate DECIMAL(10, 2) DEFAULT 0,
  has_double_side_rate TINYINT(1) DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  inventory_item_id INT DEFAULT NULL,
  is_physical_product TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (subcategory_id) REFERENCES sarga_product_subcategories(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_product_slabs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  min_qty DECIMAL(10,2) NOT NULL,
  max_qty DECIMAL(10,2),
  base_value DECIMAL(10,2) DEFAULT 0,
  unit_rate DECIMAL(10,2) DEFAULT 0,
  offset_unit_rate DECIMAL(10,2) DEFAULT 0,
  double_side_unit_rate DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_product_extras_template (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  purpose VARCHAR(150) NOT NULL,
  amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_product_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id_internal INT NOT NULL,
  entity_type ENUM('category', 'subcategory', 'product') NOT NULL,
  entity_id INT NOT NULL,
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_usage (user_id_internal, entity_type, entity_id),
  FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

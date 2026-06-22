-- Phase 1: Commerce & Dynamic Pricing
-- Auto-loaded on server startup

-- Product Finishes (lamination, UV, foil, embossing, binding)
CREATE TABLE IF NOT EXISTS product_finishes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'finish',
  description TEXT,
  unit_price DECIMAL(10,2) DEFAULT 0,
  price_type ENUM('per_unit','flat','per_sqinch') DEFAULT 'per_unit',
  is_active TINYINT(1) DEFAULT 1,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_category (category),
  KEY idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pricing Tiers (quantity-based pricing rules per product)
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  min_qty INT NOT NULL DEFAULT 1,
  max_qty INT DEFAULT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  gst_rate DECIMAL(5,2) DEFAULT 18.00,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE,
  KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pricing Rules (size, GSM, paper type combinations)
CREATE TABLE IF NOT EXISTS pricing_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  size_name VARCHAR(100),
  size_width_mm DECIMAL(8,2),
  size_height_mm DECIMAL(8,2),
  gsm INT,
  paper_type VARCHAR(100),
  color_count INT DEFAULT 0,
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  min_qty INT DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE,
  KEY idx_product (product_id),
  KEY idx_size (size_name),
  KEY idx_gsm (gsm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product-Finish mapping (which finishes apply to which products)
CREATE TABLE IF NOT EXISTS product_finish_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  finish_id INT NOT NULL,
  is_default TINYINT(1) DEFAULT 0,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE,
  FOREIGN KEY (finish_id) REFERENCES product_finishes(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_mapping (product_id, finish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Server-side Cart
CREATE TABLE IF NOT EXISTS sarga_carts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  session_id VARCHAR(100),
  branch_id INT DEFAULT NULL,
  coupon_code VARCHAR(50),
  discount_amount DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) DEFAULT 0,
  gst_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  status ENUM('active','abandoned','converted','expired') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  KEY idx_customer (customer_id),
  KEY idx_session (session_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sarga_cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cart_id INT NOT NULL,
  product_id INT,
  product_name VARCHAR(255),
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  size VARCHAR(100),
  gsm INT,
  paper_type VARCHAR(100),
  color_count INT DEFAULT 0,
  finishes JSON,
  design_file_url TEXT,
  design_notes TEXT,
  line_total DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cart_id) REFERENCES sarga_carts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE SET NULL,
  KEY idx_cart (cart_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orders (from website checkout)
CREATE TABLE IF NOT EXISTS sarga_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id INT,
  customer_name VARCHAR(150),
  customer_phone VARCHAR(20),
  customer_email VARCHAR(100),
  branch_id INT,
  cart_id INT,
  items JSON,
  subtotal DECIMAL(10,2) DEFAULT 0,
  gst_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  delivery_charges DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  advance_paid DECIMAL(10,2) DEFAULT 0,
  balance_amount DECIMAL(10,2) DEFAULT 0,
  payment_method ENUM('full','partial') DEFAULT 'full',
  payment_status ENUM('pending','partial','completed','refunded') DEFAULT 'pending',
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  gst_number VARCHAR(50),
  billing_address TEXT,
  delivery_address TEXT,
  delivery_method ENUM('pickup','courier') DEFAULT 'pickup',
  pickup_slot_id INT,
  status ENUM('pending','confirmed','processing','ready','completed','cancelled') DEFAULT 'pending',
  proof_approved TINYINT(1) DEFAULT 0,
  preflight_passed TINYINT(1) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (cart_id) REFERENCES sarga_carts(id) ON DELETE SET NULL,
  KEY idx_customer (customer_id),
  KEY idx_order_number (order_number),
  KEY idx_status (status),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment Transactions
CREATE TABLE IF NOT EXISTS sarga_payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_signature VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status ENUM('created','captured','failed','refunded') DEFAULT 'created',
  method VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES sarga_orders(id) ON DELETE SET NULL,
  KEY idx_razorpay_order (razorpay_order_id),
  KEY idx_razorpay_payment (razorpay_payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Express Production eligibility
CREATE TABLE IF NOT EXISTS express_production_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT,
  product_category VARCHAR(100),
  turnaround_3hr TINYINT(1) DEFAULT 0,
  turnaround_today TINYINT(1) DEFAULT 0,
  turnaround_tomorrow TINYINT(1) DEFAULT 0,
  max_qty_3hr INT DEFAULT 10,
  max_qty_today INT DEFAULT 50,
  max_qty_tomorrow INT DEFAULT 200,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE,
  KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B2B Company Profiles
CREATE TABLE IF NOT EXISTS sarga_business_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  company_name VARCHAR(200),
  gst_number VARCHAR(50),
  pan_number VARCHAR(20),
  contact_person VARCHAR(150),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100) DEFAULT 'Kerala',
  pincode VARCHAR(10),
  credit_limit DECIMAL(12,2) DEFAULT 0,
  credit_days INT DEFAULT 30,
  is_verified TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_customer (customer_id),
  KEY idx_gst (gst_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Brand Assets Library
CREATE TABLE IF NOT EXISTS sarga_brand_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_profile_id INT,
  customer_id INT,
  asset_type ENUM('logo','font','color','template') NOT NULL,
  name VARCHAR(200),
  file_url TEXT,
  color_hex VARCHAR(7),
  font_name VARCHAR(100),
  font_file_url TEXT,
  template_data JSON,
  is_locked TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_profile_id) REFERENCES sarga_business_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
  KEY idx_business (business_profile_id),
  KEY idx_type (asset_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Delivery Tracking
CREATE TABLE IF NOT EXISTS sarga_delivery_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  job_id INT,
  courier_name VARCHAR(100),
  tracking_number VARCHAR(100),
  tracking_url TEXT,
  status ENUM('dispatched','in_transit','out_for_delivery','delivered','exception') DEFAULT 'dispatched',
  estimated_delivery DATE,
  delivered_at TIMESTAMP NULL,
  last_checked TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES sarga_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE SET NULL,
  KEY idx_tracking (tracking_number),
  KEY idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed product finishes
INSERT IGNORE INTO product_finishes (name, category, description, unit_price, price_type) VALUES
('Matte Lamination', 'lamination', 'Soft matte finish coating', 0.50, 'per_unit'),
('Glossy Lamination', 'lamination', 'Shiny glossy finish coating', 0.50, 'per_unit'),
('Gold Foil Stamping', 'foil', 'Premium hot gold foil stamping', 2.00, 'per_unit'),
('Silver Foil Stamping', 'foil', 'Elegant silver hot foil stamping', 2.00, 'per_unit'),
('Spot UV Coating', 'uv', 'High-gloss spot UV highlights', 1.50, 'per_unit'),
('Embossing', 'embossing', 'Raised 3D embossed effect', 3.00, 'per_unit'),
('Debossing', 'embossing', 'Indented debossed effect', 3.00, 'per_unit'),
('Spiral Binding', 'binding', 'Metal spiral wire binding', 15.00, 'flat'),
('Perfect Binding', 'binding', 'Professional glued perfect binding', 25.00, 'flat'),
('Saddle Stitching', 'binding', 'Stapled saddle stitch binding', 5.00, 'flat');

-- Seed express production rules
INSERT IGNORE INTO express_production_rules (product_category, turnaround_3hr, turnaround_today, turnaround_tomorrow, max_qty_3hr, max_qty_today, max_qty_tomorrow) VALUES
('Business Cards', 1, 1, 1, 100, 500, 2000),
('ID Cards', 1, 1, 1, 50, 200, 1000),
('Flyers', 0, 1, 1, 0, 200, 1000),
('Rubber Stamps', 1, 1, 1, 10, 50, 200),
('Banners', 0, 1, 1, 0, 10, 50),
('Certificates', 1, 1, 1, 100, 500, 2000);

-- Website/Google Reviews Table
CREATE TABLE IF NOT EXISTS sarga_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reviewer_name VARCHAR(150) NOT NULL,
  profile_image_url VARCHAR(255) DEFAULT '',
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  review_date TIMESTAMP NULL DEFAULT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  google_review_id VARCHAR(255) UNIQUE DEFAULT NULL,
  is_featured TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_active (is_active),
  KEY idx_featured (is_featured),
  KEY idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Website Inquiries Table
CREATE TABLE IF NOT EXISTS sarga_website_inquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100) DEFAULT NULL,
  service VARCHAR(100) DEFAULT NULL,
  message TEXT NOT NULL,
  branch VARCHAR(50) DEFAULT 'Perambra',
  status ENUM('New', 'Contacted', 'Closed') DEFAULT 'New',
  internal_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status (status),
  KEY idx_branch (branch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


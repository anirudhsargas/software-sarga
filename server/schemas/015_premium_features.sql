-- Schema for Sarga Premium Phase 2 Modules: Sample Requests & Design Consultation Booking

CREATE TABLE IF NOT EXISTS sarga_print_samples (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL, -- 'Paper Stock', 'Special Finish', 'Business Card Materials'
  description TEXT DEFAULT NULL,
  stock_quantity INT DEFAULT 50,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_print_sample_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(100) DEFAULT NULL,
  delivery_method ENUM('Pickup', 'Courier') NOT NULL DEFAULT 'Pickup',
  branch_id INT DEFAULT NULL, -- Link to sarga_branches
  address_line1 VARCHAR(255) DEFAULT NULL,
  address_line2 VARCHAR(255) DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  state VARCHAR(100) DEFAULT 'Kerala',
  pincode VARCHAR(10) DEFAULT NULL,
  status ENUM('Pending', 'Approved', 'Dispatched', 'Ready for Pickup', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  tracking_number VARCHAR(100) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_print_sample_request_items (
  request_id INT NOT NULL,
  sample_id INT NOT NULL,
  PRIMARY KEY (request_id, sample_id),
  FOREIGN KEY (request_id) REFERENCES sarga_print_sample_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (sample_id) REFERENCES sarga_print_samples(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_design_consultations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(100) DEFAULT NULL,
  consultation_type VARCHAR(100) NOT NULL, -- 'Wedding Card Design', 'Memento Design', 'Business Branding', 'Brochure Design', 'Invitation Design', 'Custom Printing Projects'
  meeting_mode ENUM('WhatsApp Call', 'Phone Call', 'Google Meet', 'In-Person') NOT NULL DEFAULT 'Phone Call',
  preferred_branch_id INT DEFAULT NULL, -- Link to sarga_branches
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration INT NOT NULL DEFAULT 15, -- in minutes (15, 30)
  assigned_staff_id INT DEFAULT NULL, -- Link to sarga_staff
  status ENUM('Pending', 'Confirmed', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  notes TEXT DEFAULT NULL,
  quote_issued TINYINT(1) DEFAULT 0, -- CRM Conversion: was a follow-up quote generated?
  quote_amount DECIMAL(12,2) DEFAULT NULL, -- CRM Conversion: quote amount in rupees
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (preferred_branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- Pre-seed default samples if empty
INSERT INTO sarga_print_samples (name, category, description)
SELECT '250 GSM Metallic Gold Board', 'Paper Stock', 'Sparkling luxury metallic gold texture, perfect for premium wedding card leaflets.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = '250 GSM Metallic Gold Board');

INSERT INTO sarga_print_samples (name, category, description)
SELECT '300 GSM Textured Ivory Board', 'Paper Stock', 'Elegant soft cream textured surface, standard choice for premium corporate invitations.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = '300 GSM Textured Ivory Board');

INSERT INTO sarga_print_samples (name, category, description)
SELECT '350 GSM Art Card (Matte)', 'Paper Stock', 'Heavy duty, ultra-smooth premium art board, highly popular for premium visiting cards.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = '350 GSM Art Card (Matte)');

INSERT INTO sarga_print_samples (name, category, description)
SELECT '280 GSM Kraft Board (Rustic)', 'Paper Stock', 'Eco-friendly, textured brown vintage board, highly choice for rustic event themes.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = '280 GSM Kraft Board (Rustic)');

INSERT INTO sarga_print_samples (name, category, description)
SELECT 'Hot Foil Stamping (Gold Finish)', 'Special Finish', 'Stunning shiny gold foil finish under heat pressure, adds majestic borders.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = 'Hot Foil Stamping (Gold Finish)');

INSERT INTO sarga_print_samples (name, category, description)
SELECT 'Blind Embossing Detail Sample', 'Special Finish', 'Highly detailed raised textures creating 3D card borders without ink.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = 'Blind Embossing Detail Sample');

INSERT INTO sarga_print_samples (name, category, description)
SELECT 'Spot UV Coating Highlights', 'Special Finish', 'Dramatic glossy contrasts overlaying a soft matte base surface.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = 'Spot UV Coating Highlights');


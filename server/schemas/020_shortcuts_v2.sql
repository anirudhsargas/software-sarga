-- Shortcuts Templates Table
CREATE TABLE IF NOT EXISTS sarga_shortcut_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type ENUM('product', 'customer', 'payment', 'full_transaction') NOT NULL,
  payload JSON NOT NULL,
  icon VARCHAR(50) DEFAULT 'Zap',
  shortcut_key VARCHAR(20) DEFAULT NULL,
  usage_count INT DEFAULT 0,
  isPinned BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Shortcuts Usage Tracking Table
CREATE TABLE IF NOT EXISTS sarga_shortcut_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shortcut_id INT NOT NULL,
  user_id INT NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shortcut_id) REFERENCES sarga_shortcut_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

-- Shortcuts Categories Table
CREATE TABLE IF NOT EXISTS sarga_shortcut_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

-- Insert default categories if not exist
INSERT IGNORE INTO sarga_shortcut_categories (name) VALUES 
('Photostat'),
('Customer'),
('Payment'),
('Printout'),
('Lamination'),
('ID Card');

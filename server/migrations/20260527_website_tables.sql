-- Sarga Website Database Tables Migration
-- 2026-05-27

-- Chat Messages Table (for analytics)
CREATE TABLE IF NOT EXISTS sarga_website_chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL,
  user_message VARCHAR(500),
  bot_response TEXT,
  rule_id VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_uuid (uuid),
  KEY idx_created (created_at)
);

-- Cart/Quote Inquiries Table
CREATE TABLE IF NOT EXISTS sarga_website_cart_inquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL,
  customer_name VARCHAR(100),
  phone VARCHAR(15),
  email VARCHAR(100),
  branch VARCHAR(20),
  items_json JSON,
  status ENUM('new','viewed','quoted','closed') DEFAULT 'new',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_uuid (uuid),
  KEY idx_status (status),
  KEY idx_created (created_at)
);

-- FAQ Knowledge Base (for future expansion)
CREATE TABLE IF NOT EXISTS sarga_website_faq_knowledge_base (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(500) NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT KEY ft_question (question),
  FULLTEXT KEY ft_answer (answer)
);

-- Client Logs Table
CREATE TABLE IF NOT EXISTS sarga_website_client_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36),
  message VARCHAR(500),
  error_message TEXT,
  url VARCHAR(500),
  ip_address VARCHAR(45),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_uuid (uuid),
  KEY idx_created (created_at)
);

-- Insert sample FAQ data
INSERT INTO sarga_website_faq_knowledge_base (question, answer, category) VALUES
('Where is Sarga Prints located?', 'We have two branches: Perambra (customer hub) and Meppayur (offset production), both in Kozhikode District, Kerala, India.', 'contact'),
('How do I track my order?', 'Visit sarga.in/track and enter your job code (e.g., PBA-20260527-001) to see real-time status.', 'tracking'),
('Does Sarga do wedding card printing?', 'Yes! We offer custom wedding card printing with offset and digital printing options, die-cutting, and lamination finishes.', 'services'),
('What are your working hours?', 'We are open Monday to Saturday, 9:00 AM to 7:00 PM IST. Closed on Sundays and public holidays.', 'contact'),
('What types of printing do you offer?', 'Offset printing (large volumes), digital/laser printing (short runs), photostat, flex/poly banner printing, lamination, binding, die-cutting, and more.', 'services'),
('Can you do visiting card printing?', 'Yes, we specialize in premium visiting card printing with various finishes, colors, and materials.', 'services'),
('How much does printing cost?', 'Pricing depends on quantity, paper type, color, and printing method. Request a free quote at sarga.in/contact.', 'pricing'),
('How do I request a quote?', 'Visit sarga.in/contact, fill the form, or call us directly. You can also use our quote cart feature to add services and submit.', 'contact')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

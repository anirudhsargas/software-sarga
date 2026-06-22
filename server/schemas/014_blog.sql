-- Schema for Sarga Blog System

CREATE TABLE IF NOT EXISTS sarga_blog_authors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'Writer',
  bio TEXT DEFAULT NULL,
  avatar_url LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_blog_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  excerpt TEXT NOT NULL,
  content LONGTEXT NOT NULL,
  featured_image LONGTEXT DEFAULT NULL,
  category VARCHAR(100) NOT NULL,
  tags VARCHAR(255) DEFAULT NULL, -- Comma-separated list of tags
  author_id INT DEFAULT NULL,
  status ENUM('Draft', 'Published', 'Scheduled') NOT NULL DEFAULT 'Draft',
  scheduled_at TIMESTAMP NULL DEFAULT NULL,
  views INT DEFAULT 0,
  read_time INT NOT NULL DEFAULT 3, -- Estimated minutes
  seo_title VARCHAR(255) DEFAULT NULL,
  seo_description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES sarga_blog_authors(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_blog_analytics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'view', 'share_facebook', 'share_whatsapp', etc.
  user_agent VARCHAR(255) DEFAULT NULL,
  ip_hash VARCHAR(64) NOT NULL, -- SHA256 anonymized ip
  referrer VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES sarga_blog_posts(id) ON DELETE CASCADE
);

-- Pre-seed default author if empty
INSERT INTO sarga_blog_authors (id, name, role, bio)
SELECT 1, 'Sarga Editorial Team', 'Printing & Design Experts', 'Educating Kozhikode and all of Kerala on wedding finishes, document standards, and corporate brand styling for over 30 years.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_blog_authors WHERE id = 1);


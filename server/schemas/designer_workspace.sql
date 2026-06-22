CREATE TABLE IF NOT EXISTS sarga_design_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_name VARCHAR(255) NOT NULL,
    version INT DEFAULT 1,
    preview_url LONGTEXT,
    drive_link TEXT,
    internal_path TEXT,
    final_pdf_url TEXT,
    ai_design_url TEXT,
    editable_source_url TEXT,
    tags JSON,
    uploaded_by INT NOT NULL,
    is_archived TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_design_bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    due_date DATE,
    assigned_designer INT DEFAULT NULL,
    priority ENUM('Low', 'Normal', 'High', 'Urgent') DEFAULT 'Normal',
    status ENUM('Requested', 'Assigned', 'Designing', 'Review', 'Approved', 'Printed', 'Delivered') DEFAULT 'Requested',
    reference_files JSON,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_designer) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_block_journal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    block_number VARCHAR(100) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    block_type VARCHAR(50),
    created_by INT NOT NULL,
    assigned_to INT DEFAULT NULL,
    location VARCHAR(255),
    reuse_status ENUM('New', 'Reused', 'Archived') DEFAULT 'New',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- Basic CMS Tables
CREATE TABLE IF NOT EXISTS sarga_cms_banners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    image_url LONGTEXT NOT NULL,
    link_url TEXT,
    is_active TINYINT(1) DEFAULT 1,
    position INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_cms_announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    expires_at DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

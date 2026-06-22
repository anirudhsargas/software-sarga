CREATE TABLE IF NOT EXISTS sarga_user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id_internal INT NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    refresh_token VARCHAR(255) DEFAULT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_revoked TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_security_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id_internal INT,
    event_type VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

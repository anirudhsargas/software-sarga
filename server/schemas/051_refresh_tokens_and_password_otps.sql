CREATE TABLE IF NOT EXISTS sarga_refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  remember_me TINYINT(1) NOT NULL DEFAULT 1,
  expires_at DATETIME NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  revoked_at DATETIME NULL,
  replaced_by_id INT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_staff (staff_id)
);

CREATE TABLE IF NOT EXISTS sarga_password_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  otp_hash CHAR(64) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'change_password',
  attempts INT NOT NULL DEFAULT 0,
  used TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_password_otps_staff (staff_id, purpose)
);

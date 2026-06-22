-- Schema for Daily Book Automation System

CREATE TABLE IF NOT EXISTS sarga_daily_report_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  is_enabled TINYINT(1) DEFAULT 1,
  send_time TIME DEFAULT '20:00:00',
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  days_of_week VARCHAR(20) DEFAULT '1,2,3,4,5,6', -- 1=Mon, 6=Sat
  recipients_admin TEXT DEFAULT NULL,
  recipients_accounts TEXT DEFAULT NULL,
  recipients_cc TEXT DEFAULT NULL,
  recipients_bcc TEXT DEFAULT NULL,
  branch_overrides JSON DEFAULT NULL, -- { "Perambra": "branch1@sarga.com", "Meppayur": "branch2@sarga.com" }
  format_pdf TINYINT(1) DEFAULT 1,
  format_excel TINYINT(1) DEFAULT 1,
  format_html TINYINT(1) DEFAULT 1,
  retry_enabled TINYINT(1) DEFAULT 1,
  max_retries INT DEFAULT 3,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_daily_report_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  status ENUM('Running', 'Success', 'Failed', 'Retrying') NOT NULL DEFAULT 'Running',
  recipients TEXT DEFAULT NULL,
  file_url_pdf VARCHAR(255) DEFAULT NULL,
  file_url_excel VARCHAR(255) DEFAULT NULL,
  error TEXT DEFAULT NULL,
  retry_count INT DEFAULT 0,
  execution_ms INT DEFAULT NULL
);

-- Pre-seed default settings
INSERT INTO sarga_daily_report_settings (is_enabled, send_time, timezone)
SELECT 1, '20:00:00', 'Asia/Kolkata'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_daily_report_settings);

CREATE TABLE IF NOT EXISTS sarga_backup_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  triggered_by ENUM('cron', 'manual') NOT NULL DEFAULT 'cron',
  status ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  tables_backed_up INT DEFAULT 0,
  rows_written INT DEFAULT 0,
  error_message TEXT NULL
);

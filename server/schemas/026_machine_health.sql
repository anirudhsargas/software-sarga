ALTER TABLE sarga_machines ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMP NULL;
ALTER TABLE sarga_machines ADD COLUMN IF NOT EXISTS health_status ENUM('healthy', 'warning', 'critical', 'unknown') DEFAULT 'unknown';
ALTER TABLE sarga_machines ADD COLUMN IF NOT EXISTS last_meter_value INT DEFAULT NULL;
ALTER TABLE sarga_machine_readings ADD COLUMN IF NOT EXISTS sync_source ENUM('manual', 'mpr', 'auto') DEFAULT 'manual';
ALTER TABLE sarga_machine_readings ADD COLUMN IF NOT EXISTS sync_timestamp TIMESTAMP NULL;

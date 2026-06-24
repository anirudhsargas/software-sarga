ALTER TABLE sarga_machines ADD COLUMN last_polled_at TIMESTAMP NULL;
ALTER TABLE sarga_machines ADD COLUMN health_status ENUM('healthy', 'warning', 'critical', 'unknown') DEFAULT 'unknown';
ALTER TABLE sarga_machines ADD COLUMN last_meter_value INT DEFAULT NULL;
ALTER TABLE sarga_machine_readings ADD COLUMN sync_source ENUM('manual', 'mpr', 'auto') DEFAULT 'manual';
ALTER TABLE sarga_machine_readings ADD COLUMN sync_timestamp TIMESTAMP NULL;

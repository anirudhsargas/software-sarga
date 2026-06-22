-- Drop stale FK constraints pointing to sarga_vendors (old table)
-- These prevent using the unified `vendors` table for new vendor records.
-- Application logic already handles referential integrity via dual-write.

DROP PROCEDURE IF EXISTS drop_fk_if_exists;
DELIMITER $$
CREATE PROCEDURE drop_fk_if_exists()
BEGIN
  DECLARE _count INT;

  SELECT COUNT(*) INTO _count FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sarga_vendor_bills'
      AND CONSTRAINT_NAME = 'sarga_vendor_bills_ibfk_1';
  IF _count > 0 THEN
    SET @sql = 'ALTER TABLE sarga_vendor_bills DROP FOREIGN KEY sarga_vendor_bills_ibfk_1';
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;

  SELECT COUNT(*) INTO _count FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sarga_payments'
      AND CONSTRAINT_NAME = 'sarga_payments_ibfk_2';
  IF _count > 0 THEN
    SET @sql = 'ALTER TABLE sarga_payments DROP FOREIGN KEY sarga_payments_ibfk_2';
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;
CALL drop_fk_if_exists();
DROP PROCEDURE IF EXISTS drop_fk_if_exists;

-- Ensure plain indexes exist for performance (replaces FK index)
SET @idx1 = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sarga_vendor_bills' AND INDEX_NAME = 'idx_svb_vendor_id');
SET @sql1 = IF(@idx1 = 0, 'CREATE INDEX idx_svb_vendor_id ON sarga_vendor_bills (vendor_id)', 'SELECT 1');
PREPARE stmt1 FROM @sql1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @idx2 = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sarga_payments' AND INDEX_NAME = 'idx_sp_vendor_id');
SET @sql2 = IF(@idx2 = 0, 'CREATE INDEX idx_sp_vendor_id ON sarga_payments (vendor_id)', 'SELECT 1');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

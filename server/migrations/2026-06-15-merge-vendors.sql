-- Merge sarga_vendors into primary vendors table
-- 1. Add expense-specific columns to vendors table
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS type ENUM('Vendor','Utility','Salary','Rent','Other') NOT NULL DEFAULT 'Vendor' AFTER vendor_code,
  ADD COLUMN IF NOT EXISTS branch_id INT DEFAULT NULL AFTER city,
  ADD COLUMN IF NOT EXISTS order_link TEXT AFTER branch_id;

-- 2. Copy existing sarga_vendors into vendors (skip duplicates by name)
INSERT IGNORE INTO vendors (name, contact_person, phone, gstin, address, branch_id, type)
  SELECT name, contact_person, phone, gstin, address, branch_id, type
  FROM sarga_vendors;

-- 3. Add index on branch_id for join perf
CREATE INDEX IF NOT EXISTS idx_vendors_branch_id ON vendors (branch_id);

-- 4. Update FK on sarga_vendor_bills to point to vendors table
-- (requires dropping old FK first)
SET @fk_name = (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_NAME = 'sarga_vendor_bills' AND COLUMN_NAME = 'vendor_id'
    AND REFERENCED_TABLE_NAME = 'sarga_vendors' LIMIT 1);
SET @drop_fk = IF(@fk_name IS NOT NULL, CONCAT('ALTER TABLE sarga_vendor_bills DROP FOREIGN KEY ', @fk_name), 'SELECT 1');
PREPARE stmt FROM @drop_fk; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE sarga_vendor_bills ADD CONSTRAINT fk_vendor_bills_vendor
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;

-- 5. Update FK on sarga_payments to point to vendors table
SET @fk_name2 = (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_NAME = 'sarga_payments' AND COLUMN_NAME = 'vendor_id'
    AND REFERENCED_TABLE_NAME = 'sarga_vendors' LIMIT 1);
SET @drop_fk2 = IF(@fk_name2 IS NOT NULL, CONCAT('ALTER TABLE sarga_payments DROP FOREIGN KEY ', @fk_name2), 'SELECT 1');
PREPARE stmt2 FROM @drop_fk2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
ALTER TABLE sarga_payments ADD CONSTRAINT fk_payments_vendor
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

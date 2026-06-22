-- Migration: map existing 'Association' customer type to 'Retail'
-- Recommended: run a DB backup before applying.

-- 1) Update existing customer records
UPDATE customers
SET `type` = 'Retail'
WHERE `type` = 'Association';

-- 2) If using MySQL/MariaDB, change the enum definition to remove 'Association'
ALTER TABLE customers
MODIFY COLUMN `type` ENUM('Walk-in','Retail','Offset') NOT NULL DEFAULT 'Walk-in';

-- Notes:
-- - If your DB uses a different table/column name, adjust accordingly.
-- - Some DBs (Postgres) store enums separately; for Postgres you'd create a new enum type without 'Association', cast, and drop the old type.
-- - Test in a staging environment first.

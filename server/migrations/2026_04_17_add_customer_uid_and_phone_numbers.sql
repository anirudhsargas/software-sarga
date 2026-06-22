-- Migration: 2026-04-17
-- Add `customer_uid` to `sarga_customers` and create `phone_numbers` table.
-- IMPORTANT: Backup your database before running this script.

/*
  Usage:
    Run this SQL after taking a DB backup. The inserted phone_numbers rows
    contain `number_raw` only; run the backfill script to populate `number_e164`.
*/

-- 1) Add a UUID surrogate column for customers
ALTER TABLE sarga_customers
  ADD COLUMN customer_uid VARCHAR(36) DEFAULT NULL;

-- 2) Populate customer_uid for existing rows
UPDATE sarga_customers
  SET customer_uid = UUID()
  WHERE customer_uid IS NULL OR customer_uid = '';

-- 3) Make column NOT NULL and add a unique index
ALTER TABLE sarga_customers
  MODIFY COLUMN customer_uid VARCHAR(36) NOT NULL;

ALTER TABLE sarga_customers
  ADD UNIQUE INDEX ux_customer_uid (customer_uid);

-- 4) Create phone_numbers table to hold multiple numbers per customer
CREATE TABLE IF NOT EXISTS phone_numbers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  number_raw VARCHAR(255) NOT NULL,
  number_e164 VARCHAR(64) DEFAULT NULL,
  country_code VARCHAR(16) DEFAULT NULL,
  is_primary TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_phone_customer (customer_id),
  INDEX idx_phone_e164 (number_e164)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Seed phone_numbers from existing customers.mobile values (legacy)
INSERT INTO phone_numbers (customer_id, number_raw, is_primary)
SELECT id, mobile, 1
FROM sarga_customers
WHERE mobile IS NOT NULL AND TRIM(mobile) <> '';

-- Note: Do not add a UNIQUE constraint on number_e164 yet. Run the backfill
-- script to populate `number_e164`, inspect conflicts in
-- `server/migrations/phone_conflicts_2026_04_17.json`, resolve duplicates,
-- then add unique indexes as a follow-up migration.

COMMIT;
-- Migration: Add stable customer_uid and separate phone_numbers table
-- Run steps (safe order):
-- 1) BACKUP your database.
-- 2) Run this SQL file to create schema changes.
-- 3) Run `node server/scripts/backfill_phone_numbers.js` to populate `phone_numbers.number_e164` using libphonenumber.
-- 4) Review conflicts reported by the script, resolve manually, then mark records as primary.

-- NOTE: This migration preserves existing numeric primary keys (`id`) and adds
-- a stable `customer_uid` (UUID) for external/internal usage. This is less
-- invasive than replacing the numeric PK and allows gradual code changes.

-- 1) add nullable UUID column
ALTER TABLE sarga_customers
  ADD COLUMN customer_uid CHAR(36) NULL;

-- 2) populate UUIDs for existing rows (UUID() is evaluated per-row)
UPDATE sarga_customers SET customer_uid = UUID() WHERE customer_uid IS NULL;

-- 3) make the column required and add a unique index
ALTER TABLE sarga_customers
  MODIFY COLUMN customer_uid CHAR(36) NOT NULL;
ALTER TABLE sarga_customers
  ADD UNIQUE KEY ux_customers_customer_uid (customer_uid);

-- 4) Create phone_numbers table (store raw + normalized E.164)
CREATE TABLE IF NOT EXISTS phone_numbers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  number_raw VARCHAR(50) NOT NULL,
  number_e164 VARCHAR(50) DEFAULT NULL,
  country_code VARCHAR(8) DEFAULT NULL,
  `type` ENUM('primary','billing','whatsapp','other') DEFAULT 'primary',
  is_primary TINYINT(1) DEFAULT 0,
  verified_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone_customer (customer_id),
  UNIQUE KEY ux_phone_numbers_e164 (number_e164)
);

-- 5) foreign key (optional; remove if you prefer loose coupling during migration)
ALTER TABLE phone_numbers
  ADD CONSTRAINT fk_phone_numbers_customer FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE;

-- 6) Seed phone_numbers with existing customer.mobile values (raw only).
-- Normalization to E.164 will be done by the Node backfill script below.
INSERT INTO phone_numbers (customer_id, number_raw, is_primary, created_at)
SELECT id, mobile, 1, NOW()
FROM sarga_customers
WHERE mobile IS NOT NULL AND TRIM(mobile) != '';

-- End of migration SQL

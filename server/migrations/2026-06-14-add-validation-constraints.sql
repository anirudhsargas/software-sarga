-- Migration: Add missing unique indexes and constraints for data integrity
-- Date: 2026-06-14
-- Purpose: Prevent duplicate GST, email, phone, vendor_code, SKU at DB level

-- 1. Add unique index on sarga_vendors.gstin (if not already unique)
-- Note: Only add if column exists and doesn't have duplicates
-- ALTER TABLE sarga_vendors ADD UNIQUE INDEX idx_vendors_gstin (gstin) WHERE gstin IS NOT NULL;

-- 2. Add unique index on sarga_customers.email (nullable-aware)
-- Note: MySQL doesn't support partial unique indexes, so we use a conditional approach
-- Only run after cleaning duplicate emails:
-- UPDATE sarga_customers SET email = NULL WHERE email = '';
-- ALTER TABLE sarga_customers ADD UNIQUE INDEX idx_customers_email (email);

-- 3. Add index on sarga_vendors.vendor_code for faster lookups
-- ALTER TABLE sarga_vendors ADD INDEX idx_vendors_vendor_code (vendor_code);

-- 4. Add CHECK constraint on amounts (non-negative)
-- Note: MySQL 8.0.16+ supports CHECK constraints
-- ALTER TABLE sarga_inventory ADD CONSTRAINT chk_inventory_cost_price CHECK (cost_price >= 0);
-- ALTER TABLE sarga_inventory ADD CONSTRAINT chk_inventory_sell_price CHECK (sell_price >= 0);

-- 5. Add index on sarga_inventory.sku for faster SKU lookups
-- ALTER TABLE sarga_inventory ADD INDEX idx_inventory_sku (sku);

-- 6. Add index on sarga_jobs.job_number for faster job lookups
-- ALTER TABLE sarga_jobs ADD INDEX idx_jobs_job_number (job_number);

-- 7. Add index on sarga_blog_posts.slug for SEO URL lookups
-- ALTER TABLE sarga_blog_posts ADD INDEX idx_blog_posts_slug (slug);

-- 8. Add index on sarga_website_inquiries for status filtering
-- ALTER TABLE sarga_website_inquiries ADD INDEX idx_website_inquiries_status (status);

-- 9. Add index on sarga_website_reviews for rating filtering
-- ALTER TABLE sarga_website_reviews ADD INDEX idx_website_reviews_rating (rating);

-- 10. Add index on sarga_orders for order number lookups
-- ALTER TABLE sarga_orders ADD INDEX idx_orders_order_number (order_number);

-- 11. Add phone format validation via CHECK (basic pattern)
-- ALTER TABLE sarga_customers ADD CONSTRAINT chk_customer_mobile_format
--   CHECK (mobile REGEXP '^[0-9]{10}$' OR mobile IS NULL);

-- 12. Add GST format validation via CHECK
-- ALTER TABLE sarga_customers ADD CONSTRAINT chk_customer_gst_format
--   CHECK (gst REGEXP '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$' OR gst IS NULL);

-- ============================================
-- SAFE MIGRATION (run these in order):
-- ============================================

-- Step 1: Clean empty strings to NULL for unique indexes
-- UPDATE sarga_customers SET email = NULL WHERE email = '';
-- UPDATE sarga_vendors SET gstin = NULL WHERE gstin = '';
-- UPDATE sarga_vendors SET email = NULL WHERE email = '';

-- Step 2: Add indexes (uncomment as needed)
-- ALTER TABLE sarga_vendors ADD INDEX idx_vendors_vendor_code (vendor_code);
-- ALTER TABLE sarga_inventory ADD INDEX idx_inventory_sku (sku);
-- ALTER TABLE sarga_jobs ADD INDEX idx_jobs_job_number (job_number);
-- ALTER TABLE sarga_blog_posts ADD INDEX idx_blog_posts_slug (slug);
-- ALTER TABLE sarga_website_inquiries ADD INDEX idx_website_inquiries_status (status);
-- ALTER TABLE sarga_website_reviews ADD INDEX idx_website_reviews_rating (rating);
-- ALTER TABLE sarga_orders ADD INDEX idx_orders_order_number (order_number);

-- Step 3: Add unique constraints (run ONLY after confirming no duplicates)
-- ALTER TABLE sarga_customers ADD UNIQUE INDEX idx_customers_email (email);
-- ALTER TABLE sarga_vendors ADD UNIQUE INDEX idx_vendors_gstin (gstin);

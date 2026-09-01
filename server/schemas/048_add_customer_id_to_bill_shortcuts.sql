-- Add customer_id to bill_shortcuts table
ALTER TABLE bill_shortcuts ADD COLUMN customer_id INT NULL AFTER product_id;

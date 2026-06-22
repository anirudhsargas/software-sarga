-- Add client_type and internal_branch columns to sarga_customers
ALTER TABLE sarga_customers ADD COLUMN client_type VARCHAR(50) DEFAULT 'customer';
ALTER TABLE sarga_customers ADD COLUMN internal_branch VARCHAR(100) DEFAULT NULL;

-- Add priority, notes columns and Draft status to product update requests table
ALTER TABLE sarga_product_update_requests
ADD COLUMN priority ENUM('Low', 'Medium', 'High', 'Urgent') NOT NULL DEFAULT 'Medium',
ADD COLUMN notes TEXT NULL;

ALTER TABLE sarga_product_update_requests
MODIFY COLUMN status ENUM('draft', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending';

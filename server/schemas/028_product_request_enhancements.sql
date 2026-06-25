-- SQL Schema Migration: Enhancements for product update requests to support ADD and DELETE operations.
-- Drops foreign key constraint, modifies product_id to nullable, re-adds foreign key (ON DELETE SET NULL), and adds request_type column.

ALTER TABLE sarga_product_update_requests DROP FOREIGN KEY fk_product_update_requests_product;
ALTER TABLE sarga_product_update_requests MODIFY product_id INT NULL;
ALTER TABLE sarga_product_update_requests ADD CONSTRAINT fk_product_update_requests_product FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE SET NULL;

ALTER TABLE sarga_product_update_requests ADD COLUMN request_type ENUM('add', 'edit', 'delete') NOT NULL DEFAULT 'edit';

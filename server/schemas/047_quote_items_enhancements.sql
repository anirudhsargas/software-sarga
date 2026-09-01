-- Quote Items Enhancements Schema Migration
ALTER TABLE sarga_quote_items ADD COLUMN product_id INT DEFAULT NULL;
ALTER TABLE sarga_quote_items ADD COLUMN book_type VARCHAR(50) DEFAULT 'Offset';
ALTER TABLE sarga_quote_items ADD COLUMN custom_paper_rate DECIMAL(10,2) DEFAULT 0;
ALTER TABLE sarga_quote_items ADD COLUMN is_double_side TINYINT(1) DEFAULT 0;
ALTER TABLE sarga_quote_items ADD COLUMN applied_extras JSON DEFAULT NULL;

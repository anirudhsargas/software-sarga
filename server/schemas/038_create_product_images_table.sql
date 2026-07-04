CREATE TABLE IF NOT EXISTS sarga_product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_item_id INT NOT NULL,
    image_url TEXT,
    source VARCHAR(50),
    confidence INT DEFAULT 0,
    is_locked TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_inventory_item (inventory_item_id)
);

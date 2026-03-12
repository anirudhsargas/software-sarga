CREATE TABLE IF NOT EXISTS `sarga_stock_verifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month` varchar(7) NOT NULL,
  `status` enum('Draft', 'Completed') DEFAULT 'Draft',
  `verified_by` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_month` (`month`),
  FOREIGN KEY (`verified_by`) REFERENCES `sarga_staff` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sarga_stock_verification_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `verification_id` int NOT NULL,
  `inventory_item_id` int NOT NULL,
  `system_quantity` int NOT NULL DEFAULT 0,
  `physical_quantity` int DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_ver_item` (`verification_id`, `inventory_item_id`),
  FOREIGN KEY (`verification_id`) REFERENCES `sarga_stock_verifications` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`inventory_item_id`) REFERENCES `sarga_inventory` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

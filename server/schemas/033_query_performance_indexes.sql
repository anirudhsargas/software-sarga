-- 033_query_performance_indexes.sql
-- Indexes to optimize /api/inventory, /api/jobs, /api/staff query performance
-- Target: all three endpoints consistently under 300ms

-- === Inventory (GET /api/inventory) ===
-- ORDER BY i.created_at DESC, i.id ASC — composite covering sort order
CREATE INDEX idx_inventory_created_id ON sarga_inventory (created_at, id);

-- LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
CREATE INDEX idx_products_inventory_item ON sarga_products (inventory_item_id);

-- LEFT JOIN sarga_product_images spi ON i.id = spi.inventory_item_id
CREATE INDEX idx_product_images_inventory_item ON sarga_product_images (inventory_item_id);

-- WHERE bs.inventory_item_id IN (?) secondary query
CREATE INDEX idx_branch_stock_item ON sarga_branch_stock (inventory_item_id);

-- === Jobs (GET /api/jobs) ===
-- EXISTS / correlated subquery for staff assignments
CREATE INDEX idx_job_staff_assignments_job_staff_role ON sarga_job_staff_assignments (job_id, staff_id, role, status);

-- WHERE j.delivery_date < NOW() for overdue tab
CREATE INDEX idx_jobs_delivery_date ON sarga_jobs (delivery_date);

-- === Staff (GET /api/staff) ===
-- ORDER BY s.created_at DESC
CREATE INDEX idx_staff_created ON sarga_staff (created_at);

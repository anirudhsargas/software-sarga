-- 032_invoice_performance_indexes.sql
-- Composite index for customer payments ORDER BY (payment_date DESC, created_at DESC)
CREATE INDEX idx_cp_payment_created ON sarga_customer_payments (payment_date, created_at);

-- Index for is_internal filter (used by Invoices page and other customer payment listings)
CREATE INDEX idx_cp_is_internal ON sarga_customer_payments (is_internal);

-- Index for payment_id on sarga_invoices (LEFT JOIN performance)
CREATE INDEX idx_invoices_payment_id ON sarga_invoices (payment_id);

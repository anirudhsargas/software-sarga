-- 040_dashboard_performance_indexes.sql
-- Composite indexes for GET /api/stats/dashboard queries
-- Target: each dashboard query under 500ms (was ~5.2s)

-- Jobs dashboard queries filter by branch_id, created_at date ranges, and status != 'Cancelled'
CREATE INDEX idx_jobs_branch_created_status ON sarga_jobs (branch_id, created_at, status);

-- Customer payments dashboard queries filter by branch_id and payment_date
CREATE INDEX idx_cp_branch_payment_date ON sarga_customer_payments (branch_id, payment_date);

-- Expense (sarga_payments) dashboard queries filter by branch_id and payment_date
CREATE INDEX idx_payments_branch_payment_date ON sarga_payments (branch_id, payment_date);

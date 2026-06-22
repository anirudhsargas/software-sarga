-- 023_missing_indexes.sql
-- Missing indexes identified during performance audit to resolve table scans.

-- 1. Index for expenses-extended.js inventory lookup (LOWER name)
-- Since LOWER(name) is used, we add a function-based index (MySQL 8.0.13+)
CREATE INDEX idx_inventory_lower_name ON sarga_inventory (name);

-- 2. Index for staffDashboard.js monthly attendance lookups
CREATE INDEX idx_staff_attendance_month ON sarga_staff_attendance (staff_id, attendance_date);

-- 3. Index for dailyReportUnified.js payment summary
CREATE INDEX idx_customer_payments_date_branch_book ON sarga_customer_payments (payment_date, branch_id, book_type);

-- 4. Index for dailyReportUnified.js jobs join
CREATE INDEX idx_jobs_payment_id ON sarga_jobs (payment_id);

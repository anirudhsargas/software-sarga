-- 043_performance_indexes_phase2.sql
-- Additional composite indexes for dashboard and job assignment queries
-- Target: dashboard wall-clock under 800ms

-- Jobs dashboard: DATE(updated_at) = ? for completed_today count
CREATE INDEX idx_jobs_updated_at ON sarga_jobs (updated_at);

-- Jobs dashboard: delivery_date < ? AND status NOT IN ('Delivered', 'Cancelled') for overdue count
-- Also covers urgent_today: priority = 'Urgent' AND DATE(delivery_date) = ?
CREATE INDEX idx_jobs_delivery_status ON sarga_jobs (delivery_date, status);

-- Staff productivity: DATE(ja.created_at) >= ? GROUP BY staff_id
CREATE INDEX idx_job_assignments_created_staff ON sarga_job_assignments (created_at, staff_id);

-- Machine readings: DATE(mr.reading_date) = ? for today's machine stats
CREATE INDEX idx_machine_readings_date ON sarga_machine_readings (reading_date);

-- Fraud alerts: fa.status = 'ACTIVE' for monitoring stats
CREATE INDEX idx_fraud_alerts_status ON sarga_fraud_alerts (status);

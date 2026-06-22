-- Allow staff_id to be NULL for role-based assignments ("Any Designer" etc.)
ALTER TABLE sarga_job_staff_assignments
    MODIFY COLUMN staff_id INT NULL;

-- Index on role column for role-based assignment lookups
CREATE INDEX idx_assignments_role ON sarga_job_staff_assignments (role);

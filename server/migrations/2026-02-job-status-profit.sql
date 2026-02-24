-- Add job status history table
CREATE TABLE IF NOT EXISTS sarga_job_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    staff_id INT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- Add cost and profit fields to jobs table
ALTER TABLE sarga_jobs 
    ADD COLUMN paper_cost DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN machine_cost DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN labour_cost DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN total_cost DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN profit DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN margin DECIMAL(6,4) DEFAULT 0;

-- Add stage/status column to staff assignments for per-stage tracking
ALTER TABLE sarga_job_staff_assignments 
    ADD COLUMN stage VARCHAR(50) DEFAULT NULL;

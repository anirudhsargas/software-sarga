-- Migration: Add credit delivery override fields and allow Credit payment status
-- Date: 2026-06-21

ALTER TABLE sarga_jobs MODIFY COLUMN payment_status ENUM('Unpaid', 'Partial', 'Paid', 'Credit') DEFAULT 'Unpaid';

ALTER TABLE sarga_jobs
  ADD COLUMN credit_authorized_by INT NULL,
  ADD COLUMN credit_authorized_by_name VARCHAR(255) NULL,
  ADD COLUMN credit_authorized_at DATETIME NULL,
  ADD COLUMN credit_reason TEXT NULL,
  ADD CONSTRAINT fk_credit_authorized_by FOREIGN KEY (credit_authorized_by) REFERENCES sarga_staff(id) ON DELETE SET NULL;

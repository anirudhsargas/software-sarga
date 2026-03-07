-- Migration: Add category and subcategory columns to sarga_jobs
ALTER TABLE sarga_jobs
ALTER TABLE sarga_jobs ADD COLUMN category VARCHAR(64) DEFAULT NULL;
ALTER TABLE sarga_jobs ADD COLUMN subcategory VARCHAR(64) DEFAULT NULL;
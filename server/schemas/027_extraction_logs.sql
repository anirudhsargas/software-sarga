CREATE TABLE IF NOT EXISTS sarga_bill_extraction_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_document_id INT,
  extraction_type VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  extracted_value TEXT,
  confidence_score DECIMAL(5, 2) DEFAULT 0,
  is_corrected TINYINT(1) DEFAULT 0,
  corrected_value TEXT,
  corrected_by INT,
  corrected_at TIMESTAMP NULL,
  ocr_engine VARCHAR(50) DEFAULT 'paddleocr',
  processing_time_ms INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_document_id) REFERENCES sarga_bills_documents(id) ON DELETE CASCADE,
  INDEX idx_bill_doc (bill_document_id),
  INDEX idx_field (field_name)
);

ALTER TABLE sarga_bills_documents ADD COLUMN extraction_confidence DECIMAL(5, 2) DEFAULT NULL;
ALTER TABLE sarga_bills_documents ADD COLUMN extraction_status ENUM('pending', 'processing', 'completed', 'failed', 'manual') DEFAULT 'pending';
ALTER TABLE sarga_bills_documents ADD COLUMN extraction_errors TEXT;
ALTER TABLE sarga_bills_documents ADD COLUMN manual_correction_required TINYINT(1) DEFAULT 0;

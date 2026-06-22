-- Add GST columns to sarga_bills_documents for unified GST bill processing
ALTER TABLE sarga_bills_documents
  ADD COLUMN subtotal DECIMAL(12,2) DEFAULT NULL AFTER amount,
  ADD COLUMN tax_amount DECIMAL(12,2) DEFAULT NULL AFTER subtotal,
  ADD COLUMN sgst_amount DECIMAL(12,2) DEFAULT NULL AFTER tax_amount,
  ADD COLUMN cgst_amount DECIMAL(12,2) DEFAULT NULL AFTER sgst_amount,
  ADD COLUMN gst_confidence DECIMAL(5,2) DEFAULT NULL AFTER cgst_amount,
  ADD COLUMN gst_category ENUM('business', 'expense') DEFAULT NULL AFTER gst_confidence,
  ADD COLUMN vendor_gstin VARCHAR(20) DEFAULT NULL AFTER vendor_name,
  ADD COLUMN line_items JSON DEFAULT NULL AFTER description;

-- Add index for GST category lookups
ALTER TABLE sarga_bills_documents
  ADD INDEX idx_gst_category (gst_category);

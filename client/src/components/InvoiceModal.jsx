import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { X, Upload, FileText } from 'lucide-react';
import Button from './Button';
import { formatCurrency } from '../utils/formatters';
import { validateDate, validatePrice } from '../utils/validators';
import useFormValidation from '../hooks/useFormValidation';

const InvoiceModal = ({ vendor, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    vendor_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    amount: '',
    branch: 'common',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [showExtractedItems, setShowExtractedItems] = useState(false);
  const { errors, validate, focusFirstError, formRef } = useFormValidation();
  const fileInputRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    return () => {
      setTimeout(() => {
        triggerRef.current?.focus();
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (vendor) {
      setFormData(prev => ({
        ...prev,
        vendor_id: vendor.id
      }));
    }
  }, [vendor]);

  const handleScanBill = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setExtractedData(null);
    try {
      const fd = new FormData();
      fd.append('file', file);

      const response = await api.post('/bills-documents/extract-details', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const data = response.data;
      const extracted = data.extracted_data || {};

      setExtractedData(extracted);

      setFormData(prev => ({
        ...prev,
        invoice_number: extracted.bill_number || prev.invoice_number,
        invoice_date: extracted.bill_date || prev.invoice_date,
        amount: extracted.amount || prev.amount,
      }));

      if (extracted.items?.length > 0) {
        setShowExtractedItems(true);
      }

      toast.success('Bill scanned successfully');
    } catch (err) {
      console.error('Extraction error:', err);
      toast.error('Failed to extract bill details');
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    return validate({
      vendor_id: () => formData.vendor_id ? { valid: true } : { valid: false, error: 'Vendor is required' },
      invoice_date: () => validateDate(formData.invoice_date, { label: 'Invoice date' }),
      amount: () => validatePrice(formData.amount, { label: 'Amount', min: 0.01 }),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm().valid) {
      focusFirstError();
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...formData,
        amount: parseFloat(formData.amount)
      };

      await api.post('/vendor-invoices', submitData);
      toast.success('Invoice added successfully');
      onSave();
    } catch (error) {
      console.error('Error saving invoice:', error);
      const errorMessage = error.response?.data?.message || 'Failed to save invoice';
      toast.error(errorMessage);

      if (error.response?.data?.errors) {
        const serverErrors = error.response.data.errors;
        Object.entries(serverErrors).forEach(([field, msg]) => {
          if (typeof msg === 'string') {
            // Server validation errors handled
          }
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
      <div className="modal">
        <div className="modal-header">
          <h2 id="invoice-modal-title" className="modal-title">Add New Invoice</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={handleScanBill}
              className="btn btn-secondary"
              disabled={scanning}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px' }}
            >
              <Upload size={16} />
              {scanning ? 'Scanning...' : 'Scan Bill'}
            </button>
            <button onClick={onClose} className="icon-button" aria-label="Close invoice modal"><X size={20} aria-hidden="true" /></button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-stack">
            {/* Vendor Information */}
            <div>
              <label className="label">
                Vendor
              </label>
              <div className="info-panel">
                {vendor?.name || 'Unknown Vendor'}
              </div>
            </div>

            {/* Invoice Details */}
            <div>
              <label className="label">
                Invoice Number
              </label>
              <input
                type="text"
                name="invoice_number"
                value={formData.invoice_number}
                onChange={handleInputChange}
                className="input-field"
                placeholder="INV-001 (optional)"
              />
            </div>

            <div className="form-grid">
              <div>
                <label htmlFor="invoice_date" className="label">
                  Invoice Date <span aria-hidden="true">*</span>
                </label>
                <input
                  id="invoice_date"
                  type="date"
                  name="invoice_date"
                  value={formData.invoice_date}
                  onChange={handleInputChange}
                  className={`input-field ${
                    errors.invoice_date ? 'input-field--error' : ''
                  }`}
                  aria-describedby={errors.invoice_date ? 'invoice-date-error' : undefined}
                  aria-invalid={errors.invoice_date ? 'true' : 'false'}
                  aria-required="true"
                />
                {errors.invoice_date && <p id="invoice-date-error" className="error-text" role="alert">{errors.invoice_date}</p>}
              </div>

              <div>
                <label className="label">
                  Branch
                </label>
                <select
                  name="branch"
                  value={formData.branch}
                  onChange={handleInputChange}
                  className="input-field"
                >
                  <option value="perambra">Perambra</option>
                  <option value="meppayur">Meppayur</option>
                  <option value="common">Common</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="amount" className="label">
                Amount (₹) <span aria-hidden="true">*</span>
              </label>
              <input
                id="amount"
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className={`input-field ${
                  errors.amount ? 'input-field--error' : ''
                }`}
                placeholder="0.00"
                aria-describedby={errors.amount ? 'amount-error' : undefined}
                aria-invalid={errors.amount ? 'true' : 'false'}
                aria-required="true"
              />
              {errors.amount && <p id="amount-error" className="error-text" role="alert">{errors.amount}</p>}
              {formData.amount && (
                <p className="help-text">
                  {formatCurrency(formData.amount)}
                </p>
              )}
            </div>

            {/* Extracted Bill Data */}
            {extractedData && (
              <div style={{ background: 'var(--surface-2)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} /> Scanned Data
                  </h4>
                  {extractedData.items?.length > 0 && (
                    <button
                      onClick={() => setShowExtractedItems(!showExtractedItems)}
                      style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      {showExtractedItems ? 'Hide Items' : `${extractedData.items.length} item(s)`}
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  {extractedData.vendor_name && (
                    <div><span style={{ color: 'var(--muted)' }}>Vendor: </span><span style={{ fontWeight: 600 }}>{extractedData.vendor_name}</span></div>
                  )}
                  {extractedData.bill_number && (
                    <div><span style={{ color: 'var(--muted)' }}>Bill No: </span><span style={{ fontWeight: 600 }}>{extractedData.bill_number}</span></div>
                  )}
                  {extractedData.bill_date && (
                    <div><span style={{ color: 'var(--muted)' }}>Date: </span><span style={{ fontWeight: 600 }}>{extractedData.bill_date}</span></div>
                  )}
                  {extractedData.tax > 0 && (
                    <div><span style={{ color: 'var(--muted)' }}>GST: </span><span style={{ fontWeight: 600 }}>₹{extractedData.tax.toFixed(2)}</span></div>
                  )}
                </div>

                {/* Extracted Line Items */}
                {showExtractedItems && extractedData.items?.length > 0 && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '6px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      <span>Item</span>
                      <span style={{ textAlign: 'right' }}>Qty</span>
                      <span style={{ textAlign: 'right' }}>Rate</span>
                      <span style={{ textAlign: 'right' }}>Amount</span>
                    </div>
                    {extractedData.items.map((item, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '6px', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || `Item ${i + 1}`}</span>
                        <span style={{ textAlign: 'right', color: 'var(--muted)' }}>{item.quantity || '-'}</span>
                        <span style={{ textAlign: 'right', color: 'var(--muted)' }}>{item.rate ? `₹${item.rate}` : '-'}</span>
                        <span style={{ textAlign: 'right', fontWeight: 600 }}>₹{(item.amount || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Credit Information */}
            {vendor && (
              <div className="info-panel info-panel--info">
                <h4 className="info-panel__title">Credit Terms</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Credit Days:</span>
                    <span className="info-value">{vendor.credit_days || 0} days</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Credit Limit:</span>
                    <span className="info-value">{formatCurrency(vendor.credit_limit || 0)}</span>
                  </div>
                </div>
                {vendor.credit_days > 0 && (
                  <div className="mt-2 text-sm">
                    Due Date: {new Date(new Date(formData.invoice_date).getTime() + (vendor.credit_days * 24 * 60 * 60 * 1000)).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="label">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows="3"
                className="input-field"
                placeholder="Additional notes about the invoice"
              />
            </div>
          </div>

          <div className="modal-footer">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={loading}
              loadingText="Saving..."
            >
              Add Invoice
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InvoiceModal;
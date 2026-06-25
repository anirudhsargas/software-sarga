import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { X, Upload, FileText, IndianRupee, Calendar, MapPin } from 'lucide-react';
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
  const { errors, validate, focusFirstError, formRef: _formRef } = useFormValidation();
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
      fd.append('bill', file);

      const response = await api.post('/api/ocr/extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const data = response.data;
      const ocrResult = data.data || {};

      const extracted = {
        bill_number: '',
        bill_date: ocrResult.date || '',
        amount: ocrResult.amount || '',
        vendor_name: ocrResult.vendorName || '',
        items: []
      };

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
        Object.entries(serverErrors).forEach(([_field, msg]) => {
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title" style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay, rgba(0,0,0,0.35))', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 'var(--z-modal)', padding: 20 }}>
      <style>{`
        .premium-modal-container {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          width: 100%;
          max-width: 640px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-lg);
          animation: modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes modal-enter {
          from { opacity: 0; transform: scale(0.96) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .premium-form-body {
          padding: 32px;
          overflow-y: auto;
        }
        .premium-form-wrapper {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .premium-field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .premium-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted, var(--muted));
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding-left: 2px;
        }
        .premium-input-container {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }
        .premium-input-decorator {
          position: absolute;
          left: 14px;
          color: var(--text-muted, var(--muted));
          pointer-events: none;
          transition: color 0.15s ease;
          display: flex;
          align-items: center;
          z-index: 1;
        }
        .premium-input {
          width: 100%;
          padding: 11px 14px 11px 40px;
          border: 1.5px solid var(--border-subtle);
          border-radius: 10px;
          background: var(--surface);
          color: var(--text);
          font-size: 14px;
          line-height: 1.4;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          outline: none;
          font-family: inherit;
        }
        .premium-input:hover {
          border-color: var(--text-muted, var(--muted));
        }
        .premium-input:focus {
          border-color: var(--accent);
          background: var(--surface);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
        }
        .premium-input-container:focus-within .premium-input-decorator {
          color: var(--accent);
        }
        .premium-input.field-error {
          border-color: var(--error);
        }
        .premium-input.field-error:focus {
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 15%, transparent);
        }
        .premium-error-lbl {
          font-size: 11px;
          color: var(--error);
          margin-top: 4px;
          padding-left: 2px;
          font-weight: 500;
        }
        .premium-help-lbl {
          font-size: 10px;
          color: var(--text-muted, var(--muted));
          margin-top: 4px;
          padding-left: 2px;
        }
        .premium-info-panel {
          background: var(--surface-2);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 16px;
        }
        .premium-info-title {
          margin: 0 0 10px 0;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 6px;
        }
        .premium-info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px 24px;
        }
        .premium-info-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .premium-info-label {
          font-size: 10px;
          color: var(--text-muted, var(--muted));
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .premium-info-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
        }
        select.premium-input {
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          background-size: 16px;
          padding-right: 40px;
          cursor: pointer;
        }
        textarea.premium-input {
          min-height: 80px;
          resize: vertical;
        }
        .premium-form-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 640px) {
          .premium-form-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
      <div className="premium-modal-container">
        <div className="modal-header" style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="invoice-modal-title" className="modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Add New Invoice</h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleScanBill}
              className="btn btn-secondary"
              disabled={scanning}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px', height: 38, borderRadius: 8 }}
            >
              <Upload size={15} />
              {scanning ? 'Scanning...' : 'Scan Bill'}
            </button>
            <button onClick={onClose} className="icon-button" aria-label="Close invoice modal" style={{ display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} aria-hidden="true" /></button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        <form onSubmit={handleSubmit} className="premium-form-body">
          <div className="premium-form-wrapper">
            
            {/* Vendor Information */}
            <div className="premium-field-group">
              <label className="premium-label">Vendor</label>
              <div className="premium-info-panel" style={{ fontWeight: 700, fontSize: 15, background: 'var(--surface-2)', color: 'var(--text-heading)' }}>
                {vendor?.name || 'Unknown Vendor'}
              </div>
            </div>

            {/* Invoice Details */}
            <div className="premium-field-group">
              <label className="premium-label">Invoice Number</label>
              <div className="premium-input-container">
                <div className="premium-input-decorator"><FileText size={15} /></div>
                <input
                  type="text"
                  name="invoice_number"
                  value={formData.invoice_number}
                  onChange={handleInputChange}
                  className="premium-input"
                  placeholder="INV-001 (optional)"
                />
              </div>
            </div>

            <div className="premium-form-grid">
              <div className="premium-field-group">
                <label htmlFor="invoice_date" className="premium-label">
                  Invoice Date <span aria-hidden="true">*</span>
                </label>
                <div className="premium-input-container">
                  <div className="premium-input-decorator"><Calendar size={15} /></div>
                  <input
                    id="invoice_date"
                    type="date"
                    name="invoice_date"
                    value={formData.invoice_date}
                    onChange={handleInputChange}
                    className={`premium-input ${errors.invoice_date ? 'field-error' : ''}`}
                    aria-describedby={errors.invoice_date ? 'invoice-date-error' : undefined}
                    aria-invalid={errors.invoice_date ? 'true' : 'false'}
                    aria-required="true"
                  />
                </div>
                {errors.invoice_date && <p id="invoice-date-error" className="premium-error-lbl" role="alert">{errors.invoice_date}</p>}
              </div>

              <div className="premium-field-group">
                <label className="premium-label">Branch</label>
                <div className="premium-input-container">
                  <div className="premium-input-decorator"><MapPin size={15} /></div>
                  <select
                    name="branch"
                    value={formData.branch}
                    onChange={handleInputChange}
                    className="premium-input"
                  >
                    <option value="perambra">Perambra</option>
                    <option value="meppayur">Meppayur</option>
                    <option value="common">Common</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="premium-field-group">
              <label htmlFor="amount" className="premium-label">
                Amount (₹) <span aria-hidden="true">*</span>
              </label>
              <div className="premium-input-container">
                <div className="premium-input-decorator"><IndianRupee size={15} /></div>
                <input
                  id="amount"
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  className={`premium-input ${errors.amount ? 'field-error' : ''}`}
                  placeholder="0.00"
                  aria-describedby={errors.amount ? 'amount-error' : undefined}
                  aria-invalid={errors.amount ? 'true' : 'false'}
                  aria-required="true"
                />
              </div>
              {errors.amount && <p id="amount-error" className="premium-error-lbl" role="alert">{errors.amount}</p>}
              {formData.amount && (
                <p className="premium-help-lbl" style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                  Formatted: {formatCurrency(formData.amount)}
                </p>
              )}
            </div>

            {/* Extracted Bill Data */}
            {extractedData && (
              <div style={{ background: 'var(--surface-2)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                    <FileText size={14} style={{ color: 'var(--accent)' }} /> Scanned Data
                  </h4>
                  {extractedData.items?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowExtractedItems(!showExtractedItems)}
                      style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      {showExtractedItems ? 'Hide Items' : `${extractedData.items.length} item(s)`}
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  {extractedData.vendor_name && (
                    <div><span style={{ color: 'var(--text-muted)' }}>Vendor: </span><span style={{ fontWeight: 600 }}>{extractedData.vendor_name}</span></div>
                  )}
                  {extractedData.bill_number && (
                    <div><span style={{ color: 'var(--text-muted)' }}>Bill No: </span><span style={{ fontWeight: 600 }}>{extractedData.bill_number}</span></div>
                  )}
                  {extractedData.bill_date && (
                    <div><span style={{ color: 'var(--text-muted)' }}>Date: </span><span style={{ fontWeight: 600 }}>{extractedData.bill_date}</span></div>
                  )}
                  {extractedData.tax > 0 && (
                    <div><span style={{ color: 'var(--text-muted)' }}>GST: </span><span style={{ fontWeight: 600 }}>₹{extractedData.tax.toFixed(2)}</span></div>
                  )}
                </div>

                {/* Extracted Line Items */}
                {showExtractedItems && extractedData.items?.length > 0 && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '6px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      <span>Item</span>
                      <span style={{ textAlign: 'right' }}>Qty</span>
                      <span style={{ textAlign: 'right' }}>Rate</span>
                      <span style={{ textAlign: 'right' }}>Amount</span>
                    </div>
                    {extractedData.items.map((item, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '6px', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || `Item ${i + 1}`}</span>
                        <span style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{item.quantity || '-'}</span>
                        <span style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{item.rate ? `₹${item.rate}` : '-'}</span>
                        <span style={{ textAlign: 'right', fontWeight: 600 }}>₹{(item.amount || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Credit Information */}
            {vendor && (
              <div className="premium-info-panel">
                <h4 className="premium-info-title">Credit Terms</h4>
                <div className="premium-info-grid">
                  <div className="premium-info-item">
                    <span className="premium-info-label">Credit Days:</span>
                    <span className="premium-info-value">{vendor.credit_days || 0} days</span>
                  </div>
                  <div className="premium-info-item">
                    <span className="premium-info-label">Credit Limit:</span>
                    <span className="premium-info-value">{formatCurrency(vendor.credit_limit || 0)}</span>
                  </div>
                </div>
                {vendor.credit_days > 0 && (
                  <div style={{ marginTop: 12, fontSize: '12px', fontWeight: 600, color: 'var(--warning)', display: 'flex', gap: 4 }}>
                    <span>Estimated Due Date:</span>
                    <span>{new Date(new Date(formData.invoice_date).getTime() + (vendor.credit_days * 24 * 60 * 60 * 1000)).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            )}

            <div className="premium-field-group">
              <label className="premium-label">Notes</label>
              <div className="premium-input-container">
                <div className="premium-input-decorator" style={{ top: '15px', transform: 'none' }}><FileText size={15} /></div>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  className="premium-input"
                  placeholder="Additional notes about the invoice"
                  style={{ paddingLeft: '40px' }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              style={{ height: 44, borderRadius: 10, padding: '10px 24px' }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={loading}
              loadingText="Saving..."
              style={{ height: 44, borderRadius: 10, padding: '10px 32px' }}
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
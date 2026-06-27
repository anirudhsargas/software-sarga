import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { X, Calendar, IndianRupee, CreditCard, FileText, AlertCircle } from 'lucide-react';
import Button from './Button';
import { formatCurrency } from '../utils/formatters';
import { validateDate, validatePrice } from '../utils/validators';
import useFormValidation from '../hooks/useFormValidation';

const PaymentModal = ({ invoice, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    vendor_invoice_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'cash',
    reference_number: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const { errors, validate, focusFirstError, formRef: _formRef } = useFormValidation();
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [showOverpaymentConfirm, setShowOverpaymentConfirm] = useState(false);

  useEffect(() => {
    if (invoice) {
      setFormData(prev => ({
        ...prev,
        vendor_invoice_id: invoice.id,
        amount: Math.min(invoice.amount - (invoice.paid_amount || 0), invoice.amount - (invoice.paid_amount || 0)).toString()
      }));
      setInvoiceDetails(invoice);
    }
  }, [invoice]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const balanceDue = invoiceDetails ? invoiceDetails.amount - (invoiceDetails.paid_amount || 0) : 0;
    return validate({
      vendor_invoice_id: () => formData.vendor_invoice_id ? { valid: true } : { valid: false, error: 'Invoice is required' },
      payment_date: () => validateDate(formData.payment_date, { label: 'Payment date' }),
      amount: () => {
        const priceResult = validatePrice(formData.amount, { label: 'Payment amount', min: 0.01 });
        if (!priceResult.valid) return priceResult;
        if (Number(formData.amount) > balanceDue) {
          setShowOverpaymentConfirm(true);
          return { valid: false, error: `Amount exceeds balance due of ₹${balanceDue.toFixed(2)}. Click Submit again to confirm overpayment.` };
        }
        return priceResult;
      },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const balanceDue = invoiceDetails ? invoiceDetails.amount - (invoiceDetails.paid_amount || 0) : 0;
    const isOverpayment = Number(formData.amount) > balanceDue;

    if (!showOverpaymentConfirm && isOverpayment) {
      if (!validateForm().valid) {
        focusFirstError();
        return;
      }
      setShowOverpaymentConfirm(true);
      return;
    }

    if (!validateForm().valid) {
      focusFirstError();
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...formData,
        amount: parseFloat(formData.amount),
        overpayment_confirmed: isOverpayment ? true : undefined
      };

      await api.post('/vendor-payments', submitData);
      toast.success('Payment recorded successfully');
      onSave();
    } catch (error) {
      console.error('Error recording payment:', error);
      const errorMessage = error.response?.data?.message || 'Failed to record payment';
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

  const getStatusBadge = (status) => {
    const statusClasses = {
      pending: 'status-badge status-badge--warning',
      partial: 'status-badge status-badge--info',
      paid: 'status-badge status-badge--success',
      overdue: 'status-badge status-badge--error'
    };

    return (
      <span className={`status-badge ${statusClasses[status] || 'status-badge status-badge--default'}`}>
        {status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
    );
  };

  if (!invoiceDetails) {
    return null;
  }

  const balanceDue = invoiceDetails.amount - (invoiceDetails.paid_amount || 0);

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay, rgba(0,0,0,0.35))', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 'var(--z-modal)', padding: 20 }}>
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
          <h2 className="modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Record Payment</h2>
          <button onClick={onClose} className="icon-button" style={{ display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="premium-form-body">
          <div className="premium-form-wrapper">
            
            {/* Invoice Information */}
            <div className="premium-info-panel">
              <h4 className="premium-info-title">Invoice Details</h4>
              <div className="premium-info-grid">
                <div className="premium-info-item">
                  <span className="premium-info-label">Invoice:</span>
                  <span className="premium-info-value">{invoiceDetails.invoice_number || `INV-${invoiceDetails.id}`}</span>
                </div>
                <div className="premium-info-item">
                  <span className="premium-info-label">Date:</span>
                  <span className="premium-info-value">{new Date(invoiceDetails.invoice_date).toLocaleDateString()}</span>
                </div>
                <div className="premium-info-item">
                  <span className="premium-info-label">Total Amount:</span>
                  <span className="premium-info-value">{formatCurrency(invoiceDetails.amount)}</span>
                </div>
                <div className="premium-info-item">
                  <span className="premium-info-label">Paid Amount:</span>
                  <span className="premium-info-value">{formatCurrency(invoiceDetails.paid_amount || 0)}</span>
                </div>
                <div className="premium-info-item">
                  <span className="premium-info-label">Balance Due:</span>
                  <span className="premium-info-value" style={{ color: 'var(--warning)', fontWeight: 700 }}>{formatCurrency(balanceDue)}</span>
                </div>
                <div className="premium-info-item">
                  <span className="premium-info-label">Status:</span>
                  <span style={{ marginTop: 4 }}>{getStatusBadge(invoiceDetails.status)}</span>
                </div>
              </div>
              {invoiceDetails.due_date && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10, fontSize: '12px', display: 'flex', gap: 4 }}>
                  <span className="premium-info-label" style={{ textTransform: 'none' }}>Due Date:</span>
                  <span className={`premium-info-value ${new Date(invoiceDetails.due_date) < new Date() && balanceDue > 0 ? 'text-error' : ''}`} style={{ fontSize: '12px' }}>
                    {new Date(invoiceDetails.due_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              {formData.amount && Number(formData.amount) > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10, fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <span className="premium-info-label" style={{ textTransform: 'none' }}>Balance Before Payment:</span>
                    <p style={{ fontWeight: 700, color: 'var(--warning)' }}>{formatCurrency(balanceDue)}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="premium-info-label" style={{ textTransform: 'none' }}>Balance After Payment:</span>
                    <p style={{ fontWeight: 700, color: Number(formData.amount) >= balanceDue ? 'var(--success)' : 'var(--accent)' }}>
                      {formatCurrency(Math.max(0, balanceDue - Number(formData.amount)))}
                    </p>
                  </div>
                </div>
              )}
              {showOverpaymentConfirm && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(var(--warning-rgb, 245,158,11), 0.12)', border: '1px solid var(--warning)', borderRadius: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                  <span>Overpayment of <strong>{formatCurrency(Number(formData.amount) - balanceDue)}</strong> will be recorded. Click Submit again to confirm.</span>
                </div>
              )}
            </div>

            {/* Payment Details */}
            <div className="premium-form-grid">
              <div className="premium-field-group">
                <label className="premium-label">Payment Date *</label>
                <div className="premium-input-container">
                  <div className="premium-input-decorator"><Calendar size={15} /></div>
                  <input
                    type="date"
                    name="payment_date"
                    value={formData.payment_date}
                    onChange={handleInputChange}
                    className={`premium-input ${errors.payment_date ? 'field-error' : ''}`}
                  />
                </div>
                {errors.payment_date && <p className="premium-error-lbl">{errors.payment_date}</p>}
              </div>

              <div className="premium-field-group">
                <label className="premium-label">Payment Mode</label>
                <div className="premium-input-container">
                  <div className="premium-input-decorator"><CreditCard size={15} /></div>
                  <select
                    name="payment_mode"
                    value={formData.payment_mode}
                    onChange={handleInputChange}
                    className="premium-input"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="neft">NEFT</option>
                    <option value="rtgs">RTGS</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="premium-field-group">
              <label className="premium-label">Payment Amount (₹) *</label>
              <div className="premium-input-container">
                <div className="premium-input-decorator"><IndianRupee size={15} /></div>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  min="0"
                  max={balanceDue}
                  step="0.01"
                  className={`premium-input ${errors.amount ? 'field-error' : ''}`}
                  placeholder="0.00"
                />
              </div>
              {errors.amount && <p className="premium-error-lbl">{errors.amount}</p>}
              {formData.amount && (
                <p className="premium-help-lbl" style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                  Formatted: {formatCurrency(formData.amount)}
                </p>
              )}
            </div>

            {(formData.payment_mode === 'bank' || formData.payment_mode === 'upi' || formData.payment_mode === 'cheque' || formData.payment_mode === 'neft' || formData.payment_mode === 'rtgs') && (
              <div className="premium-field-group">
                <label className="premium-label">Reference Number {formData.payment_mode === 'cheque' ? '*' : ''}</label>
                <div className="premium-input-container">
                  <div className="premium-input-decorator"><FileText size={15} /></div>
                  <input
                    type="text"
                    name="reference_number"
                    value={formData.reference_number}
                    onChange={handleInputChange}
                    className="premium-input"
                    placeholder={formData.payment_mode === 'cheque' ? 'Cheque Number (required)' : 'Transaction ID / Reference'}
                  />
                </div>
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
                  placeholder="Additional notes about the payment"
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
              variant="success"
              type="submit"
              loading={loading}
              loadingText="Recording..."
              style={{ height: 44, borderRadius: 10, padding: '10px 32px' }}
            >
              Record Payment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
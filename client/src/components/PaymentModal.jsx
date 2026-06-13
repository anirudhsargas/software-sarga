import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { X } from 'lucide-react';
import Button from './Button';

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
  const [errors, setErrors] = useState({});
  const [invoiceDetails, setInvoiceDetails] = useState(null);

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
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.vendor_invoice_id) {
      newErrors.vendor_invoice_id = 'Invoice is required';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Valid payment amount is required';
    }

    if (!formData.payment_date) {
      newErrors.payment_date = 'Payment date is required';
    }

    const balanceDue = invoiceDetails ? invoiceDetails.amount - (invoiceDetails.paid_amount || 0) : 0;
    if (parseFloat(formData.amount) > balanceDue) {
      newErrors.amount = `Payment amount cannot exceed balance due of ₹${balanceDue.toFixed(2)}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...formData,
        amount: parseFloat(formData.amount)
      };

      await api.post('/vendor-payments', submitData);
      toast.success('Payment recorded successfully');
      onSave();
    } catch (error) {
      console.error('Error recording payment:', error);
      const errorMessage = error.response?.data?.message || 'Failed to record payment';
      toast.error(errorMessage);

      // Handle validation errors from server
      if (error.response?.data?.errors) {
        setErrors(error.response.data.errors);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
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
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Record Payment</h2>
          <button
            onClick={onClose}
            className="icon-button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-stack">
            {/* Invoice Information */}
            <div className="info-panel">
              <h4 className="info-panel__title">Invoice Details</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Invoice:</span>
                  <span className="info-value">{invoiceDetails.invoice_number || `INV-${invoiceDetails.id}`}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Date:</span>
                  <span className="info-value">{new Date(invoiceDetails.invoice_date).toLocaleDateString()}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Total Amount:</span>
                  <span className="info-value">{formatCurrency(invoiceDetails.amount)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Paid Amount:</span>
                  <span className="info-value">{formatCurrency(invoiceDetails.paid_amount || 0)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Balance Due:</span>
                  <span className="info-value info-value--warning">{formatCurrency(balanceDue)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Status:</span>
                  <span className="ml-2">{getStatusBadge(invoiceDetails.status)}</span>
                </div>
              </div>
              {invoiceDetails.due_date && (
                <div className="mt-2 text-sm">
                  <span className="info-label">Due Date:</span>
                  <span className={`info-value ${new Date(invoiceDetails.due_date) < new Date() && balanceDue > 0 ? 'info-value--error' : ''}`}>
                    {new Date(invoiceDetails.due_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Payment Details */}
            <div className="form-grid">
              <div>
                <label className="label">
                  Payment Date *
                </label>
                <input
                  type="date"
                  name="payment_date"
                  value={formData.payment_date}
                  onChange={handleInputChange}
                  className={`input-field ${
                    errors.payment_date ? 'input-field--error' : ''
                  }`}
                />
                {errors.payment_date && <p className="error-text">{errors.payment_date}</p>}
              </div>

              <div>
                <label className="label">
                  Payment Mode
                </label>
                <select
                  name="payment_mode"
                  value={formData.payment_mode}
                  onChange={handleInputChange}
                  className="input-field"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">
                Payment Amount (₹) *
              </label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                min="0"
                max={balanceDue}
                step="0.01"
                className={`input-field ${
                  errors.amount ? 'input-field--error' : ''
                }`}
                placeholder="0.00"
              />
              {errors.amount && <p className="error-text">{errors.amount}</p>}
              {formData.amount && (
                <p className="help-text">
                  {formatCurrency(formData.amount)}
                </p>
              )}
            </div>

            {(formData.payment_mode === 'bank_transfer' || formData.payment_mode === 'cheque' || formData.payment_mode === 'upi') && (
              <div>
                <label className="label">
                  Reference Number
                </label>
                <input
                  type="text"
                  name="reference_number"
                  value={formData.reference_number}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="Transaction ID, Cheque Number, etc."
                />
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
                placeholder="Additional notes about the payment"
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
              variant="success"
              type="submit"
              loading={loading}
              loadingText="Recording..."
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
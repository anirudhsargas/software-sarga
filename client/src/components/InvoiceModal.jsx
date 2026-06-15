import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { X } from 'lucide-react';
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
  const { errors, validate, focusFirstError, formRef } = useFormValidation();

  useEffect(() => {
    if (vendor) {
      setFormData(prev => ({
        ...prev,
        vendor_id: vendor.id
      }));
    }
  }, [vendor]);

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
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Add New Invoice</h2>
          <button
            onClick={onClose}
            className="icon-button"
          >
            <X size={20} />
          </button>
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
                <label className="label">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  name="invoice_date"
                  value={formData.invoice_date}
                  onChange={handleInputChange}
                  className={`input-field ${
                    errors.invoice_date ? 'input-field--error' : ''
                  }`}
                />
                {errors.invoice_date && <p className="error-text">{errors.invoice_date}</p>}
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
              <label className="label">
                Amount (₹) *
              </label>
              <input
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
              />
              {errors.amount && <p className="error-text">{errors.amount}</p>}
              {formData.amount && (
                <p className="help-text">
                  {formatCurrency(formData.amount)}
                </p>
              )}
            </div>

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
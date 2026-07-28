import React, { useState, useEffect, useRef } from 'react';
import * as localDb from '../services/localDb';
import { toast } from 'react-hot-toast';
import { 
  X, Store, User, Phone, 
  Mail, MapPin, CreditCard, FileText, 
  ShieldCheck, Info, Tag, Globe,
  Calendar
} from 'lucide-react';
import { validateName, validateVendorCode, validateGST, validateEmail, validatePhone, validateInteger, validatePrice, validateString } from '../utils/validators';
import useFormValidation from '../hooks/useFormValidation';

const VendorModal = ({ vendor, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    vendor_code: '',
    contact_person: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    city: '',
    category: 'other',
    credit_days: 0,
    credit_limit: 0,
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const { errors, validate, focusFirstError, formRef } = useFormValidation();

  useEffect(() => {
    if (vendor) {
      setFormData({
        name: vendor.name || '',
        vendor_code: vendor.vendor_code || '',
        contact_person: vendor.contact_person || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        gstin: vendor.gstin || '',
        address: vendor.address || '',
        city: vendor.city || '',
        category: vendor.category || 'other',
        credit_days: vendor.credit_days || 0,
        credit_limit: vendor.credit_limit || 0,
        notes: vendor.notes || ''
      });
    }
  }, [vendor]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    let processedValue = value;
    if (name === 'vendor_code') {
      processedValue = value.toUpperCase().substring(0, 3).replace(/[^A-Z]/g, '');
    } else if (name === 'gstin') {
      processedValue = value.trim().toUpperCase();
    } else if (name === 'email') {
      processedValue = value.trim().toLowerCase();
    }

    setFormData(prev => ({ ...prev, [name]: processedValue }));
  };

  const validateForm = () => {
    return validate({
      name: () => validateName(formData.name, { label: 'Vendor name' }),
      vendor_code: () => formData.vendor_code ? validateVendorCode(formData.vendor_code) : { valid: true, error: null },
      gstin: () => formData.gstin ? validateGST(formData.gstin) : { valid: true, error: null },
      email: () => formData.email ? validateEmail(formData.email) : { valid: true, error: null },
      phone: () => formData.phone ? validatePhone(formData.phone) : { valid: true, error: null },
      credit_days: () => validateInteger(formData.credit_days, { required: false, min: 0, label: 'Credit days' }),
      credit_limit: () => formData.credit_limit ? validatePrice(formData.credit_limit, { label: 'Credit limit', min: 0 }) : { valid: true, error: null },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    if (!validateForm().valid) {
      focusFirstError();
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      // Save vendor (handles local IndexedDB caching and server sync)
      const toSave = {
        ...formData,
        id: vendor ? vendor.id : undefined,
        syncStatus: vendor ? vendor.syncStatus : undefined,
        vendor_type: vendor?.vendor_type || vendor?.type || 'other',
        branch_id: vendor?.branch_id || null,
        order_link: vendor?.order_link || null
      };
      const savedResult = await localDb.saveVendor(toSave);

      toast.success(vendor ? 'Vendor intelligence updated' : 'New partner onboarded');
      onSave({ id: savedResult?.id || toSave.id, name: formData.name, ...toSave });
    } catch (error) {
      console.error('Error saving vendor:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to sync partner data');
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay, rgba(0,0,0,0.35))', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 'var(--z-modal)', padding: 20 }}>
      <style>{`
        .vendor-modal-container {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          width: 100%;
          max-width: 760px;
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
        .vendor-form-body {
          padding: 32px;
          overflow-y: auto;
        }
        .vendor-form-sections-wrapper {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .vendor-section-card {
          background: var(--surface-2);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 24px;
          transition: border-color var(--transition-fast, 0.2s), box-shadow var(--transition-fast, 0.2s);
        }
        .vendor-section-card:hover {
          border-color: color-mix(in srgb, var(--accent) 30%, var(--border-subtle));
        }
        .vendor-section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 1.5px solid var(--border-subtle);
          padding-bottom: 12px;
        }
        .vendor-section-icon {
          color: var(--accent);
          display: flex;
          align-items: center;
        }
        .vendor-section-title-text {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: var(--text-heading, var(--text));
          letter-spacing: -0.01em;
        }
        .vendor-fields-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 640px) {
          .vendor-fields-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-span-full {
            grid-column: 1 / -1;
          }
        }
        .vendor-field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .vendor-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted, var(--muted));
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding-left: 2px;
        }
        .vendor-input-container {
          position: relative;
          display: flex;
          align-items: center;
        }
        .vendor-input-decorator {
          position: absolute;
          left: 14px;
          color: var(--text-muted, var(--muted));
          pointer-events: none;
          transition: color 0.15s ease;
          display: flex;
          align-items: center;
        }
        .vendor-input {
          width: 100%;
          padding: 11px 14px 11px 40px;
          border: 1.5px solid var(--border-subtle);
          border-radius: 10px;
          background: var(--surface);
          color: var(--text);
          font-size: 14px;
          line-height: var(--leading-normal, 1.4);
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          outline: none;
          font-family: inherit;
        }
        .vendor-input:hover {
          border-color: var(--text-muted, var(--muted));
        }
        .vendor-input:focus {
          border-color: var(--accent);
          background: var(--surface);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
        }
        .vendor-input-container:focus-within .vendor-input-decorator {
          color: var(--accent);
        }
        .vendor-input.field-error {
          border-color: var(--error);
        }
        .vendor-input.field-error:focus {
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 15%, transparent);
        }
        .vendor-error-lbl {
          font-size: 11px;
          color: var(--error);
          margin-top: 4px;
          padding-left: 2px;
          font-weight: 500;
        }
        .vendor-help-lbl {
          font-size: 10px;
          color: var(--text-muted, var(--muted));
          margin-top: 4px;
          padding-left: 2px;
        }
        select.vendor-input {
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          background-size: 16px;
          padding-right: 40px;
          cursor: pointer;
        }
        textarea.vendor-input {
          min-height: 80px;
          resize: vertical;
        }
      `}</style>
      <div className="vendor-modal-container">
        <div className="modal-header-premium" style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border-subtle)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <Store size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{vendor?.id ? 'Modify Partner' : 'Onboard Partner'}</h2>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Vendor Management Protocol</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}>
            <X size={20} />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="vendor-form-body">
          <div className="vendor-form-sections-wrapper">
            
            {/* Essential Identity */}
            <div className="vendor-section-card">
              <div className="vendor-section-header">
                <div className="vendor-section-icon"><Info size={16} /></div>
                <h4 className="vendor-section-title-text">Essential Identity</h4>
              </div>
              <div className="vendor-fields-grid">
                
                <div className="vendor-field-group">
                  <label className="vendor-label">Legal Entity Name *</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><Store size={15} /></div>
                    <input 
                      name="name" 
                      value={formData.name} 
                      onChange={handleInputChange} 
                      placeholder="e.g. Sarga Print Solutions"
                      className={`vendor-input ${errors.name ? 'field-error' : ''}`}
                    />
                  </div>
                  {errors.name && <span className="vendor-error-lbl">{errors.name}</span>}
                </div>

                <div className="vendor-field-group">
                  <label className="vendor-label">Tactical Code (3 Letters)</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><Tag size={15} /></div>
                    <input 
                      name="vendor_code" 
                      value={formData.vendor_code} 
                      onChange={handleInputChange} 
                      placeholder="e.g. SPS"
                      maxLength={3}
                      disabled={!!vendor}
                      className={`vendor-input ${errors.vendor_code ? 'field-error' : ''}`}
                    />
                  </div>
                  {errors.vendor_code ? (
                    <span className="vendor-error-lbl">{errors.vendor_code}</span>
                  ) : vendor ? (
                    <span className="vendor-help-lbl">Vendor code cannot be changed after creation</span>
                  ) : (
                    <span className="vendor-help-lbl">Unique ID for product sourcing</span>
                  )}
                </div>
                
                <div className="vendor-field-group vendor-span-full">
                  <label className="vendor-label">Industry Segment</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><Tag size={15} /></div>
                    <select 
                      name="category" 
                      value={formData.category} 
                      onChange={handleInputChange}
                      className="vendor-input"
                    >
                      <option value="offset_supplies">Offset Supplies</option>
                      <option value="chemicals">Chemicals</option>
                      <option value="paper">Paper</option>
                      <option value="ink">Ink</option>
                      <option value="equipment">Equipment</option>
                      <option value="frame">Frame</option>
                      <option value="memento">Memento</option>
                      <option value="id_card">ID Card</option>
                      <option value="other">Other Segment</option>
                    </select>
                  </div>
                </div>

              </div>
            </div>

            {/* Communication & Logistics */}
            <div className="vendor-section-card">
              <div className="vendor-section-header">
                <div className="vendor-section-icon"><Globe size={16} /></div>
                <h4 className="vendor-section-title-text">Communication & Logistics</h4>
              </div>
              <div className="vendor-fields-grid">

                <div className="vendor-field-group">
                  <label className="vendor-label">Strategic Liaison</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><User size={15} /></div>
                    <input 
                      name="contact_person" 
                      value={formData.contact_person} 
                      onChange={handleInputChange} 
                      placeholder="Primary point of contact" 
                      className="vendor-input"
                    />
                  </div>
                </div>

                <div className="vendor-field-group">
                  <label className="vendor-label">Communication Line</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><Phone size={15} /></div>
                    <input 
                      name="phone" 
                      value={formData.phone} 
                      onChange={handleInputChange} 
                      placeholder="10-digit mobile" 
                      maxLength={10} 
                      className={`vendor-input ${errors.phone ? 'field-error' : ''}`} 
                    />
                  </div>
                  {errors.phone && <span className="vendor-error-lbl">{errors.phone}</span>}
                </div>

                <div className="vendor-field-group">
                  <label className="vendor-label">Verified Email</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><Mail size={15} /></div>
                    <input 
                      name="email" 
                      value={formData.email} 
                      onChange={handleInputChange} 
                      placeholder="partner@domain.com" 
                      className={`vendor-input ${errors.email ? 'field-error' : ''}`} 
                    />
                  </div>
                  {errors.email && <span className="vendor-error-lbl">{errors.email}</span>}
                </div>

                <div className="vendor-field-group">
                  <label className="vendor-label">Taxation Identifier (GSTIN)</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><ShieldCheck size={15} /></div>
                    <input 
                      name="gstin" 
                      value={formData.gstin} 
                      onChange={handleInputChange} 
                      placeholder="GSTIN Format" 
                      maxLength={15} 
                      className={`vendor-input ${errors.gstin ? 'field-error' : ''}`} 
                    />
                  </div>
                  {errors.gstin && <span className="vendor-error-lbl">{errors.gstin}</span>}
                </div>

                <div className="vendor-field-group vendor-span-full">
                  <label className="vendor-label">Operations Headquarters</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator" style={{ top: '15px', transform: 'none' }}><MapPin size={15} /></div>
                    <textarea 
                      name="address" 
                      value={formData.address} 
                      onChange={handleInputChange} 
                      placeholder="Full logistics address" 
                      rows={2} 
                      className="vendor-input"
                      style={{ paddingLeft: '40px' }}
                    />
                  </div>
                </div>

                <div className="vendor-field-group vendor-span-full">
                  <label className="vendor-label">Operating City</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><Globe size={15} /></div>
                    <input 
                      name="city" 
                      value={formData.city} 
                      onChange={handleInputChange} 
                      placeholder="Base city" 
                      className="vendor-input"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* Financial Governance */}
            <div className="vendor-section-card">
              <div className="vendor-section-header">
                <div className="vendor-section-icon"><CreditCard size={16} /></div>
                <h4 className="vendor-section-title-text">Financial Governance</h4>
              </div>
              <div className="vendor-fields-grid">

                <div className="vendor-field-group">
                  <label className="vendor-label">Credit Maturity (Days)</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><Calendar size={15} /></div>
                    <input 
                      type="number" 
                      name="credit_days" 
                      value={formData.credit_days} 
                      onChange={handleInputChange} 
                      min="0" 
                      className={`vendor-input ${errors.credit_days ? 'field-error' : ''}`}
                    />
                  </div>
                  {errors.credit_days && <span className="vendor-error-lbl">{errors.credit_days}</span>}
                </div>

                <div className="vendor-field-group">
                  <label className="vendor-label">Exposure Limit</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator"><CreditCard size={15} /></div>
                    <input 
                      type="number" 
                      name="credit_limit" 
                      value={formData.credit_limit} 
                      onChange={handleInputChange} 
                      min="0" 
                      step="0.01" 
                      className={`vendor-input ${errors.credit_limit ? 'field-error' : ''}`}
                    />
                  </div>
                  {errors.credit_limit && <span className="vendor-error-lbl">{errors.credit_limit}</span>}
                </div>

                <div className="vendor-field-group vendor-span-full">
                  <label className="vendor-label">Strategic Notes</label>
                  <div className="vendor-input-container">
                    <div className="vendor-input-decorator" style={{ top: '15px', transform: 'none' }}><FileText size={15} /></div>
                    <textarea 
                      name="notes" 
                      value={formData.notes} 
                      onChange={handleInputChange} 
                      placeholder="Internal observations..." 
                      rows={2} 
                      className="vendor-input"
                      style={{ paddingLeft: '40px' }}
                    />
                  </div>
                </div>

              </div>
            </div>

          </div>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn btn-ghost" 
              style={{ padding: '10px 24px', borderRadius: '10px', height: 44, fontSize: '14px', fontWeight: 600 }} 
              disabled={loading}
            >
              Discard
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ padding: '10px 32px', borderRadius: '10px', height: 44, fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
              disabled={loading}
            >
              {loading ? (
                <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
              ) : (
                vendor ? 'Update Profile' : 'Finalize Onboarding'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VendorModal;

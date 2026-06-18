import React, { useState, useEffect } from 'react';
import api from '../services/api';
import * as localDb from '../services/localDb';
import { toast } from 'react-hot-toast';
import { 
  X, Store, User, Phone, 
  Mail, MapPin, CreditCard, FileText, 
  ShieldCheck, Info, Tag, Globe,
  Calendar
} from 'lucide-react';
import { validateName, validateVendorCode, validateGST, validateEmail, validatePhone } from '../utils/validators';
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
      const toSave = {
        ...formData,
        id: vendor ? vendor.id : undefined,
        syncStatus: vendor ? vendor.syncStatus : undefined
      };
      await localDb.saveVendor(toSave);
      toast.success(vendor ? 'Vendor intelligence updated' : 'New partner onboarded');
      onSave();
    } catch (error) {
      console.error('Error saving vendor:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to sync partner data');
      if (error.response?.data?.errors) {
        const serverErrors = error.response.data.errors;
        Object.entries(serverErrors).forEach(([field, msg]) => {
          if (typeof msg === 'string') {
            // set field-level errors from server
          }
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay, rgba(0,0,0,0.3))', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }}>
      <div className="modal-content-premium" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 28, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
        <div className="modal-header-premium" style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border-subtle)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <Store size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{vendor ? 'Modify Partner' : 'Onboard Partner'}</h2>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Vendor Management Protocol</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}>
            <X size={20} />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} style={{ padding: 32, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            {/* Essential Identity */}
            <div className="form-section">
               <h3 className="section-title"><Info size={16} /> Essential Identity</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                  <div className="input-group-premium">
                    <label>Legal Entity Name *</label>
                    <div className="input-wrap">
                      <Store size={16} className="input-icon" />
                      <input 
                        name="name" 
                        value={formData.name} 
                        onChange={handleInputChange} 
                        placeholder="e.g. Sarga Print Solutions"
                        className={errors.name ? 'error' : ''}
                      />
                    </div>
                    {errors.name && <span className="error-text">{errors.name}</span>}
                  </div>

                  <div className="input-group-premium">
                    <label>Tactical Code (3 Letters)</label>
                    <div className="input-wrap">
                      <Tag size={16} className="input-icon" />
                      <input 
                        name="vendor_code" 
                        value={formData.vendor_code} 
                        onChange={handleInputChange} 
                        placeholder="e.g. SPS"
                        maxLength={3}
                        className={errors.vendor_code ? 'error' : ''}
                      />
                    </div>
                    {errors.vendor_code ? (
                      <span className="error-text">{errors.vendor_code}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 4 }}>Unique ID for product sourcing</span>
                    )}
                  </div>
                  
                  <div className="input-group-premium">
                    <label>Industry Segment</label>
                    <div className="input-wrap">
                      <Tag size={16} className="input-icon" />
                      <select name="category" value={formData.category} onChange={handleInputChange}>
                        <option value="offset_supplies">Offset Supplies</option>
                        <option value="chemicals">Chemicals</option>
                        <option value="paper">Paper</option>
                        <option value="ink">Ink</option>
                        <option value="equipment">Equipment</option>
                        <option value="other">Other Segment</option>
                      </select>
                    </div>
                  </div>
               </div>
            </div>

            {/* Communication & Logistics */}
            <div className="form-section">
               <h3 className="section-title"><User size={16} /> Communication & Logistics</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                  <div className="input-group-premium">
                    <label>Strategic Liaison</label>
                    <div className="input-wrap">
                      <User size={16} className="input-icon" />
                      <input name="contact_person" value={formData.contact_person} onChange={handleInputChange} placeholder="Primary point of contact" />
                    </div>
                  </div>
                  <div className="input-group-premium">
                    <label>Communication Line</label>
                    <div className="input-wrap">
                      <Phone size={16} className="input-icon" />
                      <input name="phone" value={formData.phone} onChange={handleInputChange} placeholder="10-digit mobile" maxLength={10} className={errors.phone ? 'error' : ''} />
                    </div>
                    {errors.phone && <span className="error-text">{errors.phone}</span>}
                  </div>
                  <div className="input-group-premium">
                    <label>Verified Email</label>
                    <div className="input-wrap">
                      <Mail size={16} className="input-icon" />
                      <input name="email" value={formData.email} onChange={handleInputChange} placeholder="partner@domain.com" className={errors.email ? 'error' : ''} />
                    </div>
                    {errors.email && <span className="error-text">{errors.email}</span>}
                  </div>
                  <div className="input-group-premium">
                    <label>Taxation Identifier (GSTIN)</label>
                    <div className="input-wrap">
                      <ShieldCheck size={16} className="input-icon" />
                      <input name="gstin" value={formData.gstin} onChange={handleInputChange} placeholder="GSTIN Format" maxLength={15} className={errors.gstin ? 'error' : ''} />
                    </div>
                    {errors.gstin && <span className="error-text">{errors.gstin}</span>}
                  </div>
                  <div className="input-group-premium md:col-span-2">
                    <label>Operations Headquarters</label>
                    <div className="input-wrap">
                      <MapPin size={16} className="input-icon" />
                      <textarea name="address" value={formData.address} onChange={handleInputChange} placeholder="Full logistics address" rows={2} />
                    </div>
                  </div>
                  <div className="input-group-premium">
                    <label>Operating City</label>
                    <div className="input-wrap">
                      <Globe size={16} className="input-icon" />
                      <input name="city" value={formData.city} onChange={handleInputChange} placeholder="Base city" />
                    </div>
                  </div>
               </div>
            </div>

            {/* Financial Terms */}
            <div className="form-section">
               <h3 className="section-title"><CreditCard size={16} /> Financial Governance</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                  <div className="input-group-premium">
                    <label>Credit Maturity (Days)</label>
                    <div className="input-wrap">
                      <Calendar size={16} className="input-icon" />
                      <input type="number" name="credit_days" value={formData.credit_days} onChange={handleInputChange} min="0" />
                    </div>
                  </div>
                  <div className="input-group-premium">
                    <label>Exposure Limit</label>
                    <div className="input-wrap">
                      <CreditCard size={16} className="input-icon" />
                      <input type="number" name="credit_limit" value={formData.credit_limit} onChange={handleInputChange} min="0" step="0.01" />
                    </div>
                  </div>
                  <div className="input-group-premium md:col-span-2">
                    <label>Strategic Notes</label>
                    <div className="input-wrap">
                      <FileText size={16} className="input-icon" />
                      <textarea name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Internal observations..." rows={2} />
                    </div>
                  </div>
               </div>
            </div>
          </div>

          <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost" style={{ padding: '8px 24px' }} disabled={loading}>
              Discard
            </button>
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 32px', height: 44 }} disabled={loading}>
              {loading ? <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--card)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div> : (vendor ? 'Update Profile' : 'Finalize Onboarding')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VendorModal;

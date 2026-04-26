import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { 
  X, Store, User, Phone, 
  Mail, MapPin, CreditCard, FileText, 
  ShieldCheck, Info, Tag, Globe,
  Calendar
} from 'lucide-react';

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
  const [errors, setErrors] = useState({});

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
    
    // Auto-uppercase and limit vendor_code to 3 chars
    let processedValue = value;
    if (name === 'vendor_code') {
      processedValue = value.toUpperCase().substring(0, 3).replace(/[^A-Z]/g, '');
    }

    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));

    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Vendor name is required';
    if (formData.vendor_code && formData.vendor_code.length !== 3) {
      newErrors.vendor_code = 'Tactical code must be exactly 3 letters';
    }
    if (formData.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[A-Z]{1}\d{1}$/.test(formData.gstin)) newErrors.gstin = 'Invalid GSTIN format';
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (formData.credit_days < 0) newErrors.credit_days = 'Credit days cannot be negative';
    if (formData.credit_limit < 0) newErrors.credit_limit = 'Credit limit cannot be negative';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      if (vendor) {
        await api.put(`/vendors/${vendor.id}`, formData);
        toast.success('Vendor intelligence updated');
      } else {
        await api.post('/vendors', formData);
        toast.success('New partner onboarded');
      }
      onSave();
    } catch (error) {
      console.error('Error saving vendor:', error);
      toast.error(error.response?.data?.message || 'Failed to sync partner data');
      if (error.response?.data?.errors) setErrors(error.response.data.errors);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content-premium max-w-720">
        <div className="modal-header-premium">
          <div className="flex items-center gap-16">
            <div className="modal-icon-wrap">
              <Store size={22} className="text-accent" />
            </div>
            <div>
              <h2 className="text-20 font-700 tracking-tight">{vendor ? 'Modify Partner' : 'Onboard Partner'}</h2>
              <p className="text-12 text-muted uppercase tracking-wider font-600">Vendor Management Protocol</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body-premium">
          <div className="form-sections-grid">
            {/* Essential Identity */}
            <div className="form-section">
               <h3 className="section-title"><Info size={16} /> Essential Identity</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                  <div className="input-group-premium">
                    <label>Legal Entity Name</label>
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
                      <span className="text-10 text-muted pl-4">Unique ID for product sourcing</span>
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
                      <input name="phone" value={formData.phone} onChange={handleInputChange} placeholder="+91 XXXXX XXXXX" />
                    </div>
                  </div>
                  <div className="input-group-premium">
                    <label>Verified Email</label>
                    <div className="input-wrap">
                      <Mail size={16} className="input-icon" />
                      <input name="email" value={formData.email} onChange={handleInputChange} placeholder="partner@domain.com" />
                    </div>
                  </div>
                  <div className="input-group-premium">
                    <label>Taxation Identifier (GSTIN)</label>
                    <div className="input-wrap">
                      <ShieldCheck size={16} className="input-icon" />
                      <input name="gstin" value={formData.gstin} onChange={handleInputChange} placeholder="GSTIN Format" maxLength={15} />
                    </div>
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
                      <input type="number" name="credit_days" value={formData.credit_days} onChange={handleInputChange} />
                    </div>
                  </div>
                  <div className="input-group-premium">
                    <label>Exposure Limit (₹)</label>
                    <div className="input-wrap">
                      <CreditCard size={16} className="input-icon" />
                      <input type="number" name="credit_limit" value={formData.credit_limit} onChange={handleInputChange} />
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

          <div className="modal-footer-premium">
            <button type="button" onClick={onClose} className="btn btn-ghost px-24" disabled={loading}>
              Discard
            </button>
            <button type="submit" className="btn btn-primary px-32 h-44" disabled={loading}>
              {loading ? <div className="spinner-mini"></div> : (vendor ? 'Update Profile' : 'Finalize Onboarding')}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(8px);
          display: grid;
          place-items: center;
          z-index: 1000;
          padding: 20px;
          animation: fade-in 0.3s ease;
        }

        .modal-content-premium {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 28px;
          width: 100%;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-2xl);
          animation: slide-up 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .modal-header-premium {
          padding: 24px 32px;
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--surface-2);
        }

        .modal-icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          display: grid;
          place-items: center;
          box-shadow: var(--shadow-sm);
        }

        .modal-close-btn {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          color: var(--text-muted);
          transition: all 0.2s;
          cursor: pointer;
        }
        .modal-close-btn:hover { background: var(--error-bg); color: var(--error); }

        .modal-body-premium {
          padding: 32px;
          overflow-y: auto;
        }

        .form-sections-grid { display: flex; flex-direction: column; gap: 40px; }
        
        .section-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 24px;
          display: flex;
          items-center gap: 8px;
        }

        .input-group-premium { display: flex; flex-direction: column; gap: 8px; }
        .input-group-premium label { font-size: 12px; font-weight: 700; color: var(--muted); padding-left: 4px; }
        
        .input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          color: var(--muted);
          pointer-events: none;
          transition: color 0.2s;
        }

        .input-wrap input, 
        .input-wrap select, 
        .input-wrap textarea {
          width: 100%;
          padding: 12px 16px 12px 44px;
          background: var(--surface-2);
          border: 1.5px solid var(--border-subtle);
          border-radius: 14px;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          color: var(--text);
        }

        .input-wrap input:focus, 
        .input-wrap select:focus, 
        .input-wrap textarea:focus {
          border-color: var(--accent);
          background: var(--surface);
          box-shadow: 0 0 0 4px var(--accent-soft);
          outline: none;
        }

        .input-wrap input:focus + .input-icon,
        .input-wrap textarea:focus + .input-icon {
          color: var(--accent);
        }

        .error-text { font-size: 11px; color: var(--error); font-weight: 600; padding-left: 4px; }
        input.error { border-color: var(--error) !important; }

        .modal-footer-premium {
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          justify-content: flex-end;
          gap: 16px;
        }

        .spinner-mini {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default VendorModal;
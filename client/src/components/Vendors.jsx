import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import VendorModal from './VendorModal';
import InvoiceModal from './InvoiceModal';
import PaymentModal from './PaymentModal';
import VendorDetail from './VendorDetail';
import { Search, Filter, Store, Tag, Eye, Edit, FileText, Trash2, User, Phone, ChevronRight } from 'lucide-react';
import '../pages/Vendors.css';

const Vendors = ({ refreshKey = 0 }) => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail'

  useEffect(() => {
    loadVendors();
  }, [searchTerm, categoryFilter, refreshKey]);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (categoryFilter) params.append('category', categoryFilter);

      const response = await api.get(`/vendors?${params}`);
      setVendors(response.data.data);
    } catch (error) {
      console.error('Error loading vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = () => {
    setSelectedVendor(null);
    setShowVendorModal(true);
  };

  const handleEditVendor = (vendor) => {
    setSelectedVendor(vendor);
    setShowVendorModal(true);
  };

  const handleDeleteVendor = async (vendorId) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;

    try {
      await api.delete(`/vendors/${vendorId}`);
      toast.success('Vendor deleted successfully');
      loadVendors();
    } catch (error) {
      console.error('Error deleting vendor:', error);
      toast.error(error.response?.data?.message || 'Failed to delete vendor');
    }
  };

  const handleViewVendor = (vendor) => {
    setSelectedVendor(vendor);
    setViewMode('detail');
  };

  const handleAddInvoice = (vendor) => {
    setSelectedVendor(vendor);
    setShowInvoiceModal(true);
  };

  const handleAddPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  };

  const handleVendorSaved = async () => {
    setShowVendorModal(false);
    await loadVendors();
    // If we're in detail view, the VendorDetail component will re-fetch data 
    // because it has its own internal state and useEffect. 
    // However, we can also refresh the selectedVendor reference to be sure.
    if (selectedVendor) {
      const updated = vendors.find(v => v.id === selectedVendor.id);
      if (updated) setSelectedVendor({ ...updated });
    }
  };

  const handleInvoiceSaved = () => {
    setShowInvoiceModal(false);
    loadVendors();
  };

  const handlePaymentSaved = () => {
    setShowPaymentModal(false);
    loadVendors();
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
      <span className={statusClasses[status] || 'status-badge status-badge--default'}>
        {status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
    );
  };

  return (
    <>
      {viewMode === 'detail' && selectedVendor ? (
        <VendorDetail
          vendor={selectedVendor}
          onBack={() => setViewMode('list')}
          onAddInvoice={() => handleAddInvoice(selectedVendor)}
          onAddPayment={handleAddPayment}
          onEditVendor={() => handleEditVendor(selectedVendor)}
          onDeleteVendor={() => handleDeleteVendor(selectedVendor.id)}
          formatCurrency={formatCurrency}
          getStatusBadge={getStatusBadge}
        />
      ) : (
        <div className="directory-container">
          {/* Filters Section */}
          <div className="glass-card vendors-filters">
            <div className="search-wrapper">
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder="Search vendors by name, contact or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />
            </div>
            
            <div className="filter-wrapper">
              <Filter className="filter-icon" size={18} />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input-field"
              >
                <option value="">All Categories</option>
                <option value="offset_supplies">Offset Supplies</option>
                <option value="chemicals">Chemicals</option>
                <option value="paper">Paper</option>
                <option value="ink">Ink</option>
                <option value="equipment">Equipment</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Grid Content */}
          {loading ? (
            <div className="loading-container">
              <div className="spinner-premium"></div>
              <p style={{ color: 'var(--muted)' }}>Curating vendor directory...</p>
            </div>
          ) : (
            <div className="vendor-grid">
              {vendors.map((vendor) => (
                <div key={vendor.id} className="vendor-card">
                  <div className="vendor-card__header">
                    <div className="vendor-card__main">
                      <div className="vendor-icon-wrap">
                        <Store size={20} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div className="vendor-card__info">
                        <div className="vendor-card__name-row">
                          <h3 className="vendor-card__name">
                            {vendor.name}
                          </h3>
                          {vendor.vendor_code && (
                            <span className="vendor-code-badge">{vendor.vendor_code}</span>
                          )}
                        </div>
                        <div className="vendor-card__category">
                          <Tag size={12} style={{ color: 'var(--muted)' }} />
                          <span className="vendor-card__category-text">
                            {vendor.category?.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="vendor-card__actions">
                      <button onClick={() => handleViewVendor(vendor)} className="icon-btn-premium" title="Details"><Eye size={16} /></button>
                      <button onClick={() => handleEditVendor(vendor)} className="icon-btn-premium" title="Edit"><Edit size={16} /></button>
                      <button onClick={() => handleAddInvoice(vendor)} className="icon-btn-premium" title="Invoice"><FileText size={16} /></button>
                      <button onClick={() => handleDeleteVendor(vendor.id)} className="icon-btn-premium icon-btn-premium--danger" title="Delete"><Trash2 size={16} /></button>
                    </div>
                  </div>

                  <div className="vendor-card__body">
                    <div className="vendor-card__contact">
                      {vendor.contact_person && (
                        <div className="contact-item">
                          <User size={14} /> <span>{vendor.contact_person}</span>
                        </div>
                      )}
                      {vendor.phone && (
                        <div className="contact-item">
                          <Phone size={14} /> <span>{vendor.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="vendor-card__summary">
                      <div className="vendor-card__stat">
                        <span className="stat-mini__label">This Month</span>
                        <span className="stat-mini__value stat-mini__value--success">
                          {formatCurrency(vendor.this_month_spend || 0)}
                        </span>
                      </div>
                      <div className="vendor-card__stat">
                        <span className="stat-mini__label">Payable</span>
                        <span className="stat-mini__value stat-mini__value--error">
                          {formatCurrency(vendor.pending_amount || 0)}
                        </span>
                      </div>
                      <div className="vendor-card__stat">
                        <span className="stat-mini__label">Invoices</span>
                        <span className="stat-mini__value">
                          {vendor.total_invoices || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="vendor-card__footer">
                     <div className="vendor-card__meta">
                        <span>{vendor.total_invoices || 0} Invoices</span>
                        {vendor.overdue_invoices > 0 && (
                          <span className="text-error">• {vendor.overdue_invoices} Overdue</span>
                        )}
                     </div>
                     <button 
                      onClick={() => handleViewVendor(vendor)}
                      className="vendor-card__link"
                     >
                       Profile <ChevronRight size={14} />
                     </button>
                  </div>
                </div>
              ))}

              {vendors.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state__icon">
                    <Store size={48} style={{ color: 'var(--muted)', opacity: 0.3 }} />
                  </div>
                  <h3 className="empty-state__title">No vendors found</h3>
                  <p className="empty-state__text">
                    We couldn't find any vendors matching your search criteria. Try adjusting your filters.
                  </p>
                  <button
                    onClick={handleAddVendor}
                    className="btn btn-primary"
                  >
                    Add New Vendor
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Modals */}
      {showVendorModal && (
        <VendorModal
          vendor={selectedVendor}
          onClose={() => setShowVendorModal(false)}
          onSave={handleVendorSaved}
        />
      )}

      {showInvoiceModal && (
        <InvoiceModal
          vendor={selectedVendor}
          onClose={() => setShowInvoiceModal(false)}
          onSave={handleInvoiceSaved}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          invoice={selectedInvoice}
          onClose={() => setShowPaymentModal(false)}
          onSave={handlePaymentSaved}
        />
      )}
    </>
  );
};

export default Vendors;
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as localDb from '../services/localDb';
import { toast } from 'react-hot-toast';
import VendorModal from './VendorModal';
import InvoiceModal from './InvoiceModal';
import PaymentModal from './PaymentModal';
import VendorDetail from './VendorDetail';
import { Search, Filter, Store, Tag, Eye, Edit, FileText, Trash2, User, Phone, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import '../pages/Vendors.css';

const Vendors = ({ 
  refreshKey = 0,
  canEdit = true,
  canDelete = true,
  canAdd = true
}) => {
  const _navigate = useNavigate();
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
  const [vendorRefreshKey, setVendorRefreshKey] = useState(0);

  const [exportFilter, setExportFilter] = useState('all');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  const fetchAllVendorsForExport = async (filterType) => {
    try {
      let data = await localDb.getVendors({
        search: searchTerm,
        type: categoryFilter
      });

      if (filterType === 'due') {
        data = data.filter(v => (Number(v.pending_amount) || 0) > 0);
      } else if (filterType === 'limit_exceeded') {
        data = data.filter(v => v.credit_limit > 0 && (Number(v.pending_amount) || 0) >= Number(v.credit_limit));
      }
      return data;
    } catch (err) {
      console.error('Failed to fetch vendors for export:', err);
      toast.error('Failed to get vendors data.');
      return [];
    }
  };

  const getExportTitle = () => {
    const parts = ['Vendors Directory'];
    if (exportFilter === 'due') parts.push('With Outstanding');
    if (exportFilter === 'limit_exceeded') parts.push('Limit Exceeded');
    if (searchTerm) parts.push(`Search: "${searchTerm}"`);
    return parts.join(' | ');
  };

  const exportToPDF = async () => {
    const toastId = toast.loading('Preparing PDF...');
    try {
      const allVendors = await fetchAllVendorsForExport(exportFilter);
      if (allVendors.length === 0) {
        toast.error('No vendors to export', { id: toastId });
        return;
      }

      const [{ default: jsPDF }, autotable] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      toast.success('Generating PDF...', { id: toastId });

      const doc = new jsPDF('l', 'mm', 'a4');
      const title = getExportTitle();

      const tableColumn = [
        'Code', 
        'Vendor Name', 
        'Category', 
        'Contact Person', 
        'Phone', 
        'GSTIN',
        'This Month Spend', 
        'Outstanding', 
        'Credit Limit'
      ];

      const tableRows = allVendors.map(v => [
        v.vendor_code || '',
        v.name || '',
        v.category ? String(v.category).replace('_', ' ') : '',
        v.contact_person || '',
        v.phone || '',
        v.gst || '',
        `Rs. ${Number(v.this_month_spend || 0).toFixed(2)}`,
        `Rs. ${Number(v.pending_amount || 0).toFixed(2)}`,
        v.credit_limit > 0 ? `Rs. ${Number(v.credit_limit).toFixed(2)}` : 'No Limit'
      ]);

      doc.setFontSize(16);
      doc.text(title, 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')} | Total Vendors: ${allVendors.length}`, 14, 22);
      
      doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 28,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229], fontSize: 8, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 250] }
      });

      doc.save(`vendors-${new Date().toISOString().split('T')[0]}.pdf`);
      setShowExportMenu(false);
      toast.dismiss(toastId);
    } catch (error) {
      console.error('PDF Export failed:', error);
      toast.error('PDF Export failed', { id: toastId });
    }
  };

  const exportToExcel = async () => {
    const toastId = toast.loading('Preparing CSV...');
    try {
      const allVendors = await fetchAllVendorsForExport(exportFilter);
      if (allVendors.length === 0) {
        toast.error('No vendors to export', { id: toastId });
        return;
      }
      toast.success('Generating CSV...', { id: toastId });

      const headers = [
        'Code', 
        'Vendor Name', 
        'Category', 
        'Contact Person', 
        'Phone', 
        'Email',
        'GSTIN',
        'Address',
        'This Month Spend', 
        'Outstanding', 
        'Credit Limit',
        'Total Invoices'
      ];

      const rows = allVendors.map(v => [
        v.vendor_code || '',
        v.name || '',
        v.category ? String(v.category).replace('_', ' ') : '',
        v.contact_person || '',
        v.phone || '',
        v.email || '',
        v.gst || '',
        v.address || '',
        Number(v.this_month_spend || 0),
        Number(v.pending_amount || 0),
        Number(v.credit_limit || 0),
        Number(v.total_invoices || 0)
      ]);

      const title = getExportTitle();
      const csvContent = [['Report: ' + title], headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vendors-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
      toast.dismiss(toastId);
    } catch (error) {
      console.error('CSV Export failed:', error);
      toast.error('CSV Export failed', { id: toastId });
    }
  };

  const loadVendors = async () => {
    try {
      setLoading(true);
      const data = await localDb.getVendors({
        search: searchTerm,
        type: categoryFilter
      });
      setVendors(data);
      return data;
    } catch (error) {
      console.error('Error loading vendors:', error);
      toast.error('Failed to load vendors');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Safety timeout: if loading exceeds 35s, force-show fallback
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setVendors([]);
        console.warn('[Vendors] Load timed out after 35s, showing empty state');
      }
    }, 35000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    loadVendors();
  }, [searchTerm, categoryFilter, refreshKey]);

  const handleAddVendor = () => {
    setSelectedVendor(null);
    setShowVendorModal(true);
  };

  const handleEditVendor = (vendor) => {
    setSelectedVendor(vendor);
    setShowVendorModal(true);
  };

  const handleDeleteVendor = async (vendorId) => {
    if (!window.confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) return;

    try {
      await localDb.deleteVendor(vendorId);
      toast.success('Vendor deleted successfully');
      setViewMode('list');
      setSelectedVendor(null);
      loadVendors();
    } catch (error) {
      console.error('Error deleting vendor:', error);
      const serverMessage = error.response?.data?.message || error.message;
      if (serverMessage && serverMessage.includes('unpaid invoices')) {
        if (window.confirm('This vendor has unpaid invoices or payments due. Do you want to force delete this vendor?')) {
          try {
            await localDb.deleteVendor(vendorId, true);
            toast.success('Vendor force-deleted successfully');
            setViewMode('list');
            setSelectedVendor(null);
            loadVendors();
            return;
          } catch (forceError) {
            console.error('Error force deleting vendor:', forceError);
            toast.error(forceError.response?.data?.message || forceError.message || 'Failed to force delete vendor');
            return;
          }
        }
      }
      toast.error(serverMessage || 'Failed to delete vendor');
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
    setVendorRefreshKey(k => k + 1);
    const updatedList = await loadVendors();
    if (selectedVendor) {
      const updated = updatedList.find(v => v.id === selectedVendor.id);
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
          onBack={() => {
            setViewMode('list');
            loadVendors();
          }}
          onAddInvoice={() => handleAddInvoice(selectedVendor)}
          onAddPayment={handleAddPayment}
          onEditVendor={() => handleEditVendor(selectedVendor)}
          onDeleteVendor={() => handleDeleteVendor(selectedVendor.id)}
          formatCurrency={formatCurrency}
          getStatusBadge={getStatusBadge}
          refreshKey={vendorRefreshKey}
          canEdit={canEdit}
          canDelete={canDelete}
          canAdd={canAdd}
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
                <option value="frame">Frame</option>
                <option value="memento">Memento</option>
                <option value="id_card">ID Card</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="export-dropdown-wrapper" ref={exportRef}>
              <button className="toolbar-btn toolbar-btn--icon" title="Export Vendors" onClick={() => setShowExportMenu(prev => !prev)}>
                <Download size={16} />
              </button>
              {showExportMenu && (
                <div className="export-dropdown-menu">
                  <div className="export-filter-group">
                    {[
                      { value: 'all', label: 'All Vendors' },
                      { value: 'due', label: 'With Outstanding' },
                      { value: 'limit_exceeded', label: 'Limit Exceeded' },
                    ].map(opt => (
                      <label key={opt.value} className={`export-filter-option ${exportFilter === opt.value ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="exportFilter"
                          value={opt.value}
                          checked={exportFilter === opt.value}
                          onChange={() => setExportFilter(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="export-dropdown-divider" />
                  <button className="export-dropdown-item" onClick={exportToPDF}>
                    <FileText size={14} /> Export as PDF
                  </button>
                  <button className="export-dropdown-item" onClick={exportToExcel}>
                    <FileSpreadsheet size={14} /> Export as Excel (CSV)
                  </button>
                </div>
              )}
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
                      {canEdit && <button onClick={() => handleEditVendor(vendor)} className="icon-btn-premium" title="Edit"><Edit size={16} /></button>}
                      {canAdd && <button onClick={() => handleAddInvoice(vendor)} className="icon-btn-premium" title="Invoice"><FileText size={16} /></button>}
                      {canDelete && <button onClick={() => handleDeleteVendor(vendor.id)} className="icon-btn-premium icon-btn-premium--danger" title="Delete"><Trash2 size={16} /></button>}
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
                        <span className="stat-mini__label">Outstanding</span>
                        <span className={`stat-mini__value ${
                          !vendor.pending_amount || vendor.pending_amount <= 0
                            ? 'stat-mini__value--success'
                            : vendor.credit_limit > 0 && vendor.pending_amount >= vendor.credit_limit
                              ? 'stat-mini__value--danger'
                              : 'stat-mini__value--warning'
                        }`}>
                          {formatCurrency(vendor.pending_amount || 0)}
                        </span>
                        {vendor.credit_limit > 0 && (
                          <span className="stat-mini__label" style={{ fontSize: 9 }}>
                            Limit: {formatCurrency(vendor.credit_limit)}
                          </span>
                        )}
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
                  {canAdd && (
                    <button
                      onClick={handleAddVendor}
                      className="btn btn-primary"
                    >
                      Add New Vendor
                    </button>
                  )}
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
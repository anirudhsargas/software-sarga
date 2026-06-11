import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useNavigate, useSearchParams } from 'react-router-dom';
import VendorsList from '../components/Vendors';
import VendorDetail from '../components/VendorDetail';
import VendorDashboard from '../components/VendorDashboard';
import VendorModal from '../components/VendorModal';
import InvoiceModal from '../components/InvoiceModal';
import PaymentModal from '../components/PaymentModal';
import api from '../services/api';
import auth from '../services/auth';
import { toast } from 'react-hot-toast';
import { Plus, TrendingUp, List } from 'lucide-react';
import './Vendors.css';

const Vendors = () => {
  const navigate = useNavigate();
  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';
  const isOnlyAdmin = user?.role === 'Admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentView = searchParams.get('view') || 'dashboard';

  const setCurrentView = useCallback((view) => {
    setSearchParams({ view });
  }, [setSearchParams]);

  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  }, []);

  const getStatusBadge = useCallback((status) => {
    const statusClasses = {
      paid: 'status-badge--success',
      partial: 'status-badge--info',
      overdue: 'status-badge--error',
      pending: 'status-badge--warning'
    };

    return (
      <span className={`status-badge ${statusClasses[status] || 'status-badge--default'}`}>
        {status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
    );
  }, []);

  const handleAddVendor = useCallback(() => {
    setEditingVendor(null);
    setShowVendorModal(true);
  }, []);

  const handleEditVendor = useCallback((vendor) => {
    if (!isAdmin) {
      toast.error('Access denied. Insufficient permissions.');
      return;
    }
    setEditingVendor(vendor);
    setShowVendorModal(true);
  }, [isAdmin]);

  const handleDeleteVendor = useCallback(async (vendorId) => {
    if (!isOnlyAdmin) {
      toast.error('Access denied. Insufficient permissions.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/vendors/${vendorId}`);
      toast.success('Vendor deleted successfully');
      setRefreshKey(k => k + 1);
    } catch (error) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor');
    }
  }, [isOnlyAdmin]);

  const handleVendorSaved = useCallback(() => {
    setShowVendorModal(false);
    setEditingVendor(null);
    setRefreshKey(k => k + 1);
  }, []);

  const handleViewVendor = useCallback((vendor) => {
    setSelectedVendor(vendor);
    navigate(`/dashboard/vendors/${vendor.id}?view=list`);
  }, [navigate]);

  const handleAddInvoice = useCallback((vendor) => {
    setSelectedVendor(vendor);
    setShowInvoiceModal(true);
  }, []);

  const handleAddPayment = useCallback((invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  }, []);

  const handleInvoiceSaved = useCallback(() => {
    setShowInvoiceModal(false);
    setSelectedVendor(null);
    setRefreshKey(k => k + 1);
  }, []);

  const handlePaymentSaved = useCallback(() => {
    setShowPaymentModal(false);
    setSelectedInvoice(null);
    setRefreshKey(k => k + 1);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedVendor(null);
    navigate('/dashboard/vendors?view=list');
  }, [navigate]);

  return (
    <div className="page-container">
      {/* Header section with glassmorphism */}
      <div className="vendor-header">
        <div className="vendor-header__title">
          <h1>
            Vendor <span style={{ color: 'var(--muted)' }}>Management</span>
          </h1>
          <p>
            Monitor vendor performance, manage procurement invoices, and track outstanding liabilities across all branches.
          </p>
        </div>
        
        <div className="vendor-header__actions">
          <div className="view-toggle">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`view-toggle__btn ${currentView === 'dashboard' ? 'view-toggle__btn--active' : ''}`}
            >
              <TrendingUp size={16} />
              <span>Analytics</span>
            </button>
            <button
              onClick={() => setCurrentView('list')}
              className={`view-toggle__btn ${currentView === 'list' ? 'view-toggle__btn--active' : ''}`}
            >
              <List size={16} />
              <span>Directory</span>
            </button>
          </div>

          <button
            onClick={handleAddVendor}
            className="btn btn-primary"
          >
            <Plus size={16} /> 
            <span>New Vendor</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div>
        <Routes>
          <Route path="/" element={
            currentView === 'dashboard' ? (
              <VendorDashboard refreshKey={refreshKey} />
            ) : (
              <VendorsList
                refreshKey={refreshKey}
                onViewVendor={handleViewVendor}
                onAddInvoice={handleAddInvoice}
                onEditVendor={handleEditVendor}
                onDeleteVendor={handleDeleteVendor}
                formatCurrency={formatCurrency}
                getStatusBadge={getStatusBadge}
              />
            )
          } />
          <Route path="/:id" element={
            <VendorDetail
              onBack={handleBackToList}
              onEditVendor={handleEditVendor}
              onDeleteVendor={handleDeleteVendor}
              formatCurrency={formatCurrency}
              getStatusBadge={getStatusBadge}
            />
          } />
        </Routes>
      </div>

      {/* Modals */}
      {showVendorModal && (
        <VendorModal
          vendor={editingVendor}
          onClose={() => setShowVendorModal(false)}
          onSave={handleVendorSaved}
        />
      )}

      {showInvoiceModal && selectedVendor && (
        <InvoiceModal
          vendor={selectedVendor}
          onClose={() => setShowInvoiceModal(false)}
          onSave={handleInvoiceSaved}
        />
      )}

      {showPaymentModal && selectedInvoice && (
        <PaymentModal
          invoice={selectedInvoice}
          onClose={() => setShowPaymentModal(false)}
          onSave={handlePaymentSaved}
        />
      )}

    </div>
  );
};

export default React.memo(Vendors);

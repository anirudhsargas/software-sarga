import { useSEO } from '../hooks/useSEO';
import React, { useState } from 'react';
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
import { formatCurrency } from '../utils/formatters';
import './Vendors.css';
import PageContainer from '../components/ui/PageContainer';

const CAN_EDIT_ROLES = ['Admin', 'Accountant'];
const CAN_ADD_ROLES = ['Admin', 'Accountant', 'Front Office'];

const Vendors = () => {
    useSEO('Vendors');

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const userRole = auth.getRole();
  const canEdit = CAN_EDIT_ROLES.includes(userRole);
  const canDelete = userRole === 'Admin';
  const canAdd = CAN_ADD_ROLES.includes(userRole);

  const currentView = searchParams.get('view') || 'dashboard';

  const setCurrentView = (view) => {
    setSearchParams({ view });
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      paid: 'badge--success',
      partial: 'badge--info',
      overdue: 'badge--danger',
      pending: 'badge--warning'
    };

    return (
      <span className={`badge ${statusClasses[status] || 'badge--default'}`}>
        {status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
    );
  };

  const handleAddVendor = () => {
    setEditingVendor(null);
    setShowVendorModal(true);
  };

  const handleEditVendor = (vendor) => {
    setEditingVendor(vendor);
    setShowVendorModal(true);
  };

  const handleDeleteVendor = async (vendorId) => {
    if (!window.confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/vendors/${vendorId}`);
      toast.success('Vendor deleted successfully');
      setRefreshKey(k => k + 1);
      navigate('/dashboard/vendors?view=list');
    } catch (error) {
      console.error('Error deleting vendor:', error);
      const serverMessage = error.response?.data?.message || error.message;
      if (serverMessage && serverMessage.includes('unpaid invoices')) {
        if (window.confirm('This vendor has unpaid invoices or payments due. Do you want to force delete this vendor?')) {
          try {
            await api.delete(`/vendors/${vendorId}?force=true`);
            toast.success('Vendor force-deleted successfully');
            setRefreshKey(k => k + 1);
            navigate('/dashboard/vendors?view=list');
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

  const handleVendorSaved = () => {
    setShowVendorModal(false);
    setEditingVendor(null);
    setRefreshKey(k => k + 1);
  };

  const handleViewVendor = (vendor) => {
    setSelectedVendor(vendor);
    navigate(`/dashboard/vendors/${vendor.id}?view=list`);
  };

  const handleAddInvoice = (vendor) => {
    setSelectedVendor(vendor);
    setShowInvoiceModal(true);
  };

  const handleInvoiceSaved = () => {
    setShowInvoiceModal(false);
    setSelectedVendor(null);
    setRefreshKey(k => k + 1);
  };

  const handlePaymentSaved = () => {
    setShowPaymentModal(false);
    setSelectedInvoice(null);
    setRefreshKey(k => k + 1);
  };

  const handleBackToList = () => {
    setSelectedVendor(null);
    navigate('/dashboard/vendors?view=list');
  };

  return (
    <PageContainer>
      {/* Header section with glassmorphism */}
      <div className="vendor-header">
        <div className="vendor-header__title">
          <h1>
            Vendor <span style={{ color: 'var(--muted)' }}>Management</span>
          </h1>
          <p>
            {currentView === 'dashboard'
              ? 'Analytics overview of vendor performance, procurement trends, and outstanding liabilities.'
              : 'View, add, edit, and manage your vendor directory with procurement history.'}
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

          {canAdd && (
            <button
              onClick={handleAddVendor}
              className="btn btn-primary"
            >
              <Plus size={16} /> 
              <span>New Vendor</span>
            </button>
          )}
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
                canEdit={canEdit}
                canDelete={canDelete}
                canAdd={canAdd}
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
              refreshKey={refreshKey}
              canEdit={canEdit}
              canDelete={canDelete}
              canAdd={canAdd}
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

    </PageContainer>
  );
};

export default Vendors;

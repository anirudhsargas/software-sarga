import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import VendorsList from '../components/Vendors';
import VendorDetail from '../components/VendorDetail';
import VendorDashboard from '../components/VendorDashboard';
import VendorModal from '../components/VendorModal';
import InvoiceModal from '../components/InvoiceModal';
import PaymentModal from '../components/PaymentModal';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { Plus, TrendingUp, List } from 'lucide-react';
import './Vendors.css';

const Vendors = () => {
  const navigate = useNavigate();
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      paid: 'bg-green-100 text-green-800',
      partial: 'bg-blue-100 text-blue-800',
      overdue: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
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
      // Refresh the current view
      window.location.reload();
    } catch (error) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor');
    }
  };

  const handleVendorSaved = () => {
    setShowVendorModal(false);
    setEditingVendor(null);
    // Refresh the current view
    window.location.reload();
  };

  const handleViewVendor = (vendor) => {
    setSelectedVendor(vendor);
    navigate(`/dashboard/vendors/${vendor.id}`);
  };

  const handleAddInvoice = (vendor) => {
    setSelectedVendor(vendor);
    setShowInvoiceModal(true);
  };

  const handleAddPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  };

  const handleInvoiceSaved = () => {
    setShowInvoiceModal(false);
    setSelectedVendor(null);
    // Refresh the current view
    window.location.reload();
  };

  const handlePaymentSaved = () => {
    setShowPaymentModal(false);
    setSelectedInvoice(null);
    // Refresh the current view
    window.location.reload();
  };

  const handleBackToList = () => {
    setSelectedVendor(null);
    navigate('/dashboard/vendors');
  };

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
        {currentView === 'dashboard' ? (
          <VendorDashboard />
        ) : (
          <VendorsList
            onViewVendor={handleViewVendor}
            onAddInvoice={handleAddInvoice}
            onEditVendor={handleEditVendor}
            onDeleteVendor={handleDeleteVendor}
            formatCurrency={formatCurrency}
            getStatusBadge={getStatusBadge}
          />
        )}
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

export default Vendors;

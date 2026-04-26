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
import { FaPlus, FaChartLine, FaList } from 'react-icons/fa';

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
    <div className="page-container page-enter-active">
      {/* Header section with glassmorphism */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-32">
        <div>
          <h1 className="text-32 font-700 tracking-tight mb-4" style={{ fontFamily: 'var(--font-heading, "Space Grotesk")' }}>
            Vendor <span className="text-muted">Management</span>
          </h1>
          <p className="text-muted text-14 max-w-400">
            Monitor vendor performance, manage procurement invoices, and track outstanding liabilities across all branches.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-12">
          <div className="p-4 bg-surface-2 rounded-16 flex gap-4 border border-subtle">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`px-16 py-8 rounded-12 flex items-center gap-8 transition-all duration-300 ${
                currentView === 'dashboard'
                  ? 'bg-accent text-on-accent shadow-md'
                  : 'text-muted hover:text-accent hover:bg-surface-1'
              }`}
            >
              <FaChartLine size={16} />
              <span className="font-600 text-14">Analytics</span>
            </button>
            <button
              onClick={() => setCurrentView('list')}
              className={`px-16 py-8 rounded-12 flex items-center gap-8 transition-all duration-300 ${
                currentView === 'list'
                  ? 'bg-accent text-on-accent shadow-md'
                  : 'text-muted hover:text-accent hover:bg-surface-1'
              }`}
            >
              <FaList size={16} />
              <span className="font-600 text-14">Directory</span>
            </button>
          </div>

          <button
            onClick={handleAddVendor}
            className="btn btn-primary h-48 px-24 shadow-lg hover:scale-105 active:scale-95"
          >
            <FaPlus /> 
            <span>New Vendor</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="vendor-content-wrapper">
        {currentView === 'dashboard' ? (
          <div className="animate-in fade-in slide-in-from-bottom-10 duration-500">
            <VendorDashboard />
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-10 duration-500">
            <VendorsList
              onViewVendor={handleViewVendor}
              onAddInvoice={handleAddInvoice}
              onEditVendor={handleEditVendor}
              onDeleteVendor={handleDeleteVendor}
              formatCurrency={formatCurrency}
              getStatusBadge={getStatusBadge}
            />
          </div>
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

      <style jsx>{`
        .page-container {
          padding: 32px;
          max-width: 1400px;
          margin: 0 auto;
        }
        .mb-32 { margin-bottom: 32px; }
        .rounded-16 { border-radius: 16px; }
        .rounded-12 { border-radius: 12px; }
        .text-32 { font-size: 32px; }
        .text-14 { font-size: 14px; }
        .font-700 { font-weight: 700; }
        .font-600 { font-weight: 600; }
        .tracking-tight { letter-spacing: -0.02em; }
        .max-w-400 { max-width: 400px; }
        .gap-12 { gap: 12px; }
        .h-48 { height: 48px; }
        .border-subtle { border: 1px solid var(--border-subtle); }
        
        .animate-in {
          animation: animate-in 0.5s ease-out;
        }
        @keyframes animate-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Vendors;

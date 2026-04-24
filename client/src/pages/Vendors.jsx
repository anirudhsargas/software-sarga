import React, { useState, useEffect, useCallback } from 'react';
import VendorsTab from './expense-manager/VendorsTab';
import PaymentModal from './expense-manager/PaymentModal';
import { defaultPayForm } from './expense-manager/paymentDefaults';
import localDb from '../services/localDb';
import ServerError from '../components/ServerError';
import toast from 'react-hot-toast';
import './ExpenseManager.css';

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');
  
  // Payment modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState(defaultPayForm);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchBranches = useCallback(async () => {
    try { const data = await localDb.getBranches(); setBranches(data || []); } catch (err) { void err; }
  }, []);

  const fetchVendors = useCallback(async () => {
    try { const data = await localDb.getVendors(); setVendors(data || []); } catch (err) { void err; }
  }, []);

  useEffect(() => {
    fetchBranches();
    fetchVendors();
  }, [fetchBranches, fetchVendors]);

  /* ── Payment submit ── */
  const submitPayment = async (e) => {
    e.preventDefault(); setError('');
    try {
      const body = { ...payForm, amount: Number(payForm.amount) };
      if (payForm.payment_method === 'Both') {
        body.cash_amount = Number(payForm.cash_amount);
        body.upi_amount = Number(payForm.upi_amount);
      }
      await localDb.saveExpensePayment(body);
      setShowPayModal(false); setPayForm(defaultPayForm);
      setRefreshKey(k => k + 1); // trigger child refreshes
      toast.success('Payment recorded locally');
    } catch { setError('Payment failed locally'); }
  };

  /* ── Open payment modal with pre-fill ── */
  const openPayment = (prefill = {}) => {
    setPayForm({ ...defaultPayForm, ...prefill });
    setShowPayModal(true);
  };

  return (
    <div className="em-page">
      <div className="em-header">
        <div className="em-header__left">
          <h1 className="em-title">Vendor Management</h1>
          <span className="em-subtitle">Manage suppliers, track purchases, and view statements</span>
        </div>
      </div>

      {error && <ServerError onRetry={() => setError('')} message={error} />}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <VendorsTab 
          key={`vnd-${refreshKey}`} 
          vendors={vendors} 
          onPayment={openPayment} 
          onRefreshVendors={fetchVendors} 
        />
      </div>

      {/* ═══════ Shared Payment Modal ═══════ */}
      {showPayModal && (
        <PaymentModal
          form={payForm}
          setForm={setPayForm}
          vendors={vendors}
          branches={branches}
          onSubmit={submitPayment}
          onClose={() => setShowPayModal(false)}
        />
      )}
    </div>
  );
};

export default Vendors;

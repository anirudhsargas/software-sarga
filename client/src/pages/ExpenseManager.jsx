import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Store, Home, Zap, Landmark,
  Truck, HelpCircle, Users, FileText, BarChart3,
  Plus, X, RefreshCw, Briefcase
} from 'lucide-react';
import api from '../services/api';
import './ExpenseManager.css';

/* ── Tab Components ── */
import DashboardTab from './expense-manager/DashboardTab';
import VendorsTab from './expense-manager/VendorsTab';
import RentTab from './expense-manager/RentTab';
import UtilitiesTab from './expense-manager/UtilitiesTab';
import FinanceTab from './expense-manager/FinanceTab';
import TransportTab from './expense-manager/TransportTab';
import MiscTab from './expense-manager/MiscTab';
import StaffExpensesTab from './expense-manager/StaffExpensesTab';
import BillsDocsTab from './expense-manager/BillsDocsTab';
import ReportsTab from './expense-manager/ReportsTab';
import OfficeTab from './expense-manager/OfficeTab';
import PaymentModal, { defaultPayForm } from './expense-manager/PaymentModal';
import { today } from './expense-manager/constants';

/* ══════════ Tab definitions ══════════ */
const tabs = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'finance', label: 'Finance', icon: Landmark },
  { key: 'rent', label: 'Rent', icon: Home },
  { key: 'transport', label: 'Transport', icon: Truck },
  { key: 'vendors', label: 'Vendors', icon: Store },
  { key: 'office', label: 'Office', icon: Briefcase },
  { key: 'misc', label: 'Miscellaneous', icon: HelpCircle },
  { key: 'utilities', label: 'Utilities', icon: Zap },
  { key: 'staff-expenses', label: 'Staff & Salary', icon: Users },
];

/* ══════════ Main Component ══════════ */
const ExpenseManager = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [fabOpen, setFabOpen] = useState(false);
  const [showBillsPanel, setShowBillsPanel] = useState(false);

  // Shared dashboard data for Utilities tab
  const [dashboard, setDashboard] = useState(null);

  // Payment modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState(defaultPayForm);
  const [refreshKey, setRefreshKey] = useState(0);

  /* ── Shared fetchers ── */
  const fetchBranches = useCallback(async () => {
    try { const r = await api.get('/branches'); setBranches(r.data); } catch {}
  }, []);

  const fetchVendors = useCallback(async () => {
    try { const r = await api.get('/vendors'); setVendors(r.data); } catch {}
  }, []);

  const fetchDashboardForUtilities = useCallback(async () => {
    try { const r = await api.get('/expense-dashboard'); setDashboard(r.data); } catch {}
  }, []);

  useEffect(() => { fetchBranches(); fetchVendors(); }, [fetchBranches, fetchVendors]);
  useEffect(() => { if (activeTab === 'utilities') fetchDashboardForUtilities(); }, [activeTab, fetchDashboardForUtilities]);

  /* ── Payment submit ── */
  const submitPayment = async (e) => {
    e.preventDefault(); setError('');
    try {
      const body = { ...payForm, amount: Number(payForm.amount) };
      if (payForm.payment_method === 'Both') {
        body.cash_amount = Number(payForm.cash_amount);
        body.upi_amount = Number(payForm.upi_amount);
      }
      await api.post('/payments', body);
      setShowPayModal(false); setPayForm(defaultPayForm);
      setRefreshKey(k => k + 1); // trigger child refreshes
    } catch (err) { setError(err.response?.data?.message || 'Payment failed'); }
  };

  /* ── Open payment modal with pre-fill ── */
  const openPayment = (prefill = {}) => {
    setPayForm({ ...defaultPayForm, ...prefill });
    setShowPayModal(true);
  };

  /* ── Refresh current tab ── */
  const handleRefresh = () => {
    setError('');
    setRefreshKey(k => k + 1);
  };

  /* ══════════ RENDER ══════════ */
  return (
    <div className="em-page">
      {/* Header */}
      <div className="em-header">
        <div className="em-header__left">
          <h1 className="em-title">Expense Manager</h1>
          <span className="em-subtitle">Track, manage & analyze all expenses</span>
        </div>
        <div className="em-header__actions">
          <button className="btn btn-ghost btn-sm" onClick={handleRefresh}><RefreshCw size={15} /> Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBillsPanel(true)}><FileText size={15} /> Bills & Docs</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('reports')}><BarChart3 size={15} /> Reports</button>
          <button className="btn btn-primary btn-sm" onClick={() => openPayment()}><Plus size={15} /> New Payment</button>
        </div>
      </div>

      {/* Error */}
      {error && <div className="em-error">{error} <button className="btn btn-ghost btn-sm" onClick={() => setError('')}><X size={14} /></button></div>}

      {/* Tabs */}
      <div className="em-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`em-tab ${activeTab === t.key ? 'em-tab--active' : ''}`} onClick={() => setActiveTab(t.key)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══════ Tab Content ═══════ */}
      {activeTab === 'dashboard' && <DashboardTab key={`dash-${refreshKey}`} branches={branches} onPayment={openPayment} />}
      {activeTab === 'vendors' && <VendorsTab key={`vnd-${refreshKey}`} vendors={vendors} onPayment={openPayment} onRefreshVendors={fetchVendors} />}
      {activeTab === 'rent' && <RentTab key={`rent-${refreshKey}`} branches={branches} onPayment={openPayment} onError={setError} />}
      {activeTab === 'utilities' && <UtilitiesTab key={`util-${refreshKey}`} dashboard={dashboard} onPayment={openPayment} onRefresh={fetchDashboardForUtilities} />}
      {activeTab === 'finance' && <FinanceTab key={`fin-${refreshKey}`} branches={branches} onError={setError} />}
      {activeTab === 'transport' && <TransportTab key={`trn-${refreshKey}`} onError={setError} />}
      {activeTab === 'misc' && <MiscTab key={`misc-${refreshKey}`} onError={setError} />}
      {activeTab === 'office' && <OfficeTab key={`ofc-${refreshKey}`} onError={setError} />}
      {activeTab === 'staff-expenses' && <StaffExpensesTab key={`staff-${refreshKey}`} onPayment={openPayment} onError={setError} />}
      {activeTab === 'reports' && <ReportsTab key={`rpt-${refreshKey}`} branches={branches} onError={setError} />}

      {/* ═══════ Bills & Docs Side Panel ═══════ */}
      {showBillsPanel && (
        <div className="em-sidepanel-backdrop" onClick={() => setShowBillsPanel(false)}>
          <div className="em-sidepanel" onClick={(e) => e.stopPropagation()}>
            <div className="em-sidepanel__header">
              <div className="em-sidepanel__title"><FileText size={16} /> Bills & Docs</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowBillsPanel(false)}><X size={18} /></button>
            </div>
            <div className="em-sidepanel__content">
              <BillsDocsTab key={`bills-${refreshKey}`} onError={setError} />
            </div>
          </div>
        </div>
      )}

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

      {/* ═══════ Floating Action Button ═══════ */}
      <button className="em-fab" onClick={() => setFabOpen(f => !f)} title="Quick Actions">
        {fabOpen ? <X size={24} /> : <Plus size={24} />}
      </button>
      {fabOpen && (
        <div className="em-fab__menu">
          <button className="em-fab__item" onClick={() => { openPayment(); setFabOpen(false); }}><Plus size={16} /> New Payment</button>
          <button className="em-fab__item" onClick={() => { setActiveTab('vendors'); setFabOpen(false); }}><Store size={16} /> Vendors</button>
          <button className="em-fab__item" onClick={() => { setActiveTab('reports'); setFabOpen(false); }}><BarChart3 size={16} /> Reports</button>
        </div>
      )}
    </div>
  );
};

export default ExpenseManager;

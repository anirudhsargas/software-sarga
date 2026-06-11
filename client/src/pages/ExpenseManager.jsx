import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import usePolling from '../hooks/usePolling';
import {
  LayoutDashboard, Store, Home, Zap, Landmark,
  Truck, HelpCircle, Users, FileText, BarChart3,
  Plus, X, Briefcase
} from 'lucide-react';
import localDb from '../services/localDb';
import './ExpenseManager.css';
import ServerError from '../components/ServerError';
import toast from 'react-hot-toast';

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
import PaymentModal from './expense-manager/PaymentModal';
import { defaultPayForm } from './expense-manager/paymentDefaults';

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

const VALID_TABS = new Set(tabs.map(t => t.key).concat('reports'));

const ExpenseManager = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [fabOpen, setFabOpen] = useState(false);
  const [showBillsPanel, setShowBillsPanel] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState(defaultPayForm);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeTab = useMemo(() => {
    const tabFromUrl = searchParams.get('tab');
    return (tabFromUrl && VALID_TABS.has(tabFromUrl)) ? tabFromUrl : 'dashboard';
  }, [searchParams]);

  const setActiveTab = useCallback((tab) => {
    setSearchParams({ tab }, { replace: tab === 'dashboard' });
  }, [setSearchParams]);

  const branchesRef = useRef(branches);
  const vendorsRef = useRef(vendors);
  const dashboardRef = useRef(dashboard);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await localDb.getBranches();
      if (JSON.stringify(data) !== JSON.stringify(branchesRef.current)) {
        branchesRef.current = data;
        setBranches(data || []);
      }
    } catch (err) { void err; }
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      const data = await localDb.getVendors();
      if (JSON.stringify(data) !== JSON.stringify(vendorsRef.current)) {
        vendorsRef.current = data;
        setVendors(data || []);
      }
    } catch (err) { void err; }
  }, []);

  const fetchDashboardForUtilities = useCallback(async () => {
    try {
      const data = await localDb.getExpenseDashboard();
      if (JSON.stringify(data) !== JSON.stringify(dashboardRef.current)) {
        dashboardRef.current = data;
        setDashboard(data);
      }
    } catch (err) { void err; }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchBranches();
      void fetchVendors();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchBranches, fetchVendors]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeTab === 'utilities') void fetchDashboardForUtilities();
    }, 0);
    return () => clearTimeout(t);
  }, [activeTab, fetchDashboardForUtilities]);

  usePolling(() => setRefreshKey(k => k + 1), 60000);

  const submitPayment = useCallback(async (e) => {
    e.preventDefault(); setError('');
    try {
      const body = { ...payForm, amount: Number(payForm.amount) };
      if (payForm.payment_method === 'Both') {
        body.cash_amount = Number(payForm.cash_amount);
        body.upi_amount = Number(payForm.upi_amount);
      }
      await localDb.saveExpensePayment(body);
      setShowPayModal(false); setPayForm(defaultPayForm);
      setRefreshKey(k => k + 1);
      toast.success('Payment recorded locally');
    } catch { setError('Payment failed locally'); }
  }, [payForm]);

  const openPayment = useCallback((prefill = {}) => {
    setPayForm({ ...defaultPayForm, ...prefill });
    setShowPayModal(true);
  }, []);

  return (
    <div className="em-page">
      <div className="em-header">
        <div className="em-header__left">
          <h1 className="em-title">Expense Manager</h1>
          <span className="em-subtitle">Track, manage & analyze all expenses</span>
        </div>
        <div className="em-header__actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBillsPanel(true)}><FileText size={15} /> Bills & Docs</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('reports')}><BarChart3 size={15} /> Reports</button>
          <button className="btn btn-primary btn-sm" onClick={() => openPayment()}><Plus size={15} /> New Payment</button>
        </div>
      </div>

      {error && <ServerError onRetry={() => setError('')} message={error} />}

      <div className="em-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`em-tab ${activeTab === t.key ? 'em-tab--active' : ''}`} onClick={() => setActiveTab(t.key)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

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

      {showBillsPanel && (
        <div className="em-sidepanel-backdrop" onClick={() => setShowBillsPanel(false)}>
          <div className="em-sidepanel" onClick={(e) => e.stopPropagation()}>
            <div className="em-sidepanel__header">
              <div className="em-sidepanel__title"><FileText size={16} /> Bills & Docs</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowBillsPanel(false)}><X size={18} /></button>
            </div>
            <div className="em-sidepanel__content">
              <BillsDocsTab onError={setError} />
            </div>
          </div>
        </div>
      )}

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

export default React.memo(ExpenseManager);

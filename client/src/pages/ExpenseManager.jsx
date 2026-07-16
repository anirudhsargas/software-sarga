import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import usePolling from '../hooks/usePolling';
import {
  LayoutDashboard, Store, Home, Zap, Landmark,
  Truck, HelpCircle, Users, FileText, BarChart3,
  Plus, X, Briefcase, PlusCircle, Bell, Lightbulb, Check, Trash2
} from 'lucide-react';
import localDb from '../services/localDb';
import api from '../services/api';
import useAuth from '../hooks/useAuth';
import {} from './expense-manager/constants';
import './ExpenseManager.css';
import ServerError from '../components/ServerError';
import toast from 'react-hot-toast';
import BranchSelect from '../components/ui/BranchSelect';

/* ── Tab Components ── */
import DashboardTab from './expense-manager/DashboardTab';
import VendorsTab from './expense-manager/VendorsTab';
import RentTab from './expense-manager/RentTab';
import UtilitiesTab from './expense-manager/UtilitiesTab';
import FinanceTab from './expense-manager/FinanceTab';
import TransportTab from './expense-manager/TransportTab';
import MiscTab from './expense-manager/MiscTab';
import StaffExpensesTab from './expense-manager/StaffExpensesTab';
import BillExtractionReview from './expense-manager/BillExtractionReview';
import ReportsTab from './expense-manager/ReportsTab';
import OfficeTab from './expense-manager/OfficeTab';
import PaymentModal from './expense-manager/PaymentModal';
import { defaultPayForm } from './expense-manager/paymentDefaults';
import PageContainer from '../components/ui/PageContainer';

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
  { key: 'staff-expenses', label: 'Staff & Salary', icon: Users }
];

/* ══════════ Main Component ══════════ */
const VALID_TABS = new Set(tabs.map(t => t.key).concat('reports'));

const ExpenseManager = () => {
  useSEO('Expense Manager');
  const { user } = useAuth();

  const triggerBillsRef = useRef(null);
  const triggerReqRef = useRef(null);
  const triggerReqListRef = useRef(null);

  const [showBillsPanel, setShowBillsPanel] = useState(false);
  useEffect(() => {
    if (showBillsPanel) {
      triggerBillsRef.current = document.activeElement;
    } else if (triggerBillsRef.current) {
      triggerBillsRef.current.focus();
      triggerBillsRef.current = null;
    }
  }, [showBillsPanel]);

  const [showRequestModal, setShowRequestModal] = useState(false);
  useEffect(() => {
    if (showRequestModal) {
      triggerReqRef.current = document.activeElement;
    } else if (triggerReqRef.current) {
      triggerReqRef.current.focus();
      triggerReqRef.current = null;
    }
  }, [showRequestModal]);

  const [showRequestsListModal, setShowRequestsListModal] = useState(false);
  useEffect(() => {
    if (showRequestsListModal) {
      triggerReqListRef.current = document.activeElement;
    } else if (triggerReqListRef.current) {
      triggerReqListRef.current.focus();
      triggerReqListRef.current = null;
    }
  }, [showRequestsListModal]);

  useEffect(() => {
    return () => {
      triggerBillsRef.current?.focus();
      triggerReqRef.current?.focus();
      triggerReqListRef.current?.focus();
    };
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const activeTab = (tabFromUrl && VALID_TABS.has(tabFromUrl)) ? tabFromUrl : 'dashboard';
  const setActiveTab = (tab) => {
    setSearchParams({ tab }, { replace: tab === 'dashboard' });
  };
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [fabOpen, setFabOpen] = useState(false);

  // Shared dashboard data for Utilities tab
  const [dashboard, setDashboard] = useState(null);

  // Payment modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState(defaultPayForm);
  const [refreshKey, setRefreshKey] = useState(0);

  // Vendor/Utility Requests State
  const [requests, setRequests] = useState([]);
  const [requestCount, setRequestCount] = useState(0);
  const [requestForm, setRequestForm] = useState({
    request_type: 'Vendor',
    name: '',
    contact_person: '',
    phone: '',
    address: '',
    gstin: '',
    branch_id: '',
    request_reason: ''
  });

  // Other Payments State removed

  /* ── Shared fetchers ── */
  const fetchBranches = useCallback(async () => {
    try { const data = await localDb.getBranches(); setBranches(data || []); } catch { /* ignore */ }
  }, []);

  const fetchVendors = useCallback(async () => {
    try { const data = await localDb.getVendors(); setVendors(data || []); } catch (e) { console.warn('[ExpenseManager] fetchVendors failed:', e); }
  }, []);

  const fetchDashboardForUtilities = useCallback(async () => {
    try { const data = await localDb.getExpenseDashboard(); setDashboard(data); } catch { /* ignore */ }
  }, []);

  const fetchVendorRequests = useCallback(async () => {
    if (!user?.role) return;
    try {
      const res = await api.get('/vendor-requests', {
        params: user.role === 'Front Office' ? {} : { status: 'Pending' }
      });
      // Normalize API response - handle array, paginated, and nested formats
      let requests = [];
      if (Array.isArray(res?.data)) {
        requests = res.data;
      } else if (Array.isArray(res?.data?.data)) {
        requests = res.data.data;
      } else if (Array.isArray(res?.data?.vendors)) {
        requests = res.data.vendors;
      } else {
        console.warn('Vendor requests API returned unexpected payload:', res.data);
      }
      setRequests(requests);
      setRequestCount(requests.filter(r => r.status === 'Pending').length);
    } catch (err) {
      console.error('Failed to load vendor requests:', err);
    }
  }, [user]);

  // Fetchers removed

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchBranches();
      void fetchVendors();
      void fetchVendorRequests();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchBranches, fetchVendors, fetchVendorRequests]);

  useEffect(() => {
    void fetchVendorRequests();
  }, [refreshKey, fetchVendorRequests]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeTab === 'utilities') void fetchDashboardForUtilities();
    }, 0);
    return () => clearTimeout(t);
  }, [activeTab, fetchDashboardForUtilities]);

  /* ── Auto-refresh every 60s (pauses when tab hidden) ── */
  usePolling(() => setRefreshKey(k => k + 1), 60000);

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

  const submitVendorRequest = async (e) => {
    e.preventDefault();
    try {
      await api.post('/vendor-requests', requestForm);
      toast.success(`${requestForm.request_type} request submitted successfully`);
      setShowRequestModal(false);
      setRequestForm({
        request_type: 'Vendor',
        name: '',
        contact_person: '',
        phone: '',
        address: '',
        gstin: '',
        branch_id: '',
        request_reason: ''
      });
      await fetchVendorRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit request');
    }
  };

  const reviewRequest = async (requestId, status, reason = '') => {
    try {
      await api.put(`/vendor-requests/${requestId}/review`, {
        status,
        rejection_reason: reason
      });
      toast.success(`Request ${status.toLowerCase()} successfully`);
      await fetchVendorRequests();
      await fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to review request');
    }
  };

  // Handlers removed

  /* ══════════ RENDER ══════════ */
  return (
    <PageContainer className="em-page">
      {/* Header */}
      <div className="em-header">
        <div className="em-header__left">
          <h1 className="em-title">Expense Manager</h1>
          <span className="em-subtitle">Track, manage & analyze all expenses</span>
        </div>
        <div className="em-header__actions">
          {user?.role === 'Front Office' && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRequestModal(true)}>
              <PlusCircle size={15} /> Request Vendor/Utility
            </button>
          )}
          {['Admin', 'Accountant'].includes(user?.role) && requestCount > 0 && (
            <button className="btn btn-ghost btn-sm text-amber" onClick={() => setShowRequestsListModal(true)}>
              <Bell size={15} /> {requestCount} Pending Request{requestCount !== 1 ? 's' : ''}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBillsPanel(true)}><FileText size={15} /> Bills & Docs</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('reports')}><BarChart3 size={15} /> Reports</button>
          <button className="btn btn-primary btn-sm" onClick={() => openPayment()}><Plus size={15} /> New Payment</button>
        </div>
      </div>

      {/* Error */}
      {error && <ServerError onRetry={() => setError('')} message={error} />}

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
        <div className="em-sidepanel-backdrop" onClick={() => setShowBillsPanel(false)} role="dialog" aria-modal="true" aria-labelledby="bills-panel-title">
          <div className="em-sidepanel" onClick={(e) => e.stopPropagation()}>
            <div className="em-sidepanel__header">
              <div id="bills-panel-title" className="em-sidepanel__title"><FileText size={16} aria-hidden="true" /> Upload Bills</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowBillsPanel(false)} aria-label="Close bills panel"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="em-sidepanel__content">
              <BillExtractionReview
                onClose={() => setShowBillsPanel(false)}
                onSuccess={() => {
                  setShowBillsPanel(false);
                  setRefreshKey(k => k + 1);
                }}
                onError={setError}
              />
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

      {/* Vendor/Utility Request Modal (Front Office) */}
      {showRequestModal && (
        <div className="modal-backdrop" onClick={() => setShowRequestModal(false)} role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
              <h2 id="request-modal-title">Request New {requestForm.request_type}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRequestModal(false)} aria-label="Close request modal">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={submitVendorRequest}>
              <div className="em-modal__body">
                <div className="em-form-grid">
                  <div className="em-form-group em-form-group--full">
                    <label htmlFor="request-type">Type *</label>
                    <select
                      id="request-type"
                      className="em-input"
                      aria-label="Request Type"
                      value={requestForm.request_type}
                      onChange={e => setRequestForm({ ...requestForm, request_type: e.target.value })}>
                      <option value="Vendor">Vendor</option>
                      <option value="Utility">Utility</option>
                    </select>
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label htmlFor="request-name">Name *</label>
                    <input
                      id="request-name"
                      className="em-input"
                      aria-label="Vendor or Utility Name"
                      value={requestForm.name} required
                      onChange={e => setRequestForm({ ...requestForm, name: e.target.value })}
                      placeholder="Enter vendor/utility name" />
                  </div>
                  <div className="em-form-group">
                    <label htmlFor="request-contact">Contact Person</label>
                    <input
                      id="request-contact"
                      className="em-input"
                      aria-label="Contact Person"
                      value={requestForm.contact_person}
                      onChange={e => setRequestForm({ ...requestForm, contact_person: e.target.value })}
                      placeholder="Contact name" />
                  </div>
                  <div className="em-form-group">
                    <label htmlFor="request-phone">Phone</label>
                    <input
                      id="request-phone"
                      className="em-input"
                      aria-label="Phone Number"
                      value={requestForm.phone}
                      onChange={e => setRequestForm({ ...requestForm, phone: e.target.value })}
                      placeholder="Contact phone" />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Address</label>
                    <textarea className="em-input" rows={2} value={requestForm.address}
                      onChange={e => setRequestForm({ ...requestForm, address: e.target.value })}
                      placeholder="Full address (optional)" />
                  </div>
                  <div className="em-form-group">
                    <label>GSTIN</label>
                    <input className="em-input" value={requestForm.gstin}
                      onChange={e => setRequestForm({ ...requestForm, gstin: e.target.value })}
                      placeholder="GST number (optional)" />
                  </div>
                  <div className="em-form-group">
                    <label htmlFor="request-branch">Branch</label>
                    <BranchSelect
                      id="request-branch"
                      className="em-input"
                      aria-label="Select Branch"
                      value={requestForm.branch_id || ''}
                      onChange={e => setRequestForm({ ...requestForm, branch_id: e.target.value || null })}>
                      <option value="">All Branches</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </BranchSelect>
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Reason for Request</label>
                    <textarea className="em-input" rows={2} value={requestForm.request_reason}
                      onChange={e => setRequestForm({ ...requestForm, request_reason: e.target.value })}
                      placeholder="Why do you need this vendor/utility added?" />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowRequestModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vendor Requests List Modal (Admin/Accountant) */}
      {showRequestsListModal && (
        <div className="modal-backdrop" onClick={() => setShowRequestsListModal(false)} role="dialog" aria-modal="true" aria-labelledby="requests-list-title">
          <div className="em-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="em-modal__header">
              <h2 id="requests-list-title">Vendor/Utility Requests</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRequestsListModal(false)} aria-label="Close requests list">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="em-modal__body">
              <div className="em-table-wrap">
                <table className="em-table" aria-label="Pending vendor and utility requests">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>Requested By</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(req => (
                      <tr key={req.id}>
                        <td>
                          <span className={`em-type-badge em-type-badge--${req.request_type.toLowerCase()}`}>
                            {req.request_type}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{req.name}</td>
                        <td>{req.phone || '—'}</td>
                        <td>{req.requested_by_name}</td>
                        <td>{new Date(req.created_at).toLocaleDateString()}</td>
                        <td>
                          <span className={`em-type-badge em-type-badge--${
                            req.status === 'Pending' ? 'other' :
                            req.status === 'Approved' ? 'payment' : 'purchase'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td>
                          {req.status === 'Pending' && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn btn-primary btn-sm"
                                onClick={() => reviewRequest(req.id, 'Approved')}>
                                <Check size={14} /> Approve
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  const reason = window.prompt('Rejection reason (optional):');
                                  if (reason !== null) reviewRequest(req.id, 'Rejected', reason);
                                }}>
                                <X size={14} /> Reject
                              </button>
                            </div>
                          )}
                          {req.status !== 'Pending' && (
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                              Reviewed by {req.reviewed_by_name}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}


    </PageContainer>
  );
};

export default ExpenseManager;

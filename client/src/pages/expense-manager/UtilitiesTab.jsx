import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Zap, Wifi, Phone, Droplets, ArrowLeft,
  Calendar, TrendingUp, TrendingDown, AlertTriangle, Loader2,
  Plus, Trash2, X, PlusCircle, ShoppingCart, IndianRupee, FileText, ChevronDown, ChevronRight, ExternalLink, Edit3, Check,
  Building2, Building, CheckCircle2, ShieldCheck, CreditCard, AlertCircle, MapPin, Hash, Search
} from 'lucide-react';
import api from '../../services/api';
import auth from '../../services/auth';
import { fmt, fmtDate } from './constants';
import Loading from '../../components/ui/Loading';
import { serverToday } from '../../services/serverTime';
import { useConfirm } from '../../contexts/ConfirmContext';
import PageContainer from '../../components/ui/PageContainer';
import toast from 'react-hot-toast';
import { validatePrice, validateDate } from '../../utils/validators';

const DEFAULT_UTILITY_TYPES = [
  { key: 'Electricity', icon: Zap, color: 'var(--warning)' },
  { key: 'Internet / Broadband', icon: Wifi, color: 'var(--accent-2)' },
  { key: 'Phone', icon: Phone, color: 'var(--success)' },
  { key: 'Water', icon: Droplets, color: 'var(--accent)' },
];

const UtilitiesTab = ({ refreshKey, dashboard, onPayment, onRefresh }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { confirm } = useConfirm();

  const [selectedUtility, setSelectedUtility] = useState(null);
  const [statement, setStatement] = useState(null);
  const [loadingStmt, setLoadingStmt] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [showRequestType, setShowRequestType] = useState(false);
  const [requestTypeName, setRequestTypeName] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState('');

  // Connections data from summary endpoint
  const [categoriesData, setCategoriesData] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);

  // Bill recording state
  const [showBillForm, setShowBillForm] = useState(false);
  const [billForm, setBillForm] = useState({ utility_type: '', amount: '', bill_number: '', bill_date: serverToday(), description: '', connection_record_id: '', connection_id: '' });
  const [billSaving, setBillSaving] = useState(false);
  const [billError, setBillError] = useState('');
  const [billSuccess, setBillSuccess] = useState('');
  const [multipleConsumers, setMultipleConsumers] = useState(false);
  const [billEntries, setBillEntries] = useState([]);

  // Connections management
  const [connections, setConnections] = useState([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [connectionsCategory, setConnectionsCategory] = useState('');
  const [newConnection, setNewConnection] = useState({ connection_id: '', label: '', provider: '', billing_cycle: 'monthly', utility_type: '', branch_id: '' });
  const [editingConnection, setEditingConnection] = useState(null);
  const [connectionSaving, setConnectionSaving] = useState(false);

  // Add connection modal
  const [showAddConnectionModal, setShowAddConnectionModal] = useState(false);
  const [addConnectionCategory, setAddConnectionCategory] = useState('');
  const [branches, setBranches] = useState([]);
  const [formErrors, setFormErrors] = useState({});

  const [fetchingEmail, setFetchingEmail] = useState(false);
  const [fetchReport, setFetchReport] = useState(null);
  const [showFetchReport, setShowFetchReport] = useState(false);

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  // Load custom utility types from localStorage
  const [customTypes, setCustomTypes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('custom_utility_types') || '[]'); } catch { return []; }
  });

  const UTILITY_TYPES = React.useMemo(() => [
    ...DEFAULT_UTILITY_TYPES,
    ...customTypes.map(name => ({ key: name, icon: Zap, color: 'var(--accent)' }))
  ], [customTypes]);

  // Load structured category data
  const fetchCategoriesData = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const r = await api.get('/reports/utility-summary-by-connection');
      setCategoriesData(r.data.categories || []);
    } catch (err) {
      console.warn('Failed to fetch utility summary by connection', err);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    fetchCategoriesData();
    if (isAdmin) {
      api.get('/branches').then(r => setBranches(r.data || [])).catch(() => {});
    }
  }, [fetchCategoriesData, isAdmin]);

  // Refresh data when refreshKey changes (without unmounting)
  React.useEffect(() => {
    if (refreshKey > 0) fetchCategoriesData();
  }, [refreshKey, fetchCategoriesData]);

  // Handle pre-selected addBill from URL param (coming from ConnectionLedger)
  React.useEffect(() => {
    const addBillId = searchParams.get('addBill');
    if (addBillId) {
      const cat = categoriesData.find(c => c.connections.some(conn => String(conn.id) === addBillId));
      if (cat) {
        const conn = cat.connections.find(c => String(c.id) === addBillId);
        setBillForm({
          utility_type: cat.category,
          amount: '',
          bill_number: '',
          bill_date: serverToday(),
          description: '',
          connection_record_id: addBillId,
          connection_id: conn?.connection_id || ''
        });
        setShowBillForm(true);
      }
    }
  }, [searchParams, categoriesData]);

  const handleAddType = () => {
    const name = newTypeName.trim();
    if (!name) return;
    if (UTILITY_TYPES.some(t => t.key.toLowerCase() === name.toLowerCase())) return;
    const updated = [...customTypes, name];
    setCustomTypes(updated);
    localStorage.setItem('custom_utility_types', JSON.stringify(updated));
    setNewTypeName('');
    setShowAddType(false);
  };

  const openRequestType = () => {
    setRequestTypeName('');
    setRequestReason('');
    setRequestError('');
    setShowRequestType(true);
  };

  const submitRequestType = async () => {
    if (!requestTypeName.trim()) return;
    setRequestSaving(true);
    try {
      await api.post('/vendor-requests', {
        request_type: 'Utility',
        name: requestTypeName.trim(),
        request_reason: requestReason || null,
        branch_id: null
      });
      setShowRequestType(false);
    } catch (err) {
      setRequestError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit request');
    } finally { setRequestSaving(false); }
  };

  const handleRemoveType = async (name) => {
    const isConfirmed = await confirm({
      title: 'Remove Utility Type',
      message: `Are you sure you want to remove "${name}" from utility types?`,
      confirmText: 'Remove',
      type: 'danger'
    });
    if (!isConfirmed) return;
    const updated = customTypes.filter(t => t !== name);
    setCustomTypes(updated);
    localStorage.setItem('custom_utility_types', JSON.stringify(updated));
  };

  const handleDeletePayment = async (paymentId) => {
    const isConfirmed = await confirm({
      title: 'Delete Payment',
      message: 'Are you sure you want to delete this payment record? This cannot be undone.',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/payments/${paymentId}`);
      if (selectedUtility) openUtilityDetail(selectedUtility);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete payment');
    }
  };

  const handleDeleteBill = async (billId) => {
    const isConfirmed = await confirm({
      title: 'Delete Bill',
      message: 'Are you sure you want to delete this bill record? This cannot be undone.',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/utility-bills/${billId}`);
      if (selectedUtility) openUtilityDetail(selectedUtility);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete bill');
    }
  };

  /* ── Open Bill Form ── */
  const openBillForm = (utilType, connRecordId, connLabel) => {
    setBillForm({
      utility_type: utilType,
      amount: '',
      bill_number: '',
      bill_date: serverToday(),
      description: '',
      connection_record_id: connRecordId || '',
      connection_id: connLabel || '',
      payment_method: 'Cash',
      payment_ref: '',
      is_paid: true
    });
    setBillError('');
    setBillSuccess('');
    setShowBillForm(true);
    setMultipleConsumers(false);
    setBillEntries([{ connection_id: '', amount: '', bill_number: '' }]);
    if (utilType) fetchConnections(utilType);
  };

  const activeConnectionMatch = useMemo(() => {
    if (!billForm.connection_record_id && !billForm.connection_id) return null;
    return connections.find(c => 
      String(c.id) === String(billForm.connection_record_id) ||
      (billForm.connection_id && String(c.connection_id).toLowerCase().trim() === String(billForm.connection_id).toLowerCase().trim())
    ) || null;
  }, [connections, billForm.connection_record_id, billForm.connection_id]);

  const fetchConnections = async (utilityType) => {
    setConnectionsLoading(true);
    try {
      const r = await api.get('/utility-connections', { params: { utility_type: utilityType } });
      setConnections(r.data.rows || []);
    } catch (err) {
      console.warn('Failed to fetch utility connections', err);
    } finally {
      setConnectionsLoading(false);
    }
  };

  /* ── Connection CRUD ── */
  const validateConnectionForm = () => {
    const errs = {};
    if (!newConnection.connection_id?.trim()) errs.connection_id = 'Account / Consumer number is required';
    if (!addConnectionCategory && !newConnection.utility_type?.trim()) errs.utility_type = 'Category is required';
    if (!isAdmin && !newConnection.branch_id && !user?.branch_id) errs.branch_id = 'Branch is required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const addConnection = async (utilityType) => {
    if (!validateConnectionForm()) return;
    setConnectionSaving(true);
    try {
      const payload = {
        utility_type: utilityType || newConnection.utility_type,
        connection_id: newConnection.connection_id.trim(),
        label: newConnection.label?.trim() || null,
        provider: newConnection.provider?.trim() || null,
        billing_cycle: newConnection.billing_cycle || 'monthly',
        branch_id: newConnection.branch_id || undefined,
        is_active: newConnection.is_active !== undefined ? newConnection.is_active : 1,
      };
      const res = await api.post('/utility-connections', payload);
      setNewConnection({ connection_id: '', label: '', provider: '', billing_cycle: 'monthly', utility_type: '', branch_id: '' });
      setFormErrors({});
      if (showConnectionsModal) await fetchConnections(utilityType);
      await fetchCategoriesData();
      toast.success(res.data?.message || 'Connection added');
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add connection';
      toast.error(msg);
      throw err;
    } finally { setConnectionSaving(false); }
  };

  const updateConnection = async () => {
    if (!editingConnection) return;
    setConnectionSaving(true);
    try {
      await api.put(`/utility-connections/${editingConnection.id}`, {
        label: editingConnection.label,
        provider: editingConnection.provider,
        billing_cycle: editingConnection.billing_cycle,
        is_active: editingConnection.is_active
      });
      setEditingConnection(null);
      if (showConnectionsModal) await fetchConnections(connectionsCategory);
      await fetchCategoriesData();
      toast.success('Connection updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update connection');
    } finally { setConnectionSaving(false); }
  };

  const deleteConnection = async (id, utilityType) => {
    const isConfirmed = await confirm({
      title: 'Delete Connection',
      message: 'Are you sure? This will unlink all bills from this connection.',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/utility-connections/${id}`);
      if (showConnectionsModal) await fetchConnections(utilityType);
      await fetchCategoriesData();
      toast.success('Connection deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete connection');
    }
  };

  const toggleConnectionStatus = async (conn) => {
    try {
      await api.put(`/utility-connections/${conn.id}`, { is_active: conn.is_active ? 0 : 1 });
      await fetchCategoriesData();
      toast.success(`Connection ${conn.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update connection');
    }
  };

  /* ── Submit Bill ── */
  const handleBillSubmit = async (e, isPaidParam) => {
    if (e && e.preventDefault) e.preventDefault();
    const isPaid = isPaidParam !== undefined ? isPaidParam : billForm.is_paid;

    if (multipleConsumers && billForm.utility_type === 'Electricity') {
      if (!billEntries || billEntries.length === 0) { setBillError('Please add at least one consumer entry'); return; }
      for (const entry of billEntries) {
        if (!entry.connection_id || !entry.amount || Number(entry.amount) <= 0) { setBillError('Each entry must have connection ID and a positive amount'); return; }
      }
      setBillSaving(true); setBillError(''); setBillSuccess('');
      try {
        const promises = billEntries.map(entry => {
          const payload = {
            utility_type: billForm.utility_type,
            amount: entry.amount,
            bill_number: entry.bill_number || billForm.bill_number || undefined,
            bill_date: billForm.bill_date,
            description: billForm.description,
            connection_id: entry.connection_id,
            connection_record_id: billForm.connection_record_id || undefined,
            is_paid: isPaid,
            payment_method: billForm.payment_method || 'Cash',
            payment_ref: billForm.payment_ref || null
          };
          return api.post('/utility-bills', payload);
        });
        const results = await Promise.allSettled(promises);
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failCount = results.filter(r => r.status === 'rejected').length;
        if (successCount > 0) {
          setBillSuccess(`${successCount} bills recorded (${isPaid ? 'Paid' : 'Pending'})`);
          setTimeout(() => {
            setShowBillForm(false);
            if (selectedUtility) openUtilityDetail(selectedUtility);
            if (onRefresh) onRefresh();
            fetchCategoriesData();
          }, 800);
        } else {
          setBillError('Failed to record any bills');
        }
      } catch (err) {
        setBillError(err.response?.data?.message || 'Failed to record bills');
      } finally { setBillSaving(false); }
      return;
    }

    const amountResult = validatePrice(billForm.amount, { label: 'Amount', min: 0.01 });
    if (!amountResult.valid) { setBillError(amountResult.error); return; }
    const dateResult = validateDate(billForm.bill_date, { label: 'Bill date' });
    if (!dateResult.valid) { setBillError(dateResult.error); return; }
    setBillSaving(true); setBillError(''); setBillSuccess('');
    try {
      const payload = { ...billForm, is_paid: isPaid };
      await api.post('/utility-bills', payload);
      setBillSuccess(isPaid ? 'Bill recorded and payment logged successfully!' : 'Bill recorded as pending!');
      setTimeout(() => {
        setShowBillForm(false);
        if (selectedUtility) openUtilityDetail(selectedUtility);
        if (onRefresh) onRefresh();
        fetchCategoriesData();
      }, 800);
    } catch (err) {
      setBillError(err.response?.data?.message || 'Failed to record bill');
    } finally { setBillSaving(false); }
  };

  const addBillEntry = () => setBillEntries(p => [...p, { connection_id: '', amount: '', bill_number: '' }]);
  const updateBillEntry = (idx, field, value) => setBillEntries(p => p.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  const removeBillEntry = (idx) => setBillEntries(p => p.filter((_, i) => i !== idx));

  const fetchBillsFromEmail = async () => {
    setFetchingEmail(true);
    try {
      const r = await api.post('/utility-bills/fetch-from-email');
      setFetchReport(r.data);
      setShowFetchReport(true);
      toast.success(r.data?.message || 'Fetched bills from email');
      if (onRefresh) onRefresh();
      fetchCategoriesData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch bills from email');
    } finally { setFetchingEmail(false); }
  };

  /* ── Open Utility Detail Dashboard ── */
  const openUtilityDetail = useCallback(async (utilType) => {
    setSelectedUtility(utilType);
    setLoadingStmt(true);
    try {
      const r = await api.get('/reports/utility-statement', { params: { utility_type: utilType } });
      const payments = (r.data?.payments || r.data?.rows || []).map(p => ({ ...p, _entry_type: 'Payment', _date: p.payment_date }));
      const bills = (r.data?.bills || []).map(b => ({ ...b, _entry_type: 'Bill', _date: b.bill_date }));
      const combined = [...payments, ...bills].sort((a, b) => new Date(b._date) - new Date(a._date));
      setStatement({ rows: combined, payments, bills });
    } catch { setStatement({ rows: [], payments: [], bills: [] }); }
    finally { setLoadingStmt(false); }
  }, []);

  const getSummaryForType = (name) => {
    return dashboard?.utility_summary?.find(u => (u.name || u.payee_name)?.toLowerCase() === name.toLowerCase());
  };

  /* ── Open Manage Connections Modal ── */
  const openManageConnections = (utilType) => {
    setConnectionsCategory(utilType);
    fetchConnections(utilType);
    setShowConnectionsModal(true);
  };

  /* ══════════ Utility Detail Sub-Dashboard ══════════ */
  const renderUtilityDashboard = () => {
    const rows = statement?.rows || [];
    const payments = statement?.payments || [];
    const bills = statement?.bills || [];
    const totalBilled = bills.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalPaid = payments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const balance = totalBilled - totalPaid;
    const typeInfo = UTILITY_TYPES.find(t => t.key === selectedUtility) || UTILITY_TYPES[0];
    const Icon = typeInfo.icon;

    return (
      <div className="em-section">
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedUtility(null); setStatement(null); }}>
          <ArrowLeft size={16} /> Back to Utilities
        </button>

        <div className="em-utility-header" style={{ borderLeft: `4px solid ${typeInfo.color}` }}>
          <Icon size={28} style={{ color: typeInfo.color }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{selectedUtility}</h2>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Utility Dashboard</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ background: 'var(--warning)', color: 'var(--on-accent)', border: 'none' }} onClick={() => openBillForm(selectedUtility, '', '')}>
              <ShoppingCart size={14} /> Add Bill
            </button>
            <button className="btn btn-sm" onClick={() => openManageConnections(selectedUtility)}>
              <FileText size={14} /> Manage Connections
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => onPayment({ type: 'Utility', payee_name: selectedUtility })}>
              <IndianRupee size={14} /> Make Payment
            </button>
          </div>
        </div>

        <div className="em-kpi-grid em-kpi-grid--3">
          <div className="em-kpi-card em-kpi-card--amber">
            <div className="em-kpi-card__icon"><ShoppingCart size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Total Billed</div>
              <div className="em-kpi-card__value">₹{fmt(totalBilled)}</div>
            </div>
          </div>
          <div className="em-kpi-card em-kpi-card--green">
            <div className="em-kpi-card__icon"><IndianRupee size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Total Paid</div>
              <div className="em-kpi-card__value">₹{fmt(totalPaid)}</div>
            </div>
          </div>
          <div className={`em-kpi-card ${balance > 0 ? 'em-kpi-card--red' : 'em-kpi-card--blue'}`}>
            <div className="em-kpi-card__icon">{balance > 0 ? <TrendingDown size={22} /> : <TrendingUp size={22} />}</div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Balance Due</div>
              <div className="em-kpi-card__value">₹{fmt(Math.abs(balance))}</div>
              {balance > 0 && <div className="em-kpi-card__sub em-kpi-card__sub--warn">Outstanding</div>}
              {balance <= 0 && <div className="em-kpi-card__sub em-kpi-card__sub--ok">No dues</div>}
            </div>
          </div>
        </div>

        <div className="em-card">
          <div className="em-card__title"><FileText size={16} /> Transaction History</div>
          {loadingStmt ? <Loading type="spinner" text="Loading statement..." /> : rows.length > 0 ? (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    {isAdmin && <th style={{ width: 50 }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.payment_date || r.bill_date || r._date)}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                          background: 'var(--secondary)',
                          color: r._entry_type === 'Bill' ? 'var(--destructive)' : 'var(--muted-foreground)'
                        }}>
                          {r._entry_type}
                        </span>
                      </td>
                      <td>{r.reference_number || r.bill_number || '—'}</td>
                      <td>{r.description || r.connection_id || r.payee_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: r._entry_type === 'Bill' ? 'var(--error)' : 'var(--success)' }}>
                        {r._entry_type === 'Bill' ? '-' : '+'}₹{fmt(Number(r.amount || 0))}
                      </td>
                      {isAdmin && (
                        <td>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() =>
                            r._entry_type === 'Bill' ? handleDeleteBill(r.id) : handleDeletePayment(r.id)
                          }><Trash2 size={14} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="em-empty-inline">
              <Icon size={32} strokeWidth={1} />
              <p>No transactions found for {selectedUtility}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" style={{ background: 'var(--warning)', color: 'var(--on-accent)', border: 'none' }} onClick={() => openBillForm(selectedUtility, '', '')}><ShoppingCart size={14} /> Add Bill</button>
                <button className="btn btn-primary btn-sm" onClick={() => onPayment({ type: 'Utility', payee_name: selectedUtility })}><Plus size={14} /> Add Payment</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ══════════ Category Overview with Connections ══════════ */
  const renderOverviewWithConnections = () => {
    const categoryMap = {};
    UTILITY_TYPES.forEach(u => {
      const catData = categoriesData.find(c => c.category === u.key);
      categoryMap[u.key] = {
        ...u,
        connections: catData?.connections || [],
        summary: getSummaryForType(u.key)
      };
    });

    // Custom types not in categoriesData
    customTypes.forEach(name => {
      if (!categoryMap[name]) {
        const catData = categoriesData.find(c => c.category === name);
        categoryMap[name] = {
          key: name, icon: Zap, color: 'var(--accent)',
          connections: catData?.connections || [],
          summary: getSummaryForType(name)
        };
      }
    });

    // --- Calculate Stats for Dashboard Banner ---
    const activeCategoriesCount = Object.keys(categoryMap).length;
    let totalActiveConnections = 0;
    let outstandingBillsCount = 0;
    let outstandingAmountSum = 0;

    Object.values(categoryMap).forEach(u => {
      totalActiveConnections += u.connections.filter(c => c.is_active).length;
      u.connections.forEach(conn => {
        if (conn.is_active && conn.latest_bill) {
          outstandingBillsCount++;
          outstandingAmountSum += Number(conn.latest_bill.amount || 0);
        }
      });
    });

    const totalSpentThisMonth = dashboard?.utility_summary?.reduce((sum, u) => sum + Number(u.total || 0), 0) || 0;

    return (
      <div className="em-section">
        {/* Top Header Row */}
        <div className="em-filter-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 'var(--space-16)' }}>
          <div className="em-section-title"><Zap size={18} style={{ marginRight: 6 }} /> Utility Payments</div>
          {isAdmin ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={fetchBillsFromEmail} disabled={fetchingEmail}>
                {fetchingEmail ? <Loader2 className="spin" size={14} /> : <FileText size={14} />} {fetchingEmail ? 'Fetching...' : 'Fetch Bills from Email'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddType(true)}>
                <PlusCircle size={15} /> Add Utility Type
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={openRequestType}>
              <PlusCircle size={15} /> Request Utility Type
            </button>
          )}
        </div>

        {/* Dashboard Stats Banner */}
        <div className="em-utility-stats">
          <div className="em-utility-stats-grid">
            <div className="em-utility-stat-card">
              <div className="em-utility-stat-icon em-utility-stat-icon--active">
                <Zap size={20} />
              </div>
              <div className="em-utility-stat-body">
                <span className="em-utility-stat-label">Categories</span>
                <span className="em-utility-stat-value">{activeCategoriesCount} Active</span>
                <span className="em-utility-stat-sub">Configured types</span>
              </div>
            </div>

            <div className="em-utility-stat-card">
              <div className="em-utility-stat-icon em-utility-stat-icon--connections">
                <ExternalLink size={20} />
              </div>
              <div className="em-utility-stat-body">
                <span className="em-utility-stat-label">Connections</span>
                <span className="em-utility-stat-value">{totalActiveConnections} Active</span>
                <span className="em-utility-stat-sub">Across all categories</span>
              </div>
            </div>

            <div className="em-utility-stat-card">
              <div className="em-utility-stat-icon em-utility-stat-icon--dues">
                <AlertTriangle size={20} />
              </div>
              <div className="em-utility-stat-body">
                <span className="em-utility-stat-label">Pending Dues</span>
                <span className="em-utility-stat-value">₹{fmt(outstandingAmountSum)}</span>
                <span className={`em-utility-stat-sub ${outstandingBillsCount > 0 ? 'em-utility-stat-sub--highlight' : 'em-utility-stat-sub--ok'}`}>
                  {outstandingBillsCount > 0 ? `${outstandingBillsCount} unpaid bills` : 'All bills settled'}
                </span>
              </div>
            </div>

            <div className="em-utility-stat-card">
              <div className="em-utility-stat-icon em-utility-stat-icon--spent">
                <IndianRupee size={20} />
              </div>
              <div className="em-utility-stat-body">
                <span className="em-utility-stat-label">Spent This Month</span>
                <span className="em-utility-stat-value">₹{fmt(totalSpentThisMonth)}</span>
                <span className="em-utility-stat-sub">Paid utility expenses</span>
              </div>
            </div>
          </div>
        </div>

        {/* Categories Grid */}
        {loadingCategories ? (
          <Loading type="spinner" text="Loading connections..." />
        ) : (
          <div className="em-utility-grid">
            {Object.values(categoryMap).map(u => {
              const Icon = u.icon;
              const catData = categoriesData.find(c => c.category === u.key);
              const activeConns = catData?.connections?.filter(c => c.is_active) || [];
              const isCustom = customTypes.includes(u.key);
              const cardTypeClass = u.key.replace(/[\s/]+/g, '-');

              return (
                <div key={u.key} className="em-utility-category">
                  {/* Category Header Card */}
                  <div className={`em-utility-card em-utility-card--${cardTypeClass}`}
                    title="Click to toggle connections • Double-click for full category dashboard"
                    onClick={() => setExpandedCategory(expandedCategory === u.key ? null : u.key)}
                    onDoubleClick={() => openUtilityDetail(u.key)}
                  >
                    <div className="em-utility-card__header">
                      <div className="em-utility-icon-wrap" style={{ background: `${u.color}15`, color: u.color }}>
                        <Icon size={20} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="em-utility-card__name">{u.key}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {activeConns.length} connection{activeConns.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {expandedCategory === u.key ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>
                    </div>

                    {/* Pending Dues calculation */}
                    <div className="em-utility-card__status">
                      {(() => {
                        const unpaidConns = activeConns.filter(c => c.latest_bill);
                        if (unpaidConns.length > 0) {
                          const sumDues = unpaidConns.reduce((sum, c) => sum + Number(c.latest_bill.amount || 0), 0);
                          return (
                            <span className="em-status-badge em-status-badge--pending" style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', fontSize: '10px' }}>
                              ₹{fmt(sumDues)} Pending ({unpaidConns.length})
                            </span>
                          );
                        }
                        return (
                          <span className="em-status-badge em-status-badge--paid" style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success)', fontSize: '10px' }}>
                            All Settled
                          </span>
                        );
                      })()}
                    </div>

                    {/* Action buttons */}
                    <div className="em-utility-card__actions" onClick={e => e.stopPropagation()}>
                      <button type="button" className="btn btn-sm em-utility-card__btn-bill" onClick={() => openBillForm(u.key, '', '')}>
                        <ShoppingCart size={13} style={{ marginRight: 4 }} /> Record Bill
                      </button>
                      <button type="button" className="btn btn-primary btn-sm em-utility-card__btn-pay" onClick={() => onPayment({ type: 'Utility', payee_name: u.key })}>
                        <IndianRupee size={13} style={{ marginRight: 4 }} /> Pay
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm em-utility-card__btn-dash" title="Open Full Dashboard" onClick={() => openUtilityDetail(u.key)}>
                        <Zap size={13} style={{ marginRight: 4 }} /> Dashboard
                      </button>
                      {isAdmin && (
                        <button type="button" className="btn btn-ghost btn-sm em-utility-card__btn-conn" title="Manage Connections" onClick={() => openManageConnections(u.key)}>
                          <FileText size={13} style={{ marginRight: 4 }} /> Connections
                        </button>
                      )}
                      {isAdmin && isCustom && (
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Remove type" style={{ color: 'var(--danger)' }} onClick={() => handleRemoveType(u.key)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Connections list */}
                  {expandedCategory === u.key && (
                    <div className="em-connections-list">
                      {activeConns.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                          No connections yet. Add one below to get started.
                        </div>
                      ) : (
                        <>
                          <div className="em-connections-header-grid">
                            <div>Connection / Label</div>
                            <div>Branch</div>
                            <div>Provider</div>
                            <div>Billing Cycle</div>
                            <div style={{ textAlign: 'right' }}>Latest Bill / Status</div>
                          </div>
                          {activeConns.map(conn => (
                            <div key={conn.id} className="em-connection-row-grid"
                              title="Double-click to open full connection dashboard (ledger, payment due, etc.)"
                              onClick={() => navigate(`/dashboard/utilities/connections/${conn.id}`)}
                              onDoubleClick={() => navigate(`/dashboard/utilities/connections/${conn.id}`)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                                <span className={`em-connection-indicator ${conn.is_active ? 'em-connection-indicator--active' : 'em-connection-indicator--inactive'}`} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {conn.label || conn.connection_id}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                    ID: {conn.connection_id}
                                  </div>
                                </div>
                              </div>
                              <div>
                                <span className="em-connection-badge-tag">{conn.branch_name || '—'}</span>
                              </div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                                {conn.provider || '—'}
                              </div>
                              <div style={{ textTransform: 'capitalize', color: 'var(--text-secondary)', fontSize: 12 }}>
                                {conn.billing_cycle || 'monthly'}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                {conn.latest_bill ? (
                                  <div>
                                    <div className="em-connection-bill-text em-connection-bill-text--unpaid">
                                      ₹{fmt(Number(conn.latest_bill.amount))}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                      Due {fmtDate(conn.latest_bill.bill_date)}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="em-connection-bill-text em-connection-bill-text--paid" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <Check size={12} /> Settled
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      <div className="em-connections-footer-action">
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          setAddConnectionCategory(u.key);
                          setNewConnection({ connection_id: '', label: '', provider: '', billing_cycle: 'monthly', utility_type: '', branch_id: '' });
                          setShowAddConnectionModal(true);
                        }}>
                          <Plus size={14} style={{ marginRight: 4 }} /> Add New Connection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary Table */}
        {dashboard?.utility_summary?.length > 0 && (
          <div className="em-card" style={{ marginTop: 'var(--space-24)' }}>
            <div className="em-card__title">This Month's Utility Payments</div>
            <div className="em-table-wrap">
              <table className="em-table">
                <thead><tr><th>Utility</th><th>Amount Paid</th><th>Status</th></tr></thead>
                <tbody>
                  {dashboard.utility_summary.map((u, i) => (
                    <tr key={i} style={{ cursor: 'pointer' }} onDoubleClick={() => openUtilityDetail(u.name || u.payee_name)}>
                      <td><strong>{u.name || u.payee_name}</strong></td>
                      <td className="em-amount-cell">₹{fmt(u.total)}</td>
                      <td><span className="em-status-badge em-status-badge--paid">Paid</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <PageContainer>
      {selectedUtility ? renderUtilityDashboard() : renderOverviewWithConnections()}

      {/* ── Add Utility Type Modal ── */}
      {showAddType && (
        <div role="button" tabIndex={0} className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowAddType(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.target === e.currentTarget) setShowAddType(false); } }}>
          <div role="button" tabIndex={0} className="em-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <div className="em-modal__header">
              <h2>Add Utility Type</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddType(false)}><X size={18} /></button>
            </div>
            <div className="em-modal__body">
              <div className="em-form-group">
                <label>Utility Name *</label>
                <input name="new_type_name" className="em-input" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="e.g. Gas, Solar, Cable TV" autoFocus />
              </div>
            </div>
            <div className="em-modal__footer">
              <button className="btn btn-ghost" onClick={() => setShowAddType(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!newTypeName.trim()} onClick={handleAddType}>Add Type</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fetch From Email Report Modal ── */}
      {showFetchReport && (
        <div role="button" tabIndex={0} className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowFetchReport(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.target === e.currentTarget) setShowFetchReport(false); } }}>
          <div role="button" tabIndex={0} className="em-modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <div className="em-modal__header">
              <h2>Fetch Bills From Email</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowFetchReport(false)}><X size={18} /></button>
            </div>
            <div className="em-modal__body">
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{JSON.stringify(fetchReport, null, 2)}</pre>
            </div>
            <div className="em-modal__footer">
              <button className="btn btn-primary" onClick={() => setShowFetchReport(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Connections Modal ── */}
      {showConnectionsModal && (
        <div role="button" tabIndex={0} className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowConnectionsModal(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.target === e.currentTarget) setShowConnectionsModal(false); } }}>
          <div role="button" tabIndex={0} className="em-modal" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <div className="em-modal__header">
              <h2>Manage Connections — {connectionsCategory}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowConnectionsModal(false)}><X size={18} /></button>
            </div>
            <div className="em-modal__body">
              {/* Add new connection form */}
              <div className="em-form-group" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input name="conn_id" className="em-input" style={{ flex: '1 1 140px', minWidth: 120 }} placeholder="Connection ID *" value={newConnection.connection_id} onChange={e => setNewConnection(n => ({ ...n, connection_id: e.target.value }))} />
                <input name="conn_label" className="em-input" style={{ flex: '1 1 140px', minWidth: 120 }} placeholder="Label" value={newConnection.label} onChange={e => setNewConnection(n => ({ ...n, label: e.target.value }))} />
                <input name="conn_provider" className="em-input" style={{ flex: '1 1 100px', minWidth: 100 }} placeholder="Provider" value={newConnection.provider} onChange={e => setNewConnection(n => ({ ...n, provider: e.target.value }))} />
                <select name="conn_billing_cycle" className="em-input" style={{ flex: '0 0 110px' }} value={newConnection.billing_cycle} onChange={e => setNewConnection(n => ({ ...n, billing_cycle: e.target.value }))}>
                  <option value="monthly">Monthly</option>
                  <option value="bimonthly">Bimonthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="half-yearly">Half-Yearly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <button className="btn btn-primary" disabled={connectionSaving || !newConnection.connection_id} onClick={() => addConnection(connectionsCategory)}>
                  {connectionSaving ? 'Saving...' : 'Add'}
                </button>
              </div>

              {/* Connections list */}
              <div style={{ marginTop: 16 }}>
                {connectionsLoading ? <div className="em-loading"><Loader2 className="spin" size={16} /> Loading...</div> : (
                  <div className="em-table-wrap">
                    <table className="em-table">
                      <thead>
                        <tr>
                          <th>Connection</th>
                          <th>Label</th>
                          <th>Provider</th>
                          <th>Billing Cycle</th>
                          <th>Branch</th>
                          <th>Status</th>
                          <th style={{ width: 130 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {connections.map(c => (
                          <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.5 }}>
                            <td>{c.connection_id}</td>
                            <td>{c.label || '—'}</td>
                            <td>{c.provider || '—'}</td>
                            <td style={{ textTransform: 'capitalize' }}>{c.billing_cycle || 'monthly'}</td>
                            <td>{c.branch_name || '—'}</td>
                            <td>
                              <span className={`em-status-badge ${c.is_active ? 'em-status-badge--paid' : 'em-status-badge--pending'}`}>
                                {c.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-ghost btn-icon btn-sm" title="Edit"
                                  onClick={() => setEditingConnection({ ...c })}>
                                  <Edit3 size={14} />
                                </button>
                                <button className="btn btn-ghost btn-icon btn-sm" title={c.is_active ? 'Deactivate' : 'Activate'}
                                  onClick={() => toggleConnectionStatus(c)}>
                                  {c.is_active ? <X size={14} /> : <Plus size={14} />}
                                </button>
                                <button className="btn btn-ghost btn-icon btn-sm" title="Delete"
                                  onClick={() => deleteConnection(c.id, connectionsCategory)}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {connections.length === 0 && (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No connections yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Edit connection inline modal */}
              {editingConnection && (
                <div className="modal-backdrop" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setEditingConnection(null)}>
                  <div className="em-modal" style={{ maxWidth: 500, position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <div className="em-modal__header">
                      <h3>Edit Connection</h3>
                      <button className="btn btn-ghost btn-icon" onClick={() => setEditingConnection(null)}><X size={18} /></button>
                    </div>
                    <div className="em-modal__body">
                      <div className="em-form-group">
                        <label>Label</label>
                        <input className="em-input" value={editingConnection.label || ''} onChange={e => setEditingConnection(p => ({ ...p, label: e.target.value }))} />
                      </div>
                      <div className="em-form-group">
                        <label>Provider</label>
                        <input className="em-input" value={editingConnection.provider || ''} onChange={e => setEditingConnection(p => ({ ...p, provider: e.target.value }))} />
                      </div>
                      <div className="em-form-group">
                        <label>Billing Cycle</label>
                        <select className="em-input" value={editingConnection.billing_cycle || 'monthly'} onChange={e => setEditingConnection(p => ({ ...p, billing_cycle: e.target.value }))}>
                          <option value="monthly">Monthly</option>
                          <option value="bimonthly">Bimonthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="half-yearly">Half-Yearly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
                      <div className="em-form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" id="edit_is_active" checked={!!editingConnection.is_active} onChange={e => setEditingConnection(p => ({ ...p, is_active: e.target.checked ? 1 : 0 }))} />
                        <label htmlFor="edit_is_active" style={{ margin: 0 }}>Active</label>
                      </div>
                    </div>
                    <div className="em-modal__footer">
                      <button className="btn btn-ghost" onClick={() => setEditingConnection(null)}>Cancel</button>
                      <button className="btn btn-primary" disabled={connectionSaving} onClick={updateConnection}>
                        {connectionSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="em-modal__footer">
              <button className="btn btn-primary" onClick={() => setShowConnectionsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Connection Modal (quick-add from category) ── */}
      {showAddConnectionModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowAddConnectionModal(false); }}>
          <div className="em-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
              <h3>
                <FileText size={16} style={{ marginRight: 8 }} />
                Add Connection{addConnectionCategory ? ` — ${addConnectionCategory}` : ''}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddConnectionModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                await addConnection(addConnectionCategory);
                setShowAddConnectionModal(false);
              } catch { /* error toast already shown */ }
            }}>
              <div className="em-modal__body">
                <div className="em-form-grid">
                  {!addConnectionCategory && (
                    <div className="em-form-group em-form-group--full">
                      <label>Category *</label>
                      <select className={`em-input ${formErrors.utility_type ? 'field-error' : ''}`}
                        value={newConnection.utility_type}
                        onChange={e => { setNewConnection(n => ({ ...n, utility_type: e.target.value })); setFormErrors(f => ({ ...f, utility_type: undefined })); }}>
                        <option value="">— Select category —</option>
                        {UTILITY_TYPES.map(t => (
                          <option key={t.key} value={t.key}>{t.key}</option>
                        ))}
                      </select>
                      {formErrors.utility_type && <span className="field-error-text">{formErrors.utility_type}</span>}
                    </div>
                  )}
                  <div className="em-form-group">
                    <label>Account / Consumer No. *</label>
                    <input className={`em-input ${formErrors.connection_id ? 'field-error' : ''}`}
                      value={newConnection.connection_id}
                      onChange={e => { setNewConnection(n => ({ ...n, connection_id: e.target.value })); setFormErrors(f => ({ ...f, connection_id: undefined })); }}
                      placeholder="e.g. KE-12345678" autoFocus />
                    {formErrors.connection_id && <span className="field-error-text">{formErrors.connection_id}</span>}
                  </div>
                  <div className="em-form-group">
                    <label>Label / Nickname</label>
                    <input className="em-input" value={newConnection.label} onChange={e => setNewConnection(n => ({ ...n, label: e.target.value }))} placeholder="e.g. Meppayur Main Building" />
                  </div>
                  <div className="em-form-group">
                    <label>Provider</label>
                    <input className="em-input" value={newConnection.provider} onChange={e => setNewConnection(n => ({ ...n, provider: e.target.value }))} placeholder="e.g. KSEB, BSNL, Jio" />
                  </div>
                  {isAdmin && branches.length > 0 && (
                    <div className="em-form-group">
                      <label>Branch</label>
                      <select className="em-input" value={newConnection.branch_id} onChange={e => setNewConnection(n => ({ ...n, branch_id: e.target.value }))}>
                        <option value="">— Select branch —</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="em-form-group">
                    <label>Billing Cycle</label>
                    <select className="em-input" value={newConnection.billing_cycle} onChange={e => setNewConnection(n => ({ ...n, billing_cycle: e.target.value }))}>
                      <option value="monthly">Monthly</option>
                      <option value="bimonthly">Bimonthly</option>
                      <option value="quarterly">Quarterly</option>
                    </select>
                  </div>
                  <div className="em-form-group em-form-group--full" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <label style={{ margin: 0 }}>Status</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
                      <input type="checkbox" checked={!newConnection.is_active} onChange={e => setNewConnection(n => ({ ...n, is_active: e.target.checked ? 0 : 1 }))} />
                      Mark as inactive
                    </label>
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddConnectionModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={connectionSaving}>
                  {connectionSaving ? <><Loader2 className="spin" size={14} style={{ marginRight: 6 }} /> Saving...</> : 'Add Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Request Utility Type Modal (Front Office) ── */}
      {showRequestType && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRequestType(false); }}>
          <div role="button" tabIndex={0} className="em-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <div className="em-modal__header">
              <h2>Request Utility Type</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRequestType(false)}><X size={18} /></button>
            </div>
            <div className="em-modal__body">
              {requestError && <div className="em-error" style={{ marginBottom: 12 }}>{requestError}</div>}
              <div className="em-form-group">
                <label>Utility Name *</label>
                <input name="request_type_name" className="em-input" value={requestTypeName} onChange={e => setRequestTypeName(e.target.value)} placeholder="e.g. Gas, Solar, Cable TV" autoFocus />
              </div>
              <div className="em-form-group">
                <label>Reason / Notes</label>
                <input name="request_reason" className="em-input" value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Why is this utility needed?" />
              </div>
            </div>
            <div className="em-modal__footer">
              <button className="btn btn-ghost" onClick={() => setShowRequestType(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!requestTypeName.trim() || requestSaving} onClick={submitRequestType}>
                {requestSaving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Elevated Bill Recording Modal ── */}
      {showBillForm && (
        <div role="button" tabIndex={0} className="em-modal-backdrop" onClick={() => setShowBillForm(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowBillForm(false); } }}>
          <div role="button" tabIndex={0} className="em-modal em-modal--bill-record" onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <form onSubmit={(e) => handleBillSubmit(e, true)}>
              <div className="em-modal__header utility-modal-header">
                <div className="utility-modal-header-info">
                  <div className="utility-badge-chip">
                    <Building size={14} /> Non-Vendor Direct Expense / Utility Bill
                  </div>
                  <h3>Record Expense Bill — {billForm.utility_type}</h3>
                </div>
                <button type="button" className="em-modal__close" onClick={() => setShowBillForm(false)}>×</button>
              </div>

              <div className="em-modal__body">
                {billError && <div className="em-alert em-alert--danger"><AlertCircle size={16} /> {billError}</div>}
                {billSuccess && <div className="em-alert em-alert--success"><CheckCircle2 size={16} /> {billSuccess}</div>}

                {/* Consumer Verification & Branch Connection Card */}
                {activeConnectionMatch ? (
                  <div className="connection-verification-card connection-verification-card--matched">
                    <div className="conn-verify-header">
                      <div className="conn-verify-badge"><ShieldCheck size={14} /> Verified System Connection</div>
                      <span className="conn-type-tag">{activeConnectionMatch.utility_type}</span>
                    </div>
                    <div className="conn-verify-grid">
                      <div className="conn-stat">
                        <span className="conn-stat-label"><Building2 size={12} /> Building / Branch</span>
                        <span className="conn-stat-val">{activeConnectionMatch.branch_name || 'Main Press Building'}</span>
                      </div>
                      <div className="conn-stat">
                        <span className="conn-stat-label"><MapPin size={12} /> Service Location</span>
                        <span className="conn-stat-val">{activeConnectionMatch.label || activeConnectionMatch.connection_id}</span>
                      </div>
                      <div className="conn-stat">
                        <span className="conn-stat-label"><Zap size={12} /> Provider & No.</span>
                        <span className="conn-stat-val">{activeConnectionMatch.provider ? `${activeConnectionMatch.provider} (${activeConnectionMatch.connection_id})` : activeConnectionMatch.connection_id}</span>
                      </div>
                      <div className="conn-stat">
                        <span className="conn-stat-label"><Calendar size={12} /> Billing Cycle</span>
                        <span className="conn-stat-val" style={{ textTransform: 'capitalize' }}>{activeConnectionMatch.billing_cycle || 'Monthly'}</span>
                      </div>
                    </div>
                  </div>
                ) : billForm.connection_id ? (
                  <div className="connection-verification-card connection-verification-card--unlinked">
                    <div className="conn-verify-header">
                      <div className="conn-verify-badge conn-verify-badge--warn"><AlertCircle size={14} /> Unlinked Consumer Number</div>
                      <button type="button" className="btn btn-xs btn-outline" onClick={() => openManageConnections(billForm.utility_type)}>
                        + Link Connection to Branch
                      </button>
                    </div>
                    <p className="conn-verify-desc">
                      Consumer Number <strong>{billForm.connection_id}</strong> is not yet registered to a specific building branch. It will be saved with this expense record.
                    </p>
                  </div>
                ) : null}

                <div className="em-form-grid">
                  {billForm.utility_type === 'Electricity' && (
                    <div className="em-form-group em-form-group--full">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input name="multiple_consumers" type="checkbox" checked={multipleConsumers} onChange={e => setMultipleConsumers(e.target.checked)} />
                        <span>Record multiple consumer numbers in batch</span>
                      </label>
                    </div>
                  )}

                  {!multipleConsumers && (
                    <div className="em-form-group">
                      <label><IndianRupee size={12} /> Bill Amount (₹) *</label>
                      <input 
                        name="bill_amount" 
                        className="em-input em-input--highlight" 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        required 
                        onWheel={e => e.target.blur()}
                        value={billForm.amount} 
                        onChange={e => setBillForm(p => ({ ...p, amount: e.target.value }))} 
                        placeholder="Enter bill amount" 
                      />
                    </div>
                  )}

                  <div className="em-form-group">
                    <label><Hash size={12} /> Bill / Invoice Number</label>
                    <input 
                      name="bill_number" 
                      className="em-input" 
                      value={billForm.bill_number} 
                      onChange={e => setBillForm(p => ({ ...p, bill_number: e.target.value }))} 
                      placeholder="e.g. ELEC-2026-001" 
                    />
                  </div>

                  <div className="em-form-group">
                    <label><Calendar size={12} /> Bill Date</label>
                    <input 
                      name="bill_date" 
                      className="em-input" 
                      type="date" 
                      value={billForm.bill_date} 
                      onChange={e => setBillForm(p => ({ ...p, bill_date: e.target.value }))} 
                    />
                  </div>

                  {multipleConsumers ? (
                    <div className="em-form-group em-form-group--full">
                      <label>Consumers & Amounts</label>
                      {billEntries.map((entry, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input name="entry_connection_id" className="em-input" list="connections-list" placeholder="Consumer Number" value={entry.connection_id} onChange={e => updateBillEntry(idx, 'connection_id', e.target.value)} />
                          <input name="entry_amount" className="em-input" placeholder="Amount (₹)" type="number" step="0.01" min="0" onWheel={e => e.target.blur()} value={entry.amount} onChange={e => updateBillEntry(idx, 'amount', e.target.value)} />
                          <input name="entry_bill_number" className="em-input" placeholder="Bill No. (optional)" value={entry.bill_number} onChange={e => updateBillEntry(idx, 'bill_number', e.target.value)} />
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeBillEntry(idx)} title="Remove"><Trash2 size={14} /></button>
                        </div>
                      ))}
                      <div>
                        <button type="button" className="btn btn-sm" onClick={addBillEntry}><Plus size={14} /> Add Consumer</button>
                      </div>
                    </div>
                  ) : (
                    <div className="em-form-group">
                      <label><Building2 size={12} /> Consumer Number / Meter Connection</label>
                      <select name="connection_record_id" className="em-input" value={billForm.connection_record_id} onChange={e => {
                        const connId = e.target.value;
                        const conn = connections.find(c => String(c.id) === connId);
                        setBillForm(p => ({ ...p, connection_record_id: connId, connection_id: conn?.connection_id || '' }));
                      }}>
                        <option value="">— Select Building / Consumer Connection —</option>
                        {connections.filter(c => c.is_active).map(c => (
                          <option key={c.id} value={c.id}>
                            {c.connection_id} — {c.label || 'Building Meter'}{c.branch_name ? ` (${c.branch_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Payment Details Section */}
                  <div className="em-form-group">
                    <label><CreditCard size={12} /> Payment Mode</label>
                    <select 
                      className="em-input" 
                      value={billForm.payment_method} 
                      onChange={e => setBillForm(p => ({ ...p, payment_method: e.target.value }))}
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI / GPay / PhonePe</option>
                      <option value="Bank Transfer">Bank Transfer / NEFT</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>

                  <div className="em-form-group">
                    <label><Hash size={12} /> Payment Reference / UTR Number</label>
                    <input 
                      name="payment_ref" 
                      className="em-input" 
                      value={billForm.payment_ref || ''} 
                      onChange={e => setBillForm(p => ({ ...p, payment_ref: e.target.value }))} 
                      placeholder="e.g. UTR / Transaction / Cheque No." 
                    />
                  </div>

                  <div className="em-form-group em-form-group--full">
                    <label>Description & Notes</label>
                    <textarea 
                      name="description" 
                      className="em-input" 
                      rows={2} 
                      value={billForm.description} 
                      onChange={e => setBillForm(p => ({ ...p, description: e.target.value }))} 
                      placeholder="Bill period, units consumed, meter reading notes etc." 
                    />
                  </div>
                </div>
              </div>

              <div className="em-modal__footer utility-bill-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowBillForm(false)}>Cancel</button>
                <div className="utility-bill-footer-actions">
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-record-unpaid" 
                    disabled={billSaving}
                    onClick={(e) => handleBillSubmit(e, false)}
                    title="Save bill as unpaid pending due"
                  >
                    <FileText size={15} /> {billSaving ? 'Saving...' : 'Record Bill'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-primary btn-record-paid" 
                    disabled={billSaving}
                    onClick={(e) => handleBillSubmit(e, true)}
                    title="Save bill and record immediate payout in accounts"
                  >
                    <CheckCircle2 size={15} /> {billSaving ? 'Saving...' : 'Paid and Record Bill'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default React.memo(UtilitiesTab);

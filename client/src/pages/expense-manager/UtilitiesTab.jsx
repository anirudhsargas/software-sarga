import React, { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Zap, Wifi, Phone, Droplets, ArrowLeft,
  Calendar, TrendingUp, TrendingDown, AlertTriangle, Loader2,
  Plus, Trash2, X, PlusCircle, ShoppingCart, IndianRupee, FileText, ChevronDown, ChevronRight, ExternalLink, Edit3
} from 'lucide-react';
import api from '../../services/api';
import auth from '../../services/auth';
import { fmt, fmtDate } from './constants';
import { serverToday } from '../../services/serverTime';
import { useConfirm } from '../../contexts/ConfirmContext';
import PageContainer from '../../components/ui/PageContainer';
import toast from 'react-hot-toast';

const DEFAULT_UTILITY_TYPES = [
  { key: 'Electricity', icon: Zap, color: 'var(--warning)' },
  { key: 'Internet / Broadband', icon: Wifi, color: 'var(--accent-2)' },
  { key: 'Phone', icon: Phone, color: 'var(--success)' },
  { key: 'Water', icon: Droplets, color: 'var(--accent)' },
];

const UtilitiesTab = ({ dashboard, onPayment, onRefresh }) => {
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
  const [newConnection, setNewConnection] = useState({ connection_id: '', label: '', provider: '', billing_cycle: 'monthly' });
  const [editingConnection, setEditingConnection] = useState(null);
  const [connectionSaving, setConnectionSaving] = useState(false);

  // Add connection modal
  const [showAddConnectionModal, setShowAddConnectionModal] = useState(false);
  const [addConnectionCategory, setAddConnectionCategory] = useState('');

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
  }, [fetchCategoriesData]);

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
      connection_id: connLabel || ''
    });
    setBillError('');
    setBillSuccess('');
    setShowBillForm(true);
    setMultipleConsumers(false);
    setBillEntries([{ connection_id: '', amount: '', bill_number: '' }]);
    if (utilType) fetchConnections(utilType);
  };

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
  const addConnection = async (utilityType) => {
    if (!newConnection.connection_id) return;
    setConnectionSaving(true);
    try {
      await api.post('/utility-connections', {
        utility_type: utilityType,
        connection_id: newConnection.connection_id,
        label: newConnection.label || null,
        provider: newConnection.provider || null,
        billing_cycle: newConnection.billing_cycle || 'monthly'
      });
      setNewConnection({ connection_id: '', label: '', provider: '', billing_cycle: 'monthly' });
      if (showConnectionsModal) await fetchConnections(utilityType);
      await fetchCategoriesData();
      toast.success('Connection added');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add connection');
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
  const handleBillSubmit = async (e) => {
    e.preventDefault();
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
            connection_record_id: billForm.connection_record_id || undefined
          };
          return api.post('/utility-bills', payload);
        });
        const results = await Promise.allSettled(promises);
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failCount = results.filter(r => r.status === 'rejected').length;
        if (successCount > 0) {
          setBillSuccess(`${successCount} bills recorded${failCount ? `; ${failCount} failed` : ''}`);
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

    if (!billForm.amount || Number(billForm.amount) <= 0) { setBillError('Amount is required'); return; }
    setBillSaving(true); setBillError(''); setBillSuccess('');
    try {
      await api.post('/utility-bills', billForm);
      setBillSuccess('Bill recorded successfully!');
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
          {loadingStmt ? <div className="em-loading"><Loader2 className="spin" size={20} /> Loading...</div> : rows.length > 0 ? (
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

    return (
      <div className="em-section">
        <div className="em-filter-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div className="em-section-title"><Zap size={18} /> Utility Payments</div>
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

        {loadingCategories ? (
          <div className="em-loading"><Loader2 className="spin" size={20} /> Loading connections...</div>
        ) : (
          <div className="em-utility-grid">
            {Object.values(categoryMap).map(u => {
              const Icon = u.icon;
              const catData = categoriesData.find(c => c.category === u.key);
              const activeConns = catData?.connections?.filter(c => c.is_active) || [];
              const isCustom = customTypes.includes(u.key);

              return (
                <div key={u.key} className="em-utility-category">
                  {/* Category Header */}
                  <div className="em-utility-card"
                    onClick={() => {
                      if (expandedCategory === u.key) {
                        setExpandedCategory(null);
                      } else {
                        setExpandedCategory(u.key);
                      }
                    }}
                    style={{ cursor: 'pointer', marginBottom: 0, borderBottomLeftRadius: expandedCategory === u.key ? 0 : undefined, borderBottomRightRadius: expandedCategory === u.key ? 0 : undefined }}
                  >
                    <div className="em-utility-card__header">
                      <div className="em-utility-card__icon" style={{ background: `${u.color}15`, color: u.color }}>
                        <Icon size={22} />
                      </div>
                      <div className="em-utility-card__name">{u.key}</div>
                      {activeConns.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
                          {activeConns.length} connection{activeConns.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {expandedCategory === u.key ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </div>
                    <div className="em-utility-card__status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="em-status-badge em-status-badge--paid" style={{ background: 'var(--secondary)', color: 'var(--muted)' }}>
                        {activeConns.length} active
                      </span>
                    </div>
                    <div className="em-utility-card__actions" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
                      <button type="button" className="btn btn-sm em-utility-card__btn-bill" onClick={(e) => { e.stopPropagation(); openBillForm(u.key, '', ''); }}>
                        <ShoppingCart size={13} /> Bill
                      </button>
                      <button type="button" className="btn btn-primary btn-sm em-utility-card__btn-pay" onClick={(e) => { e.stopPropagation(); onPayment({ type: 'Utility', payee_name: u.key }); }}>
                        <IndianRupee size={13} /> Pay
                      </button>
                      {isAdmin && (
                        <button type="button" className="btn btn-ghost btn-sm" title="Manage Connections" onClick={(e) => { e.stopPropagation(); openManageConnections(u.key); }}>
                          <FileText size={13} /> Connections
                        </button>
                      )}
                      {isAdmin && isCustom && (
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Remove type" onClick={(e) => { e.stopPropagation(); handleRemoveType(u.key); }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Connections */}
                  {expandedCategory === u.key && (
                    <div className="em-connections-list" style={{ border: '1px solid var(--border)', borderTop: 'none', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                      {activeConns.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                          No connections yet. Add one below.
                        </div>
                      ) : (
                        activeConns.map(conn => (
                          <div key={conn.id} className="em-connection-row"
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                            onClick={() => navigate(`/dashboard/utilities/connections/${conn.id}`)}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                                {conn.label || conn.connection_id}
                              </div>
                              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                                <span>{conn.branch_name}</span>
                                {conn.provider && <span>{conn.provider}</span>}
                                <span style={{ textTransform: 'capitalize' }}>{conn.billing_cycle}</span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', minWidth: 120 }}>
                              {conn.latest_bill ? (
                                <>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--error)' }}>
                                    ₹{fmt(Number(conn.latest_bill.amount))}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                    Due {fmtDate(conn.latest_bill.bill_date)}
                                  </div>
                                </>
                              ) : (
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>No bills yet</div>
                              )}
                            </div>
                            <button className="btn btn-ghost btn-icon btn-sm" title="View ledger"
                              onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/utilities/connections/${conn.id}`); }}>
                              <ExternalLink size={14} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Add bill"
                              onClick={(e) => { e.stopPropagation(); openBillForm(u.key, conn.id, conn.label || conn.connection_id); }}>
                              <ShoppingCart size={13} />
                            </button>
                          </div>
                        ))
                      )}
                      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          setAddConnectionCategory(u.key);
                          setNewConnection({ connection_id: '', label: '', provider: '', billing_cycle: 'monthly' });
                          setShowAddConnectionModal(true);
                        }}>
                          <Plus size={14} /> Add Connection
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
          <div className="em-card">
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
        <div role="button" tabIndex={0} className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowAddConnectionModal(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.target === e.currentTarget) setShowAddConnectionModal(false); } }}>
          <div role="button" tabIndex={0} className="em-modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <div className="em-modal__header">
              <h3>Add Connection — {addConnectionCategory}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddConnectionModal(false)}><X size={18} /></button>
            </div>
            <div className="em-modal__body">
              <div className="em-form-grid">
                <div className="em-form-group">
                  <label>Connection ID / Account No. *</label>
                  <input className="em-input" value={newConnection.connection_id} onChange={e => setNewConnection(n => ({ ...n, connection_id: e.target.value }))} placeholder="e.g. KE-12345678" autoFocus />
                </div>
                <div className="em-form-group">
                  <label>Label / Nickname</label>
                  <input className="em-input" value={newConnection.label} onChange={e => setNewConnection(n => ({ ...n, label: e.target.value }))} placeholder="e.g. Meppayur Main Building" />
                </div>
                <div className="em-form-group">
                  <label>Provider</label>
                  <input className="em-input" value={newConnection.provider} onChange={e => setNewConnection(n => ({ ...n, provider: e.target.value }))} placeholder="e.g. KSEB, BSNL, Jio" />
                </div>
                <div className="em-form-group">
                  <label>Billing Cycle</label>
                  <select className="em-input" value={newConnection.billing_cycle} onChange={e => setNewConnection(n => ({ ...n, billing_cycle: e.target.value }))}>
                    <option value="monthly">Monthly</option>
                    <option value="bimonthly">Bimonthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="em-modal__footer">
              <button className="btn btn-ghost" onClick={() => setShowAddConnectionModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={connectionSaving || !newConnection.connection_id} onClick={() => {
                addConnection(addConnectionCategory);
                setShowAddConnectionModal(false);
              }}>
                {connectionSaving ? 'Saving...' : 'Add Connection'}
              </button>
            </div>
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

      {/* ── Bill Recording Modal ── */}
      {showBillForm && (
        <div role="button" tabIndex={0} className="em-modal-backdrop" onClick={() => setShowBillForm(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowBillForm(false); } }}>
          <div role="button" tabIndex={0} className="em-modal" onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <form onSubmit={handleBillSubmit}>
              <div className="em-modal__header">
                <h3><ShoppingCart size={18} /> Record Bill — {billForm.utility_type}</h3>
                <button type="button" className="em-modal__close" onClick={() => setShowBillForm(false)}>×</button>
              </div>
              <div className="em-modal__body">
                {billError && <div className="em-alert em-alert--danger">{billError}</div>}
                {billSuccess && <div className="em-alert em-alert--success">{billSuccess}</div>}
                <div className="em-form-grid">
                  {billForm.utility_type === 'Electricity' ? (
                    <>
                      <div className="em-form-group em-form-group--full">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input name="multiple_consumers" type="checkbox" checked={multipleConsumers} onChange={e => setMultipleConsumers(e.target.checked)} />
                          Record multiple consumer numbers
                        </label>
                      </div>

                      {!multipleConsumers && (
                        <div className="em-form-group">
                          <label>Amount (₹) *</label>
                          <input name="bill_amount" className="em-input" type="number" step="0.01" min="0" required value={billForm.amount} onChange={e => setBillForm(p => ({ ...p, amount: e.target.value }))} placeholder="Enter bill amount" />
                        </div>
                      )}

                      <div className="em-form-group">
                        <label>Bill Number</label>
                        <input name="bill_number" className="em-input" value={billForm.bill_number} onChange={e => setBillForm(p => ({ ...p, bill_number: e.target.value }))} placeholder="e.g. ELEC-2026-001" />
                      </div>

                      <div className="em-form-group">
                        <label>Bill Date</label>
                        <label htmlFor="date-pljnfp" className="sr-only">Select Date</label>
                        <input id="date-pljnfp" name="bill_date" className="em-input" type="date" value={billForm.bill_date} onChange={e => setBillForm(p => ({ ...p, bill_date: e.target.value }))} />
                      </div>

                      {multipleConsumers ? (
                        <div className="em-form-group em-form-group--full">
                          <label>Consumers</label>
                          {billEntries.map((entry, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                              <input name="entry_connection_id" className="em-input" list="connections-list" placeholder="Connection ID" value={entry.connection_id} onChange={e => updateBillEntry(idx, 'connection_id', e.target.value)} />
                              <input name="entry_amount" className="em-input" placeholder="Amount (₹)" type="number" step="0.01" min="0" value={entry.amount} onChange={e => updateBillEntry(idx, 'amount', e.target.value)} />
                              <input name="entry_bill_number" className="em-input" placeholder="Bill Number (optional)" value={entry.bill_number} onChange={e => updateBillEntry(idx, 'bill_number', e.target.value)} />
                              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeBillEntry(idx)} title="Remove"><Trash2 size={14} /></button>
                            </div>
                          ))}
                          <div>
                            <button type="button" className="btn btn-sm" onClick={addBillEntry}><Plus size={14} /> Add Consumer</button>
                          </div>
                        </div>
                      ) : (
                        <div className="em-form-group">
                          <label>Connection</label>
                          <select name="connection_record_id" className="em-input" value={billForm.connection_record_id} onChange={e => {
                            const connId = e.target.value;
                            const conn = connections.find(c => String(c.id) === connId);
                            setBillForm(p => ({ ...p, connection_record_id: connId, connection_id: conn?.connection_id || '' }));
                          }}>
                            <option value="">— Select connection —</option>
                            {connections.filter(c => c.is_active).map(c => (
                              <option key={c.id} value={c.id}>{c.label || c.connection_id}{c.provider ? ` (${c.provider})` : ''}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="em-form-group">
                        <label>Amount (₹) *</label>
                        <input name="bill_amount" className="em-input" type="number" step="0.01" min="0" required value={billForm.amount} onChange={e => setBillForm(p => ({ ...p, amount: e.target.value }))} placeholder="Enter bill amount" />
                      </div>
                      <div className="em-form-group">
                        <label>Bill Number</label>
                        <input name="bill_number" className="em-input" value={billForm.bill_number} onChange={e => setBillForm(p => ({ ...p, bill_number: e.target.value }))} placeholder="e.g. ELEC-2026-001" />
                      </div>
                      <div className="em-form-group">
                        <label>Bill Date</label>
                        <label htmlFor="date-5o5u4c" className="sr-only">Select Date</label>
                        <input id="date-5o5u4c" name="bill_date" className="em-input" type="date" value={billForm.bill_date} onChange={e => setBillForm(p => ({ ...p, bill_date: e.target.value }))} />
                      </div>
                      <div className="em-form-group">
                        <label>Connection</label>
                        <select name="connection_record_id" className="em-input" value={billForm.connection_record_id} onChange={e => {
                          const connId = e.target.value;
                          const conn = connections.find(c => String(c.id) === connId);
                          setBillForm(p => ({ ...p, connection_record_id: connId, connection_id: conn?.connection_id || '' }));
                        }}>
                          <option value="">— Select connection —</option>
                          {connections.filter(c => c.is_active).map(c => (
                            <option key={c.id} value={c.id}>{c.label || c.connection_id}{c.provider ? ` (${c.provider})` : ''}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div className="em-form-group em-form-group--full">
                    <label>Description</label>
                    <textarea name="description" className="em-input" rows={3} value={billForm.description} onChange={e => setBillForm(p => ({ ...p, description: e.target.value }))} placeholder="Bill details, period, meter reading etc." />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowBillForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={billSaving}>{billSaving ? 'Saving...' : 'Record Bill'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default React.memo(UtilitiesTab);

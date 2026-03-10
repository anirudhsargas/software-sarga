import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, ShieldX, ShieldAlert, Clock, Search, Filter,
  Calendar, Receipt, Loader2, FileX, ChevronDown, ChevronUp,
  IndianRupee, User, Hash, X, AlertTriangle, CheckCircle2, Ban
} from 'lucide-react';
import api from '../services/api';
import { serverToday } from '../services/serverTime';
import Pagination from '../components/Pagination';
import toast from 'react-hot-toast';
import { formatCurrencyDecimal } from '../constants';
import './PaymentVerification.css';

const STATUS_CONFIG = {
  Pending: { icon: ShieldAlert, color: '#f59e0b', bg: '#fef3c7', label: 'Pending' },
  Verified: { icon: ShieldCheck, color: '#10b981', bg: '#d1fae5', label: 'Verified' },
  Rejected: { icon: ShieldX, color: '#ef4444', bg: '#fee2e2', label: 'Rejected' },
  'Not in Statement': { icon: FileX, color: '#8b5cf6', bg: '#ede9fe', label: 'Not in Statement' },
};

const METHOD_ICONS = {
  UPI: '📱',
  Cheque: '📝',
  'Account Transfer': '🏦',
  Both: '💳',
};

const PaymentVerification = () => {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('Pending');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [verifying, setVerifying] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/customer-payments/verification-stats');
      setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchPayments = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: 20, status: activeTab });
      if (dateRange.start) params.set('startDate', dateRange.start);
      if (dateRange.end) params.set('endDate', dateRange.end);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/customer-payments/pending-verification?${params}`);
      const data = res.data;
      setPayments(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, activeTab, dateRange, search]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { setPage(1); }, [activeTab, search, dateRange]);
  useEffect(() => { fetchPayments(page); }, [page, fetchPayments]);

  const handleVerify = async (id, status) => {
    setVerifying(id);
    try {
      await api.patch(`/customer-payments/${id}/verify`, { status, note: noteText || undefined });
      toast.success(`Payment marked as "${status}"`);
      setNoteText('');
      setExpandedId(null);
      fetchPayments(page);
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setVerifying(null);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmt = (n) => formatCurrencyDecimal(Number(n) || 0);

  const statCards = [
    { key: 'Pending', count: stats?.pending || 0, amount: stats?.pending_amount || 0 },
    { key: 'Verified', count: stats?.verified || 0, amount: stats?.verified_amount || 0 },
    { key: 'Not in Statement', count: stats?.not_in_statement || 0, amount: stats?.not_in_statement_amount || 0 },
    { key: 'Rejected', count: stats?.rejected || 0, amount: stats?.rejected_amount || 0 },
  ];

  return (
    <div className="pv-page">
      {/* Header */}
      <div className="pv-header">
        <div>
          <h1 className="pv-title">Payment Verification</h1>
          <p className="pv-subtitle">Verify UPI, Cheque & Account Transfer payments against bank statements</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="pv-stats-row">
        {statCards.map(s => {
          const cfg = STATUS_CONFIG[s.key];
          const Icon = cfg.icon;
          const isActive = activeTab === s.key;
          return (
            <button
              key={s.key}
              className={`pv-stat-card ${isActive ? 'pv-stat-card--active' : ''}`}
              style={{ '--card-color': cfg.color, '--card-bg': cfg.bg }}
              onClick={() => setActiveTab(s.key)}
            >
              <div className="pv-stat-icon"><Icon size={20} /></div>
              <div className="pv-stat-info">
                <span className="pv-stat-label">{cfg.label}</span>
                <span className="pv-stat-count">{s.count}</span>
                <span className="pv-stat-amount">₹{fmt(s.amount)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="pv-filters">
        <div className="pv-search-wrap">
          <Search size={16} className="pv-search-icon" />
          <input
            className="pv-search-input"
            placeholder="Search by name or reference..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="pv-search-clear" onClick={() => setSearch('')}><X size={14} /></button>}
        </div>
        <div className="pv-date-filters">
          <input type="date" className="pv-date-input" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} />
          <span className="pv-date-sep">to</span>
          <input type="date" className="pv-date-input" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} />
          {(dateRange.start || dateRange.end) && (
            <button className="btn btn-ghost btn-xs" onClick={() => setDateRange({ start: '', end: '' })}>Clear</button>
          )}
        </div>
      </div>

      {/* Payment Cards */}
      <div className="pv-list">
        {loading ? (
          <div className="pv-empty">
            <Loader2 size={28} className="pv-spin" />
            <span>Loading payments...</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="pv-empty">
            <CheckCircle2 size={32} style={{ opacity: 0.4 }} />
            <span>{activeTab === 'Pending' ? 'No payments pending verification' : `No ${activeTab.toLowerCase()} payments`}</span>
          </div>
        ) : (
          payments.map(p => {
            const isExpanded = expandedId === p.id;
            const vStatus = p.verification_status || 'Pending';
            const cfg = STATUS_CONFIG[vStatus];
            const Icon = cfg.icon;
            const isPending = vStatus === 'Pending';

            return (
              <div key={p.id} className={`pv-card ${isExpanded ? 'pv-card--expanded' : ''}`}>
                <div className="pv-card-main" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                  {/* Left: method icon */}
                  <div className="pv-card-method">
                    <span className="pv-method-emoji">{METHOD_ICONS[p.payment_method] || '💰'}</span>
                    <span className="pv-method-label">{p.payment_method}</span>
                  </div>

                  {/* Center: details */}
                  <div className="pv-card-details">
                    <div className="pv-card-name">{p.customer_name}</div>
                    <div className="pv-card-meta">
                      <span><Calendar size={12} /> {formatDate(p.payment_date)}</span>
                      {p.reference_number && <span><Hash size={12} /> {p.reference_number}</span>}
                      {p.customer_mobile && <span><User size={12} /> {p.customer_mobile}</span>}
                    </div>
                  </div>

                  {/* Right: amount + status */}
                  <div className="pv-card-right">
                    <div className="pv-card-amount">₹{fmt(p.advance_paid)}</div>
                    <div className="pv-card-status" style={{ color: cfg.color, background: cfg.bg }}>
                      <Icon size={13} /> {cfg.label}
                    </div>
                  </div>

                  <div className="pv-card-chevron">
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                {/* Expanded section */}
                {isExpanded && (
                  <div className="pv-card-expand">
                    <div className="pv-expand-grid">
                      <div className="pv-expand-item">
                        <span className="pv-expand-label">Bill Amount</span>
                        <span className="pv-expand-value">₹{fmt(p.total_amount)}</span>
                      </div>
                      <div className="pv-expand-item">
                        <span className="pv-expand-label">Paid</span>
                        <span className="pv-expand-value pv-text-success">₹{fmt(p.advance_paid)}</span>
                      </div>
                      <div className="pv-expand-item">
                        <span className="pv-expand-label">Balance</span>
                        <span className={`pv-expand-value ${Number(p.balance_amount) > 0 ? 'pv-text-error' : 'pv-text-success'}`}>₹{fmt(p.balance_amount)}</span>
                      </div>
                      {p.payment_method === 'Both' && (
                        <>
                          <div className="pv-expand-item">
                            <span className="pv-expand-label">Cash</span>
                            <span className="pv-expand-value">₹{fmt(p.cash_amount)}</span>
                          </div>
                          <div className="pv-expand-item">
                            <span className="pv-expand-label">UPI</span>
                            <span className="pv-expand-value">₹{fmt(p.upi_amount)}</span>
                          </div>
                        </>
                      )}
                      <div className="pv-expand-item">
                        <span className="pv-expand-label">Reference</span>
                        <span className="pv-expand-value">{p.reference_number || '—'}</span>
                      </div>
                      {p.description && (
                        <div className="pv-expand-item pv-expand-item--full">
                          <span className="pv-expand-label">Description</span>
                          <span className="pv-expand-value">{p.description}</span>
                        </div>
                      )}
                      {p.verification_note && (
                        <div className="pv-expand-item pv-expand-item--full">
                          <span className="pv-expand-label">Verification Note</span>
                          <span className="pv-expand-value">{p.verification_note}</span>
                        </div>
                      )}
                    </div>

                    {/* Action area */}
                    {isPending && (
                      <div className="pv-actions">
                        <div className="pv-note-row">
                          <input
                            className="pv-note-input"
                            placeholder="Add a note (optional)..."
                            value={expandedId === p.id ? noteText : ''}
                            onChange={e => setNoteText(e.target.value)}
                          />
                        </div>
                        <div className="pv-action-buttons">
                          <button
                            className="pv-btn pv-btn--verify"
                            disabled={verifying === p.id}
                            onClick={(e) => { e.stopPropagation(); handleVerify(p.id, 'Verified'); }}
                          >
                            <ShieldCheck size={15} />
                            {verifying === p.id ? 'Processing...' : 'Verified in Statement'}
                          </button>
                          <button
                            className="pv-btn pv-btn--missing"
                            disabled={verifying === p.id}
                            onClick={(e) => { e.stopPropagation(); handleVerify(p.id, 'Not in Statement'); }}
                          >
                            <FileX size={15} />
                            Not in Statement
                          </button>
                          <button
                            className="pv-btn pv-btn--reject"
                            disabled={verifying === p.id}
                            onClick={(e) => { e.stopPropagation(); handleVerify(p.id, 'Rejected'); }}
                          >
                            <ShieldX size={15} />
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {!isPending && (
                      <div className="pv-actions">
                        <div className="pv-verified-info">
                          <Icon size={15} style={{ color: cfg.color }} />
                          <span>Marked as <strong>{vStatus}</strong>{p.verified_at ? ` on ${formatDate(p.verified_at)}` : ''}</span>
                        </div>
                        <button
                          className="pv-btn pv-btn--undo"
                          disabled={verifying === p.id}
                          onClick={(e) => { e.stopPropagation(); handleVerify(p.id, 'Pending'); }}
                          style={{ display: 'none' }}
                        >
                          Undo
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </div>
  );
};

export default PaymentVerification;

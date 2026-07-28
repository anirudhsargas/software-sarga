import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import auth from '../services/auth';
import { ArrowLeft, FileText, IndianRupee, Zap, Wifi, Phone, Droplets, Hash, Calendar, List, Plus } from 'lucide-react';
import { serverToday } from '../services/serverTime';
import toast from 'react-hot-toast';
import './ConnectionLedger.css';
import EmptyState from '../components/EmptyState';
import Loading from '../components/ui/Loading';

const UTILITY_CONFIG = {
  'Electricity': { icon: Zap, color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)' },
  'Internet / Broadband': { icon: Wifi, color: 'var(--info)', bg: 'rgba(59, 130, 246, 0.1)' },
  'Phone': { icon: Phone, color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)' },
  'Water': { icon: Droplets, color: 'var(--info)', bg: 'rgba(59, 130, 246, 0.1)' },
};

const DEFAULT_CONFIG = { icon: Zap, color: 'var(--primary)', bg: 'color-mix(in srgb, var(--primary) 10%, transparent)' };

const ConnectionLedger = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const today = serverToday();
  const firstOfMonth = today.slice(0, 8) + '01';

  const [connection, setConnection] = useState(null);
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  const fetchBills = async (from, to) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (from) params.append('start_date', from);
      if (to) params.append('end_date', to);
      const res = await api.get(`/utility-bills/by-connection/${id}?${params.toString()}`);
      const payload = res.data;
      const data = payload.data || payload;
      setBills(data.rows || []);
      setSummary(data.summary);
      setConnection(data.connection);
    } catch (err) {
      toast.error('Failed to load connection bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills(fromDate, toDate);
  }, [id]);

  const handleApplyFilter = () => {
    fetchBills(fromDate, toDate);
  };

  const cfg = connection ? (UTILITY_CONFIG[connection.utility_type] || DEFAULT_CONFIG) : DEFAULT_CONFIG;
  const Icon = cfg.icon;

  const totalBilled = bills.reduce((s, r) => s + Number(r.amount || 0), 0);

  const SkeletonRows = () => (
    <div className="cl-skeleton">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="cl-skeleton-row">
          <div className="cl-skeleton-cell" style={{ width: '18%' }} />
          <div className="cl-skeleton-cell" style={{ width: '22%' }} />
          <div className="cl-skeleton-cell" style={{ width: '38%' }} />
          <div className="cl-skeleton-cell" style={{ width: '12%' }} />
          {isAdmin && <div className="cl-skeleton-cell" style={{ width: '10%' }} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="cl-page">
      <div className="cl-header">
        <div className="cl-header-left">
          <button className="cl-back-btn" onClick={() => navigate('/dashboard/expenses?tab=utilities')}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1>Connection Ledger</h1>
        </div>
      </div>

      {connection && (
        <div className="cl-hero">
          <div className="cl-hero-icon" style={{ background: cfg.bg, color: cfg.color }}>
            <Icon size={26} />
          </div>
          <div className="cl-hero-info">
            <span className="cl-hero-name">{connection.label || connection.connection_id}</span>
            <div className="cl-hero-tags">
              <span className="cl-tag" style={{ background: cfg.bg, color: cfg.color }}>{connection.utility_type}</span>
              {connection.provider && <span className="cl-tag">{connection.provider}</span>}
              <span className="cl-connection-id">{connection.connection_id}</span>
              {connection.is_active ? (
                <span className="cl-tag cl-tag--active">Active</span>
              ) : (
                <span className="cl-tag cl-tag--inactive">Inactive</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="cl-stats">
        <div className="cl-stat">
          <div className="cl-stat-top">
            <span className="cl-stat-label">Total Billed</span>
            <div className="cl-stat-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
              <IndianRupee size={16} />
            </div>
          </div>
          <div className="cl-stat-value">₹{Number(totalBilled).toLocaleString('en-IN')}</div>
          <div className="cl-stat-sub">{bills.length} bill{bills.length !== 1 ? 's' : ''} in period</div>
        </div>
        <div className="cl-stat">
          <div className="cl-stat-top">
            <span className="cl-stat-label">Connection ID</span>
            <div className="cl-stat-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
              <Hash size={14} />
            </div>
          </div>
          <div className="cl-stat-value" style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)' }}>
            {connection?.connection_id || '—'}
          </div>
        </div>
        <div className="cl-stat">
          <div className="cl-stat-top">
            <span className="cl-stat-label">Billing Cycle</span>
            <div className="cl-stat-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
              <Calendar size={14} />
            </div>
          </div>
          <div className="cl-stat-value" style={{ fontSize: 'var(--text-base)', textTransform: 'capitalize' }}>
            {connection?.billing_cycle || 'Monthly'}
          </div>
        </div>
        <div className="cl-stat">
          <div className="cl-stat-top">
            <span className="cl-stat-label">Bill Count</span>
            <div className="cl-stat-icon" style={{ background: cfg.bg, color: cfg.color }}>
              <List size={14} />
            </div>
          </div>
          <div className="cl-stat-value">{bills.length}</div>
        </div>
      </div>

      <div className="cl-filter-bar">
        <div className="cl-filter-group">
          <div className="cl-filter-field">
            <label>From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="cl-filter-field">
            <label>To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleApplyFilter}>Apply</button>
        </div>
      </div>

      <div className="cl-toolbar">
        <span className="cl-toolbar-count">
          {loading ? 'Loading...' : <><strong>{bills.length}</strong> bill{bills.length !== 1 ? 's' : ''} found</>}
        </span>
        <button className="btn btn-primary" onClick={() => navigate(`/dashboard/expenses?tab=utilities&addBill=${id}`)}>
          <Plus size={16} /> Add Bill
        </button>
      </div>

      <div className="cl-table-wrap">
        <table className="cl-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Bill Number</th>
              <th>Description</th>
              <th className="cl-cell-amount">Amount</th>
              {isAdmin && <th style={{ width: 50 }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 5 : 4}>{SkeletonRows()}</td></tr>
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4}>
                  <EmptyState
                    icon={FileText}
                    title="No bills found"
                    description="Add a bill for this connection to get started."
                    actionLabel="Add Bill"
                    onAction={() => navigate(`/dashboard/expenses?tab=utilities&addBill=${id}`)}
                  />
                </td>
              </tr>
            ) : bills.map((row, idx) => (
              <tr key={idx}>
                <td className="cl-cell-date">{row.bill_date ? new Date(row.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                <td><span className="cl-bill-number">{row.bill_number || '—'}</span></td>
                <td>{row.description || '—'}</td>
                <td className="cl-cell-amount">₹{Number(row.amount || 0).toLocaleString('en-IN')}</td>
                {isAdmin && (
                  <td>
                    <button className="cl-delete-btn" title="Delete bill"
                      onClick={async () => {
                        if (!window.confirm('Delete this bill?')) return;
                        try {
                          await api.delete(`/utility-bills/${row.id}`);
                          toast.success('Bill deleted');
                          fetchBills(fromDate, toDate);
                        } catch (e) {
                          toast.error('Failed to delete bill');
                        }
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {bills.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="cl-cell-amount">₹{totalBilled.toLocaleString('en-IN')}</td>
                {isAdmin && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default ConnectionLedger;

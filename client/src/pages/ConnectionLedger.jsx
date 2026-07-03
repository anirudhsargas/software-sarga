import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import auth from '../services/auth';
import { ArrowLeft, FileText, IndianRupee, Zap, Wifi, Phone, Droplets, ShoppingCart } from 'lucide-react';
import { serverToday } from '../services/serverTime';
import toast from 'react-hot-toast';
import './VendorLedger.css';

const ICON_MAP = {
  'Electricity': Zap,
  'Internet / Broadband': Wifi,
  'Phone': Phone,
  'Water': Droplets,
};

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

  const Icon = connection ? (ICON_MAP[connection.utility_type] || Zap) : Zap;

  const totalBilled = bills.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="vl-page">
      <div className="vl-header">
        <button className="vl-back-btn" onClick={() => navigate('/dashboard/expenses?tab=utilities')}>
          <ArrowLeft size={18} /> Back to Utilities
        </button>
        <h1 className="vl-title">Connection Ledger</h1>
      </div>

      {connection && (
        <div className="vl-vendor-info">
          <Icon size={20} style={{ color: 'var(--warning)' }} />
          <span className="vl-vendor-name">{connection.label || connection.connection_id}</span>
          <span className="vl-type-badge">{connection.utility_type}</span>
          {connection.provider && <span className="vl-vendor-phone">{connection.provider}</span>}
          <span className="vl-vendor-phone">{connection.branch_name}</span>
          {!connection.is_active && (
            <span className="vl-type-badge" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)' }}>Inactive</span>
          )}
        </div>
      )}

      <div className="vl-cards">
        <div className="vl-card">
          <span className="vl-card-label">Total Billed</span>
          <span className="vl-card-value">₹{Number(totalBilled).toLocaleString('en-IN')}</span>
        </div>
        <div className="vl-card">
          <span className="vl-card-label">Connection ID</span>
          <span className="vl-card-value" style={{ fontSize: 16 }}>{connection?.connection_id || '—'}</span>
        </div>
        <div className="vl-card">
          <span className="vl-card-label">Billing Cycle</span>
          <span className="vl-card-value" style={{ fontSize: 16, textTransform: 'capitalize' }}>{connection?.billing_cycle || 'Monthly'}</span>
        </div>
        <div className="vl-card">
          <span className="vl-card-label">Bill Count</span>
          <span className="vl-card-value">{bills.length}</span>
        </div>
      </div>

      <div className="vl-filters">
        <label>From:
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="vl-date-input" />
        </label>
        <label>To:
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="vl-date-input" />
        </label>
        <button className="btn btn-primary btn-sm" onClick={handleApplyFilter}>Apply</button>
      </div>

      <div className="vl-table-wrap">
        <table className="vl-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Bill Number</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              {isAdmin && <th style={{ width: 50 }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Loading...</td></tr>
            ) : bills.length === 0 ? (
              <tr><td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>No bills found for this connection</td></tr>
            ) : bills.map((row, idx) => (
              <tr key={idx} className="vl-row vl-row--bill">
                <td>{row.bill_date ? new Date(row.bill_date).toLocaleDateString('en-IN') : '-'}</td>
                <td>{row.bill_number || '—'}</td>
                <td>{row.description || row.connection_id || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{Number(row.amount || 0).toLocaleString('en-IN')}</td>
                {isAdmin && (
                  <td>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Delete"
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
              <tr className="vl-row--total">
                <td colSpan={3}><strong>Total</strong></td>
                <td style={{ textAlign: 'right' }}><strong>₹{totalBilled.toLocaleString('en-IN')}</strong></td>
                {isAdmin && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="vl-actions">
        <button className="btn btn-primary" onClick={() => {
          navigate(`/dashboard/expenses?tab=utilities&addBill=${id}`);
        }}>
          <ShoppingCart size={16} /> Add Bill
        </button>
      </div>
    </div>
  );
};

export default ConnectionLedger;

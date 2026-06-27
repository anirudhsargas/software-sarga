import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import './VendorPayables.css';

const VendorPayables = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/vendors/payables/summary');
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load payables summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const rows = data?.vendors || [];
  const summary = data?.summary || {};

  const getRowClass = (v) => {
    if (Number(v.overdue_60_plus) > 0) return 'vp-row--dark-red';
    if (Number(v.overdue_31_60) > 0) return 'vp-row--red';
    if (Number(v.overdue_0_30) > 0) return 'vp-row--orange';
    return '';
  };

  return (
    <div className="vp-page">
      <div className="vp-header">
        <h1 className="vp-title">Vendor Payables Dashboard</h1>
        <button className="btn btn-ghost btn-sm" onClick={fetchData} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="vp-summary-cards">
        <div className="vp-summary-card">
          <span className="vp-summary-label">Total Payable</span>
          <span className="vp-summary-value">₹{Number(summary.total_payable || 0).toLocaleString('en-IN')}</span>
        </div>
        <div className="vp-summary-card">
          <span className="vp-summary-label">Overdue Amount</span>
          <span className="vp-summary-value vp-overdue">₹{Number(summary.total_overdue || 0).toLocaleString('en-IN')}</span>
        </div>
        <div className="vp-summary-card">
          <span className="vp-summary-label">Over Limit</span>
          <span className="vp-summary-value">{summary.vendors_over_limit || 0} vendors</span>
        </div>
        <div className="vp-summary-card">
          <span className="vp-summary-label">Active Vendors</span>
          <span className="vp-summary-value">{summary.vendors_count || 0}</span>
        </div>
      </div>

      <div className="vp-table-wrap">
        <table className="vp-table">
          <thead>
            <tr>
              <th>Vendor Name</th>
              <th>Balance</th>
              <th>Current</th>
              <th>0-30d</th>
              <th>31-60d</th>
              <th>60d+</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>No vendors with outstanding balances</td></tr>
            ) : rows.map(v => (
              <tr key={v.id} className={getRowClass(v)}>
                <td>
                  <span className="vp-vendor-link" onClick={() => navigate(`/vendors/${v.id}/ledger`)}>
                    {v.name}
                    {Number(v.credit_limit) > 0 && Number(v.current_balance) > Number(v.credit_limit) && (
                      <span className="vp-over-limit-badge">Over limit</span>
                    )}
                  </span>
                </td>
                <td style={{ fontWeight: 700 }}>₹{Number(v.current_balance).toLocaleString('en-IN')}</td>
                <td>₹{Number(v.current_due).toLocaleString('en-IN')}</td>
                <td>₹{Number(v.overdue_0_30).toLocaleString('en-IN')}</td>
                <td>₹{Number(v.overdue_31_60).toLocaleString('en-IN')}</td>
                <td>₹{Number(v.overdue_60_plus).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="vp-legend">
        <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--current"></span> Current</span>
        <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--orange"></span> Overdue &lt;30d</span>
        <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--red"></span> 31-60d</span>
        <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--dark-red"></span> 60d+</span>
      </div>
    </div>
  );
};

export default VendorPayables;

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import auth from '../services/auth';
import { ArrowLeft, FileText, CreditCard, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { serverToday } from '../services/serverTime';
import toast from 'react-hot-toast';
import Loading from '../components/ui/Loading';
import './VendorLedger.css';

const VendorLedger = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const today = serverToday();
  const firstOfMonth = today.slice(0, 8) + '01';

  const [vendor, setVendor] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [summary, setSummary] = useState(null);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [creditStatus, setCreditStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);

  const fetchLedger = async (from, to) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      const ledgerRes = await api.get(`/vendors/${id}/ledger?${params.toString()}`);
      const data = ledgerRes.data;
      setVendor(data.vendor);
      setLedger(data.ledger);
      setSummary(data.summary);
      setOpeningBalance(data.opening_balance);
    } catch (err) {
      toast.error('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };

  const fetchCreditStatus = async () => {
    try {
      const res = await api.get(`/vendors/${id}/credit-status`);
      setCreditStatus(res.data);
    } catch (_) { }
  };

  useEffect(() => {
    fetchLedger(fromDate, toDate);
    fetchCreditStatus();
  }, [id]);

  const handleApplyFilter = () => {
    fetchLedger(fromDate, toDate);
  };

  const handleAddBill = () => {
    navigate(`/dashboard/expenses/upload-bills?vendor_id=${id}&vendor_name=${encodeURIComponent(vendor?.name || '')}&redirect=/dashboard/vendors/${id}/ledger`);
  };

  const handleRecordPayment = () => {
    toast('Payment modal would open here');
  };

  const util = creditStatus
    ? Math.min(creditStatus.utilization_percent, 100)
    : 0;
  const utilBarColor =
    creditStatus?.status === 'exceeded' ? 'var(--error)' :
    creditStatus?.status === 'warning' ? 'var(--warning)' :
    'var(--success)';

  const totalDebit = ledger.reduce((s, r) => s + r.debit, 0);
  const totalCredit = ledger.reduce((s, r) => s + r.credit, 0);
  const lastBalance = ledger.length > 0 ? ledger[ledger.length - 1].balance : openingBalance;

  if (loading && !vendor) {
    return (
      <div className="vl-page">
        <div className="vl-header">
          <button className="vl-back-btn" onClick={() => navigate('/dashboard/vendors?view=list')}>
            <ArrowLeft size={18} /> Back to Vendors
          </button>
          <h1 className="vl-title">Vendor Ledger</h1>
        </div>
        <Loading type="ledger" count={8} />
      </div>
    );
  }

  return (
    <div className="vl-page">
      <div className="vl-header">
        <button className="vl-back-btn" onClick={() => navigate('/dashboard/vendors?view=list')}>
          <ArrowLeft size={18} /> Back to Vendors
        </button>
        <h1 className="vl-title">Vendor Ledger</h1>
      </div>

      {vendor && (
        <div className="vl-vendor-info">
          <span className="vl-vendor-name">{vendor.name}</span>
          {vendor.vendor_type && <span className="vl-type-badge">{vendor.vendor_type}</span>}
          {vendor.phone && <span className="vl-vendor-phone">{vendor.phone}</span>}
        </div>
      )}

      <div className="vl-cards">
        <div className="vl-card">
          <span className="vl-card-label">Outstanding</span>
          <span className="vl-card-value">₹{Number(summary?.current_balance || 0).toLocaleString('en-IN')}</span>
        </div>
        <div className="vl-card">
          <span className="vl-card-label">Credit Limit</span>
          <span className="vl-card-value">₹{Number(vendor?.credit_limit || 0).toLocaleString('en-IN')}</span>
          {creditStatus && (
            <div className="vl-util-bar-wrap">
              <div className="vl-util-bar">
                <div className="vl-util-fill" style={{ width: `${util}%`, background: utilBarColor }}></div>
              </div>
              <span className="vl-util-pct" style={{ color: utilBarColor }}>
                {creditStatus.utilization_percent.toFixed(0)}%
              </span>
            </div>
          )}
        </div>
        <div className="vl-card">
          <span className="vl-card-label">Overdue</span>
          <span className="vl-card-value vl-overdue">₹{Number(summary?.overdue_amount || 0).toLocaleString('en-IN')}</span>
        </div>
        <div className="vl-card">
          <span className="vl-card-label">Opening Balance</span>
          <span className="vl-card-value">₹{Number(openingBalance).toLocaleString('en-IN')}</span>
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
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Debit</th>
              <th style={{ textAlign: 'right' }}>Credit</th>
              <th style={{ textAlign: 'right' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, ci) => (
                    <td key={ci} style={{ padding: '12px 14px' }}>
                      <div className="loading-shimmer" style={{ height: 14, width: ci === 1 ? '80%' : '60%', margin: '0 auto' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : ledger.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>No transactions found</td></tr>
            ) : ledger.map((row, idx) => {
              const isOverdue = row.type === 'bill' && row.due_date && new Date(row.due_date) < new Date() && row.payment_status !== 'paid';
              return (
                <tr
                  key={idx}
                  className={`vl-row ${row.type === 'bill' ? 'vl-row--bill' : 'vl-row--payment'} ${isOverdue ? 'vl-row--overdue' : ''}`}
                >
                  <td>{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '-'}</td>
                  <td>{row.description}</td>
                  <td style={{ textAlign: 'right' }}>{row.debit > 0 ? `₹${row.debit.toLocaleString('en-IN')}` : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{row.credit > 0 ? `₹${row.credit.toLocaleString('en-IN')}` : '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{row.balance.toLocaleString('en-IN')}</td>
                </tr>
              );
            })}
          </tbody>
          {ledger.length > 0 && (
            <tfoot>
              <tr className="vl-row--total">
                <td colSpan={2}><strong>Totals</strong></td>
                <td style={{ textAlign: 'right' }}><strong>₹{totalDebit.toLocaleString('en-IN')}</strong></td>
                <td style={{ textAlign: 'right' }}><strong>₹{totalCredit.toLocaleString('en-IN')}</strong></td>
                <td style={{ textAlign: 'right' }}><strong>₹{lastBalance.toLocaleString('en-IN')}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="vl-actions">
        <button className="btn btn-primary" onClick={handleAddBill}>
          <FileText size={16} /> Add Bill
        </button>
        <button className="btn btn-secondary" onClick={handleRecordPayment}>
          <CreditCard size={16} /> Record Payment
        </button>
      </div>

      {creditStatus?.overdue_bills?.length > 0 && (
        <div className="vl-overdue-banner">
          <AlertTriangle size={16} />
          {creditStatus.overdue_bills.length} overdue bill(s) — {creditStatus.overdue_bills.reduce((s, b) => s + Number(b.amount), 0).toLocaleString('en-IN')} total
        </div>
      )}
    </div>
  );
};

export default VendorLedger;

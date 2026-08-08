import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import auth from '../services/auth';
import { 
  ArrowLeft, FileText, CreditCard, AlertTriangle, Phone, Mail, 
  Tag, TrendingDown, Calendar, Filter, CheckCircle2
} from 'lucide-react';
import { serverToday } from '../services/serverTime';
import toast from 'react-hot-toast';
import Loading from '../components/ui/Loading';
import PageContainer from '../components/ui/PageContainer';
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
  const [preset, setPreset] = useState('month');

  const fetchLedger = useCallback(async (from, to) => {
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
  }, [id]);

  const fetchCreditStatus = useCallback(async () => {
    try {
      const res = await api.get(`/vendors/${id}/credit-status`);
      setCreditStatus(res.data);
    } catch (_) { }
  }, [id]);

  useEffect(() => {
    fetchLedger(fromDate, toDate);
    fetchCreditStatus();
  }, [id, fetchLedger, fetchCreditStatus]);

  const handleApplyFilter = () => {
    fetchLedger(fromDate, toDate);
  };

  const applyPreset = (type) => {
    setPreset(type);
    let from = '';
    let to = today;

    if (type === 'month') {
      from = firstOfMonth;
    } else if (type === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      from = d.toISOString().slice(0, 10);
    } else if (type === 'year') {
      from = `${new Date().getFullYear()}-01-01`;
    } else if (type === 'all') {
      from = '';
      to = '';
    }

    setFromDate(from);
    setToDate(to);
    fetchLedger(from, to);
  };

  const handleAddBill = () => {
    navigate(`/dashboard/expenses/upload-bills?vendor_id=${id}&vendor_name=${encodeURIComponent(vendor?.name || '')}&redirect=/dashboard/vendors/${id}/ledger`);
  };

  const handleRecordPayment = () => {
    navigate(`/dashboard/expenses?tab=utilities`);
  };

  const util = creditStatus
    ? Math.min(creditStatus.utilization_percent, 100)
    : 0;
  const utilBarColor =
    creditStatus?.status === 'exceeded' ? 'var(--error)' :
    creditStatus?.status === 'warning' ? 'var(--warning)' :
    'var(--success)';

  const totalDebit = ledger.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const totalCredit = ledger.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const lastBalance = ledger.length > 0 ? ledger[ledger.length - 1].balance : openingBalance;

  if (loading && !vendor) {
    return (
      <PageContainer>
        <div className="vl-page">
          <div className="vl-header-hero">
            <button className="vl-back-btn" onClick={() => navigate('/dashboard/vendors?view=list')}>
              <ArrowLeft size={16} /> Back to Vendors
            </button>
            <h1 className="vl-title">Vendor Ledger</h1>
          </div>
          <Loading type="ledger" count={8} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="vl-page">
        {/* Header Profile Hero */}
        <div className="vl-header-hero">
          <div className="vl-header-left">
            <button className="vl-back-btn" onClick={() => navigate('/dashboard/vendors?view=list')}>
              <ArrowLeft size={16} /> Back to Vendors
            </button>
            
            <div className="vl-vendor-profile">
              <div className="vl-avatar">
                {vendor?.name ? vendor.name.charAt(0).toUpperCase() : 'V'}
              </div>
              <div className="vl-vendor-details">
                <div className="vl-vendor-title-row">
                  <h1 className="vl-vendor-name">{vendor?.name || 'Vendor Ledger'}</h1>
                  {vendor?.vendor_type && <span className="vl-type-badge">{vendor.vendor_type}</span>}
                </div>
                <div className="vl-vendor-meta">
                  {vendor?.phone && (
                    <span className="vl-meta-item"><Phone size={13} /> {vendor.phone}</span>
                  )}
                  {vendor?.email && (
                    <span className="vl-meta-item"><Mail size={13} /> {vendor.email}</span>
                  )}
                  {vendor?.gst && (
                    <span className="vl-meta-item"><Tag size={13} /> GST: {vendor.gst}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="vl-header-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleAddBill}>
              <FileText size={15} /> Add Bill
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleRecordPayment}>
              <CreditCard size={15} /> Pay Vendor
            </button>
          </div>
        </div>

        {/* Overdue Warning Banner */}
        {creditStatus?.overdue_bills?.length > 0 && (
          <div className="vl-overdue-banner">
            <AlertTriangle size={18} />
            <div>
              <strong>{creditStatus.overdue_bills.length} Overdue Bill(s)</strong>
              <span> — ₹{creditStatus.overdue_bills.reduce((s, b) => s + Number(b.amount), 0).toLocaleString('en-IN')} total overdue</span>
            </div>
          </div>
        )}

        {/* KPI Cards Grid */}
        <div className="vl-cards">
          <div className="vl-card vl-card--outstanding">
            <div className="vl-card-header">
              <span className="vl-card-label">Outstanding Balance</span>
              <div className="vl-card-icon"><TrendingDown size={18} /></div>
            </div>
            <span className="vl-card-value">₹{Number(summary?.current_balance || 0).toLocaleString('en-IN')}</span>
            <span className="vl-card-sub">Total amount payable</span>
          </div>

          <div className="vl-card vl-card--credit">
            <div className="vl-card-header">
              <span className="vl-card-label">Credit Limit</span>
              <div className="vl-card-icon"><CreditCard size={18} /></div>
            </div>
            <span className="vl-card-value">₹{Number(vendor?.credit_limit || 0).toLocaleString('en-IN')}</span>
            {creditStatus && (
              <div className="vl-util-bar-wrap">
                <div className="vl-util-bar">
                  <div className="vl-util-fill" style={{ width: `${util}%`, background: utilBarColor }} />
                </div>
                <span className="vl-util-pct" style={{ color: utilBarColor }}>
                  {creditStatus.utilization_percent.toFixed(0)}% Used
                </span>
              </div>
            )}
          </div>

          <div className="vl-card vl-card--overdue">
            <div className="vl-card-header">
              <span className="vl-card-label">Overdue Amount</span>
              <div className="vl-card-icon"><AlertTriangle size={18} /></div>
            </div>
            <span className="vl-card-value vl-overdue">₹{Number(summary?.overdue_amount || 0).toLocaleString('en-IN')}</span>
            <span className={`vl-card-sub ${summary?.overdue_amount > 0 ? 'vl-card-sub--danger' : 'vl-card-sub--ok'}`}>
              {summary?.overdue_amount > 0 ? 'Action required' : 'No overdue bills'}
            </span>
          </div>

          <div className="vl-card vl-card--opening">
            <div className="vl-card-header">
              <span className="vl-card-label">Opening Balance</span>
              <div className="vl-card-icon"><Calendar size={18} /></div>
            </div>
            <span className="vl-card-value">₹{Number(openingBalance || 0).toLocaleString('en-IN')}</span>
            <span className="vl-card-sub">At period start</span>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="vl-filter-bar">
          <div className="vl-presets">
            <button className={`vl-preset-btn ${preset === 'month' ? 'active' : ''}`} onClick={() => applyPreset('month')}>This Month</button>
            <button className={`vl-preset-btn ${preset === '30days' ? 'active' : ''}`} onClick={() => applyPreset('30days')}>Last 30 Days</button>
            <button className={`vl-preset-btn ${preset === 'year' ? 'active' : ''}`} onClick={() => applyPreset('year')}>This Year</button>
            <button className={`vl-preset-btn ${preset === 'all' ? 'active' : ''}`} onClick={() => applyPreset('all')}>All Time</button>
          </div>

          <div className="vl-custom-dates">
            <div className="vl-date-field">
              <label htmlFor="vl-from-date">From:</label>
              <input id="vl-from-date" type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPreset('custom'); }} className="vl-date-input" />
            </div>
            <div className="vl-date-field">
              <label htmlFor="vl-to-date">To:</label>
              <input id="vl-to-date" type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPreset('custom'); }} className="vl-date-input" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleApplyFilter}>
              <Filter size={13} /> Apply
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="vl-table-wrap">
          <table className="vl-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Debit (Billed)</th>
                <th style={{ textAlign: 'right' }}>Credit (Paid)</th>
                <th style={{ textAlign: 'right' }}>Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, ci) => (
                      <td key={ci} style={{ padding: '14px' }}>
                        <div className="loading-shimmer" style={{ height: 14, width: ci === 2 ? '80%' : '60%', margin: '0 auto' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <FileText size={32} style={{ opacity: 0.4 }} />
                      <p style={{ margin: 0, fontWeight: 500 }}>No transactions found for selected period</p>
                      <span style={{ fontSize: 12 }}>Try selecting "All Time" or adjusting your date filter above.</span>
                    </div>
                  </td>
                </tr>
              ) : ledger.map((row, idx) => {
                const isOverdue = row.type === 'bill' && row.due_date && new Date(row.due_date) < new Date() && row.payment_status !== 'paid';
                const isBill = row.type === 'bill';
                return (
                  <tr
                    key={idx}
                    className={`vl-row ${isBill ? 'vl-row--bill' : 'vl-row--payment'} ${isOverdue ? 'vl-row--overdue' : ''}`}
                  >
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {row.date ? new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td>
                      <span className={`vl-row-badge ${isBill ? 'vl-row-badge--bill' : 'vl-row-badge--payment'}`}>
                        {isBill ? <FileText size={11} /> : <CheckCircle2 size={11} />}
                        {isBill ? 'Bill' : 'Payment'}
                      </span>
                    </td>
                    <td>
                      <div className="vl-desc-cell">
                        <span className="vl-desc-text">{row.description}</span>
                        {isOverdue && <span className="vl-overdue-tag">Overdue</span>}
                      </div>
                    </td>
                    <td className="vl-amount-debit" style={{ textAlign: 'right' }}>
                      {row.debit > 0 ? `₹${row.debit.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="vl-amount-credit" style={{ textAlign: 'right' }}>
                      {row.credit > 0 ? `₹${row.credit.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="vl-amount-balance" style={{ textAlign: 'right' }}>
                      ₹{row.balance.toLocaleString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {ledger.length > 0 && (
              <tfoot>
                <tr className="vl-row--total">
                  <td colSpan={3}><strong>Totals</strong></td>
                  <td className="vl-amount-debit" style={{ textAlign: 'right' }}><strong>₹{totalDebit.toLocaleString('en-IN')}</strong></td>
                  <td className="vl-amount-credit" style={{ textAlign: 'right' }}><strong>₹{totalCredit.toLocaleString('en-IN')}</strong></td>
                  <td className="vl-amount-balance" style={{ textAlign: 'right' }}><strong>₹{lastBalance.toLocaleString('en-IN')}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </PageContainer>
  );
};

export default VendorLedger;

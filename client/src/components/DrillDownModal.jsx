import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, AlertTriangle, ChevronDown, ChevronUp, Banknote, Smartphone, FileText } from 'lucide-react';
import api from '../services/api';
import { formatCurrency } from '../constants';
import './DrillDownModal.css';

const METRIC_LABELS = {
  todays_collection: "Today's Collection",
  pending_amount: 'Pending Amount',
  todays_jobs: "Today's Jobs",
};

const METRIC_COLUMNS = {
  todays_collection: ['customer_name', 'job_number', 'amount', 'payment_mode'],
  pending_amount: ['customer_name', 'job_number', 'balance_amount', 'status'],
  todays_jobs: ['customer_name', 'job_number', 'total_amount', 'status'],
};

const PAYMENT_MODE_ICONS = {
  Cash: <Banknote size={14} />,
  UPI: <Smartphone size={14} />,
  Cheque: <FileText size={14} />,
  'Account Transfer': <FileText size={14} />,
};

const fmt = (v) => (typeof v === 'number' ? formatCurrency(v, true) : v || '—');
const formatDate = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const SkeletonRow = () => (
  <div className="drilldown-row drilldown-row--skeleton">
    <div className="skeleton-box" style={{ height: 14, width: '30%' }} />
    <div className="skeleton-box" style={{ height: 14, width: '20%' }} />
    <div className="skeleton-box" style={{ height: 14, width: '15%' }} />
    <div className="skeleton-box" style={{ height: 14, width: '12%' }} />
  </div>
);

const AmountDetailRow = ({ record, metric, onClose }) => {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const handleCustomerClick = (e) => {
    e.stopPropagation();
    if (record.customer_id && record.customer_id > 0) {
      onClose();
      navigate(`/dashboard/sales/customers/${record.customer_id}`);
    }
  };

  const handleJobClick = (e) => {
    e.stopPropagation();
    if (record.job_id && record.job_id > 0) {
      onClose();
      navigate(`/dashboard/sales/orders/${record.job_id}`);
    }
  };

  const amount = metric === 'todays_collection' ? record.amount
    : metric === 'pending_amount' ? record.balance_amount
    : record.total_amount;

  return (
    <>
      <div className="drilldown-row" onClick={() => setExpanded(v => !v)}>
        <span className="drilldown-cell drilldown-cell--customer" onClick={handleCustomerClick} title="View customer">
          {record.customer_name || '—'}
        </span>
        <span className="drilldown-cell drilldown-cell--job" onClick={handleJobClick} title="View job">
          {record.job_number || record.job_name || '—'}
        </span>
        <span className="drilldown-cell drilldown-cell--amount">
          {fmt(amount)}
          {metric === 'todays_collection' || metric === 'pending_amount' ? (
            <button className="drilldown-expand-btn" onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          ) : null}
        </span>
        <span className="drilldown-cell drilldown-cell--mode">
          {metric === 'todays_collection' ? (
            <span className="drilldown-payment-mode">
              {PAYMENT_MODE_ICONS[record.payment_mode] || null}
              {record.payment_mode || '—'}
            </span>
          ) : (
            <span className={`drilldown-status-badge drilldown-status-badge--${(record.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
              {record.status || '—'}
            </span>
          )}
        </span>
      </div>
      {expanded && (metric === 'todays_collection' || metric === 'pending_amount') && (
        <div className="drilldown-expanded">
          <div className="drilldown-expanded__grid">
            {metric === 'todays_collection' && (
              <>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">Cash</span>
                  <span className="drilldown-expanded__value">{fmt(record.cash_amount)}</span>
                </div>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">UPI</span>
                  <span className="drilldown-expanded__value">{fmt(record.upi_amount)}</span>
                </div>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">Discount</span>
                  <span className="drilldown-expanded__value drilldown-expanded__value--discount">{fmt(record.discount)}</span>
                </div>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">Time</span>
                  <span className="drilldown-expanded__value drilldown-expanded__value--time">{formatDate(record.created_at)}</span>
                </div>
              </>
            )}
            {metric === 'pending_amount' && (
              <>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">Total Amount</span>
                  <span className="drilldown-expanded__value">{fmt(record.total_amount)}</span>
                </div>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">Paid</span>
                  <span className="drilldown-expanded__value">{fmt(record.advance_paid)}</span>
                </div>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">Balance</span>
                  <span className="drilldown-expanded__value drilldown-expanded__value--balance">{fmt(record.balance_amount)}</span>
                </div>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">Status</span>
                  <span className="drilldown-expanded__value">{record.status}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const DrillDownModal = ({ metric, date, branchId, isOpen, onClose }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecords = useCallback(async () => {
    if (!metric || !isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ metric });
      if (date) params.append('date', date);
      if (branchId) params.append('branch_id', branchId);
      const res = await api.get(`/stats/dashboard/drilldown?${params}`, { timeout: 15000 });
      setRecords(res?.data || []);
    } catch (err) {
      console.error('Drilldown fetch error:', err);
      setError(err?.response?.data?.message || err.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [metric, date, branchId, isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchRecords();
    }
  }, [isOpen, fetchRecords]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const title = METRIC_LABELS[metric] || metric;
  const columns = METRIC_COLUMNS[metric] || ['customer_name', 'job_number', 'amount', 'payment_mode'];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal--xlarge drilldown-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close modal-close--static" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body drilldown-modal__body">
          {loading && (
            <div className="drilldown-loading">
              <div className="drilldown-table-header">
                <span>Customer</span>
                <span>Work</span>
                <span>Amount</span>
                <span>Status</span>
              </div>
              {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          )}

          {error && (
            <div className="drilldown-error">
              <AlertTriangle size={24} />
              <p>{error}</p>
              <button className="btn btn-sm btn-primary" onClick={fetchRecords}>Retry</button>
            </div>
          )}

          {!loading && !error && records.length === 0 && (
            <div className="drilldown-empty">
              <p>No records found for this period.</p>
            </div>
          )}

          {!loading && !error && records.length > 0 && (
            <div className="drilldown-table">
              <div className="drilldown-table-header">
                <span>Customer</span>
                <span>Work</span>
                <span>Amount</span>
                <span>{metric === 'todays_collection' ? 'Mode' : 'Status'}</span>
              </div>
              <div className="drilldown-table-body">
                {records.map((record, idx) => (
                  <AmountDetailRow key={record.payment_id || record.job_id || idx} record={record} metric={metric} onClose={onClose} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DrillDownModal;

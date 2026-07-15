import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, AlertTriangle, ChevronDown, ChevronUp, Banknote, Smartphone, FileText, Calendar, Clock } from 'lucide-react';
import api from '../services/api';
import { formatCurrency } from '../constants';
import './DrillDownModal.css';

const METRIC_CONFIG = {
  todays_collection: {
    label: "Today's Collection",
    cols: ['Customer', 'Work', 'Amount', 'Mode'],
    cellKey: ['customer_name', 'job_number', 'amount', 'payment_mode'],
    hasAmountExpand: true,
  },
  pending_amount: {
    label: 'Pending Amount',
    cols: ['Customer', 'Work', 'Amount', 'Status'],
    cellKey: ['customer_name', 'job_number', 'balance_amount', 'status'],
    hasAmountExpand: true,
  },
  todays_jobs: {
    label: "Today's Jobs",
    cols: ['Customer', 'Work', 'Amount', 'Status'],
    cellKey: ['customer_name', 'job_number', 'total_amount', 'status'],
    hasAmountExpand: false,
  },
  todays_expenses: {
    label: "Today's Expenses",
    cols: ['Payee', 'Type', 'Amount', 'Method'],
    cellKey: ['payee_name', 'type', 'amount', 'payment_method'],
    hasAmountExpand: true,
  },
  in_progress_jobs: {
    label: 'In Progress Jobs',
    cols: ['Customer', 'Work', 'Amount', 'Status'],
    cellKey: ['customer_name', 'job_number', 'total_amount', 'status'],
    hasAmountExpand: false,
  },
  low_stock_items: {
    label: 'Low Stock Items',
    cols: ['Item', 'SKU', 'Stock', 'Category'],
    cellKey: ['name', 'sku', 'quantity', 'category'],
    hasAmountExpand: false,
  },
  urgent_overdue_jobs: {
    label: 'Urgent / Overdue Jobs',
    cols: ['Customer', 'Work', 'Amount', 'Status'],
    cellKey: ['customer_name', 'job_number', 'total_amount', 'status'],
    hasAmountExpand: false,
  },
};

const PAYMENT_MODE_ICONS = {
  Cash: <Banknote size={14} />,
  UPI: <Smartphone size={14} />,
  Cheque: <FileText size={14} />,
  'Account Transfer': <FileText size={14} />,
};

const fmt = (v) => (typeof v === 'number' ? formatCurrency(v, true) : v ?? '—');
const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString() : v ?? '—');
const formatDate = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const SkeletonRow = () => (
  <div className="drilldown-row drilldown-row--skeleton">
    <div className="skeleton-box" style={{ height: 14, width: '30%' }} />
    <div className="skeleton-box" style={{ height: 14, width: '20%' }} />
    <div className="skeleton-box" style={{ height: 14, width: '15%' }} />
    <div className="skeleton-box" style={{ height: 14, width: '12%' }} />
  </div>
);

const DetailRow = ({ record, metric, config, onClose }) => {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const hasJobNav = config.cols[1] === 'Work';
  const hasCustNav = config.cols[0] === 'Customer';

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

  const renderCell0 = () => {
    if (hasCustNav) {
      return <span className="drilldown-cell drilldown-cell--customer" onClick={handleCustomerClick} title="View customer">{record.customer_name || 'Walk-in'}</span>;
    }
    if (metric === 'low_stock_items') {
      return <span className="drilldown-cell drilldown-cell--item-name">{record.name || '—'}</span>;
    }
    return <span className="drilldown-cell">{record.payee_name || '—'}</span>;
  };

  const renderCell1 = () => {
    if (hasJobNav) {
      return <span className="drilldown-cell drilldown-cell--job" onClick={handleJobClick} title="View job">{record.job_number || record.job_name || '—'}</span>;
    }
    if (metric === 'low_stock_items') {
      return <span className="drilldown-cell drilldown-cell--sku">{record.sku || '—'}</span>;
    }
    return <span className="drilldown-cell drilldown-cell--type">{record.type || '—'}</span>;
  };

  const renderCell2 = () => {
    let value;
    let extra;
    if (metric === 'todays_collection') { value = fmt(record.amount); }
    else if (metric === 'pending_amount') { value = fmt(record.balance_amount); }
    else if (metric === 'todays_expenses') { value = fmt(record.amount); }
    else if (metric === 'low_stock_items') {
      value = <>{fmtNum(record.quantity)} <span className="drilldown-cell__reorder">/ {fmtNum(record.reorder_level)}</span></>;
    }
    else { value = fmt(record.total_amount); }

    return (
      <span className="drilldown-cell drilldown-cell--amount">
        {value}
        {config.hasAmountExpand && !extra ? (
          <button className="drilldown-expand-btn" onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : null}
      </span>
    );
  };

  const renderCell3 = () => {
    if (metric === 'todays_collection') {
      return (
        <span className="drilldown-cell drilldown-cell--mode">
          <span className="drilldown-payment-mode">
            {PAYMENT_MODE_ICONS[record.payment_mode] || null}
            {record.payment_mode || '—'}
          </span>
        </span>
      );
    }
    if (metric === 'todays_expenses') {
      return <span className="drilldown-cell drilldown-cell--mode">{record.payment_method || '—'}</span>;
    }
    if (metric === 'low_stock_items') {
      return <span className="drilldown-cell"><span className="drilldown-status-badge drilldown-status-badge--low">{record.category || '—'}</span></span>;
    }
    return (
      <span className={`drilldown-status-badge drilldown-status-badge--${(record.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
        {record.status || '—'}
      </span>
    );
  };

  const canExpand = config.hasAmountExpand;

  return (
    <>
      <div className="drilldown-row" onClick={() => canExpand && setExpanded(v => !v)} style={{ cursor: canExpand ? 'pointer' : 'default' }}>
        {renderCell0()}
        {renderCell1()}
        {renderCell2()}
        {renderCell3()}
      </div>
      {expanded && canExpand && (
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
                  <span className="drilldown-expanded__label"><Clock size={12} /> Time</span>
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
            {metric === 'todays_expenses' && (
              <>
                <div className="drilldown-expanded__item" style={{ gridColumn: '1/-1' }}>
                  <span className="drilldown-expanded__label">Description</span>
                  <span className="drilldown-expanded__value" style={{ fontWeight: 500, fontSize: 'var(--text-xs)' }}>{record.description || '—'}</span>
                </div>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label">Reference</span>
                  <span className="drilldown-expanded__value drilldown-expanded__value--time">{record.reference_number || '—'}</span>
                </div>
                <div className="drilldown-expanded__item">
                  <span className="drilldown-expanded__label"><Calendar size={12} /> Date</span>
                  <span className="drilldown-expanded__value drilldown-expanded__value--time">{formatDate(record.created_at)}</span>
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

  const config = METRIC_CONFIG[metric] || { label: metric, cols: ['Name', 'Detail', 'Value', 'Info'], cellKey: ['customer_name', 'job_number', 'amount', 'status'], hasAmountExpand: false };

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
      setRecords([]);
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

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={config.label} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal--xlarge drilldown-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{config.label}</h2>
          <button className="modal-close modal-close--static" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body drilldown-modal__body">
          {loading && (
            <div className="drilldown-loading">
              <div className="drilldown-table-header">
                {config.cols.map((c, i) => <span key={i}>{c}</span>)}
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
                {config.cols.map((c, i) => <span key={i}>{c}</span>)}
              </div>
              <div className="drilldown-table-body">
                {records.map((record, idx) => (
                  <DetailRow key={record.payment_id || record.job_id || record.id || idx} record={record} metric={metric} config={config} onClose={onClose} />
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

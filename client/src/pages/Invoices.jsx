import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { lazyWithRetry } from '../utils/errorUtils';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Receipt, Plus, Search, Calendar, Printer, Download,
  CreditCard, Loader2, ArrowLeft, X, AlertTriangle, Eye,
  RefreshCw, Keyboard, Clock, UserPlus, FilterX, MessageCircle
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import useTranslation from '../hooks/useTranslation';
import './Invoices.css';
const Billing = lazyWithRetry(() => import('./Billing'));
import { formatCurrency } from '../constants';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import PageContainer from '../components/ui/PageContainer';
import Pagination from '../components/Pagination';
import NoInternetState from '../components/NoInternetState';

const STATUS_CONFIG = {
  draft: { class: 'badge--default', label: 'Draft' },
  pending: { class: 'badge--warning', label: 'Pending Payment' },
  sent: { class: 'badge--info', label: 'Sent' },
  paid: { class: 'badge--success', label: 'Paid' },
  partially_paid: { class: 'badge--warning', label: 'Partial Paid' },
  overdue: { class: 'badge--danger', label: 'Overdue' },
  cancelled: { class: 'badge--danger', label: 'Cancelled' },
  refunded: { class: 'badge--default', label: 'Refunded' },
  on_hold: { class: 'badge--warning', label: 'On Hold' }
};

const Invoices = () => {
  useSEO('Invoices');
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState('list');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);

  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [statusInput, setStatusInput] = useState('draft');
  const [dueDateInput, setDueDateInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [pageError, setPageError] = useState(null);

  useEffect(() => {
    if (location.state?.action === 'create' || location.state?.job || location.state?.customer) {
      setViewMode('create');
    } else {
      setViewMode('list');
    }
  }, [location.state]);

  const hasActiveFilters = searchQuery || startDate || endDate;

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const fetchInvoices = useCallback(async (isRetry) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('limit', pageSize);
      params.append('exclude_internal', '1');
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/customer-payments?${params.toString()}`);

      if (res && res.offline) {
        if (!isRetry) {
          await new Promise(r => setTimeout(r, 2000));
          return fetchInvoices(true);
        }
        setPageError('Server is starting up. Please try again in a moment.');
        toast.error('Server is starting up. Retrying...');
        return;
      }

      const rows = res.data?.data || res.data || [];
      setInvoices(rows);
      setTotalCount(res.data?.total || rows.length);
    } catch (err) {
      console.error('Failed to fetch customer invoices:', err);
      if (!isRetry) {
        await new Promise(r => setTimeout(r, 2000));
        return fetchInvoices(true);
      }
      setPageError('Failed to load invoices. Please check your connection.');
      toast.error('Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, startDate, endDate]);

  useEffect(() => {
    if (viewMode === 'list') {
      fetchInvoices();
    }
  }, [fetchInvoices, viewMode]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildBillData = (invoice) => {
    let orderLines = [];
    try {
      orderLines = (typeof invoice.order_lines === 'string' ? JSON.parse(invoice.order_lines) : invoice.order_lines) || [];
    } catch (e) {
      console.error('Failed to parse order lines', e);
      orderLines = [];
    }

    return {
      invoiceNumber: invoice.invoice_number || `INV-${invoice.id}`,
      invoiceDate: invoice.payment_date || invoice.created_at,
      customer: {
        name: invoice.customer_name,
        mobile: invoice.customer_mobile,
        type: 'Retail',
        email: null,
        address: null,
        gst: null,
      },
      orderLines: orderLines.map(line => ({
        product_name: line.product_name,
        quantity: Number(line.quantity) || 1,
        unit_price: Number(line.unit_price) || 0,
        total_amount: Number(line.total_amount) || 0,
        category: line.category || '',
      })),
      totals: {
        subtotal: Number(invoice.bill_amount || invoice.total_amount || 0),
        gross: Number(invoice.total_amount || 0),
        net: Number(invoice.net_amount || (invoice.total_amount / 1.18)),
        sgst: Number(invoice.sgst_amount || ((invoice.total_amount / 1.18) * 0.09)),
        cgst: Number(invoice.cgst_amount || ((invoice.total_amount / 1.18) * 0.09)),
        effectiveDiscount: Number(invoice.discount_percent || 0),
        discountAmount: Number(invoice.discount_amount || 0)
      },
      payment: {
        advancePaid: Number(invoice.advance_paid || 0),
        balance: Number(invoice.balance_amount || 0),
        methods: invoice.payment_method || 'Cash',
        referenceNumber: invoice.reference_number || null
      },
      jobs: [],
      description: invoice.description || ''
    };
  };

  const handlePrint = async (invoice, e) => {
    if (e) e.stopPropagation();
    const data = buildBillData(invoice);
    const { printInvoicePDF } = await import('../utils/invoicePdf');
    await printInvoicePDF(data);
    toast.success('Sent to printer');
  };

  const handleDownload = async (invoice, e) => {
    if (e) e.stopPropagation();
    const data = buildBillData(invoice);
    const { downloadInvoicePDF } = await import('../utils/invoicePdf');
    downloadInvoicePDF(data);
    toast.success('Invoice PDF downloaded');
  };

  const handleWhatsApp = async (invoice, e) => {
    if (e) e.stopPropagation();
    try {
      const orderLines = (typeof invoice.order_lines === 'string'
        ? JSON.parse(invoice.order_lines)
        : invoice.order_lines) || [];

      const subtotal = Number(invoice.bill_amount || invoice.total_amount || 0);
      const total = Number(invoice.total_amount || 0);
      const discount = Number(invoice.discount_amount || 0);
      const sgst = Number(invoice.sgst_amount || 0);
      const cgst = Number(invoice.cgst_amount || 0);

      let paymentStatus = 'PENDING';
      if (invoice.invoice_status === 'paid') paymentStatus = 'PAID';
      else if (invoice.invoice_status === 'partially_paid') paymentStatus = 'PARTIAL';

      const inv = {
        invoiceNo: invoice.invoice_number || `INV-${invoice.id}`,
        date: invoice.payment_date || invoice.created_at,
        customerName: invoice.customer_name,
        customerMobile: invoice.customer_mobile,
        items: orderLines.map((line) => ({
          name: line.product_name,
          qty: Number(line.quantity) || 1,
          unit: line.unit || '',
          rate: Number(line.unit_price) || 0,
          amount: Number(line.total_amount) || 0,
        })),
        subtotal,
        discount,
        gst: sgst + cgst,
        total,
        paymentStatus,
        amountPaid: Number(invoice.advance_paid || 0),
        balanceDue: Number(invoice.balance_amount || 0),
        paymentMethod: invoice.payment_method || 'Cash',
      };

      const { getWhatsAppShareLink } = await import('../utils/whatsappInvoice');
      const link = getWhatsAppShareLink(inv);
      if (link) window.open(link, '_blank');
    } catch (err) {
      console.error('WhatsApp link generation failed:', err);
    }
  };

  const openInvoiceDetails = (invoice) => {
    setSelectedInvoice(invoice);
    setStatusInput(invoice.invoice_status || 'draft');
    const rawDate = invoice.invoice_due_date || '';
    setDueDateInput(rawDate ? new Date(rawDate).toISOString().split('T')[0] : '');
    setNotesInput(invoice.description || '');
    setShowDetailsModal(true);
  };

  const handleUpdateInvoiceTracking = async () => {
    if (!selectedInvoice) return;
    setUpdatingStatus(true);
    try {
      await api.put(`/invoice-tracking/${selectedInvoice.id}`, {
        status: statusInput,
        due_date: dueDateInput || null,
        notes: notesInput || null
      });
      toast.success('Invoice details updated');
      setShowDetailsModal(false);
      fetchInvoices();
    } catch (err) {
      console.error('Failed to update invoice tracking:', err);
      toast.error('Failed to update invoice details');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRecordPayment = (invoice, e) => {
    if (e) e.stopPropagation();
    setShowDetailsModal(false);
    navigate('/dashboard/sales/payments', {
      state: {
        customer_id: invoice.customer_id,
        customer_name: invoice.customer_name,
        customer_mobile: invoice.customer_mobile,
        amount: invoice.balance_amount
      }
    });
  };

  const parsedOrderLines = useMemo(() => {
    if (!selectedInvoice) return [];
    try {
      return (typeof selectedInvoice.order_lines === 'string'
        ? JSON.parse(selectedInvoice.order_lines)
        : selectedInvoice.order_lines) || [];
    } catch (e) {
      console.error('Failed to parse order lines', e);
      return [];
    }
  }, [selectedInvoice]);

  const InvoiceSkeleton = () => (
    <div className="inv-skeleton">
      <div className="inv-skeleton__toolbar">
        <div className="inv-skeleton__block" style={{ width: 200, height: 22 }} />
        <div className="inv-skeleton__block" style={{ width: 130, height: 38, borderRadius: 8 }} />
      </div>
      <div className="inv-skeleton__filters">
        {[1, 2, 3].map(i => (
          <div key={i} className="inv-skeleton__block" style={{ height: 38 }} />
        ))}
      </div>
      <div className="inv-skeleton__table">
        <div className="inv-skeleton__header">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="inv-skeleton__block" style={{ width: 80, height: 14 }} />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map(r => (
          <div key={r} className="inv-skeleton__row">
            {[1, 2, 3, 4, 5, 6, 7].map(c => (
              <div key={c} className="inv-skeleton__block" style={{ width: c === 4 || c === 5 ? 70 : 80, height: 14 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  if (pageError && !loading && invoices.length === 0) {
    return (
      <SectionErrorBoundary name="InvoicesPage">
        <PageContainer>
          <div className="inv-page">
            <NoInternetState
              variant="fullPage"
              title="Unable to Load Invoices"
              message={pageError}
              suggestion="Check your connection and try again."
              actionLabel="Retry"
              onRetry={() => { setPageError(null); return fetchInvoices(); }}
            />
          </div>
        </PageContainer>
      </SectionErrorBoundary>
    );
  }

  return (
    <SectionErrorBoundary name="InvoicesPage">
    <PageContainer>
      <div className="inv-page">
      {viewMode === 'create' ? (
        <div className="inv-create-view">
          <React.Suspense fallback={
            <div className="inv-create-loading">
              <Loader2 className="spin" size={20} /> Loading billing…
            </div>
          }>
            <SectionErrorBoundary name="BillingForm" title="Failed to load billing form" message="The billing form encountered an error. Please try again.">
              <Billing />
            </SectionErrorBoundary>
          </React.Suspense>
        </div>
      ) : (
        <>
          {/* ── Page Header ── */}
          <div className="inv-header">
            <div className="inv-header__left">
              <button
                className="btn btn-secondary btn-with-icon"
                onClick={() => navigate('/dashboard')}
                title="Back to Dashboard"
                aria-label="Back to Dashboard"
              >
                <ArrowLeft size={16} />
                <span className="inv-header__back-text">Back</span>
              </button>
              <div className="inv-header__titles">
                <h1>Customer Invoices</h1>
              </div>
            </div>
            <div className="inv-header__actions">
              <button
                className="btn btn-secondary btn-with-icon"
                onClick={() => navigate('/dashboard/shortcuts')}
                title="Keyboard Shortcuts"
                aria-label="Keyboard Shortcuts"
              >
                <Keyboard size={16} /> Shortcuts
              </button>
              <button
                className="btn btn-secondary btn-with-icon"
                onClick={() => navigate('/dashboard/jobs')}
                title="Recent Jobs"
                aria-label="Recent Jobs"
              >
                <Clock size={16} /> Recent
              </button>
              <button
                className="btn btn-accent btn-with-icon"
                onClick={() => navigate('/dashboard/customers/new')}
                title="Add New Customer"
                aria-label="Add New Customer"
              >
                <UserPlus size={16} /> New Customer
              </button>
              <button className="btn btn-primary btn-with-icon" onClick={() => navigate('/dashboard/sales/invoices/create')}>
                <Plus size={18} /> Create Invoice
              </button>
            </div>
          </div>

          {/* ── Filters ── */}
          <div className="inv-filters">
            <div className="inv-filters__row">
              <div className="inv-filters__search">
                <div className="search-input-wrapper">
                  <Search className="search-input-icon" size={16} aria-hidden="true" />
                  <input
                    id="invoiceSearch"
                    type="text"
                    className="input-field"
                    placeholder="Search customer, invoice #, phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button className="inv-filters__clear-search" onClick={() => setSearchQuery('')} aria-label="Clear search">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="inv-filters__date">
                <Calendar size={14} className="inv-filters__date-icon" aria-hidden="true" />
                <input
                  id="invoiceStartDate"
                  type="date"
                  className="input-field"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-label="Start date"
                  title="Start date"
                />
              </div>
              <div className="inv-filters__date">
                <Calendar size={14} className="inv-filters__date-icon" aria-hidden="true" />
                <input
                  id="invoiceEndDate"
                  type="date"
                  className="input-field"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-label="End date"
                  title="End date"
                />
              </div>
              {hasActiveFilters && (
                <button className="btn btn-ghost btn-with-icon btn-sm" onClick={clearFilters} title="Clear all filters">
                  <FilterX size={14} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* ── Table ── */}
          <div className="inv-table-wrap">
            {loading ? (
              <InvoiceSkeleton />
            ) : invoices.length === 0 ? (
              <div className="inv-empty">
                <Receipt size={48} />
                <h3>No Customer Invoices Found</h3>
                <p className="muted">Add invoices or adjust search parameters.</p>
                <div className="inv-empty__actions">
                  <button className="btn btn-primary" onClick={() => navigate('/dashboard/sales/invoices/create')}>
                    <Plus size={16} /> Create Invoice
                  </button>
                  {hasActiveFilters && (
                    <button className="btn btn-secondary" onClick={clearFilters}>
                      <FilterX size={16} /> Clear Filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <table className="inv-table">
                <thead>
                  <tr>
                    <th scope="col">Invoice No.</th>
                    <th scope="col">Date</th>
                    <th scope="col">Customer</th>
                    <th scope="col" className="text-right">Total Amount</th>
                    <th scope="col" className="text-right">Balance Due</th>
                    <th scope="col" className="text-center">Status</th>
                    <th scope="col" className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const isDue = Number(inv.balance_amount) > 0;
                    const statusKey = inv.invoice_status || 'draft';
                    const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.draft;
                    return (
                      <tr key={inv.id} className="inv-row" onClick={() => openInvoiceDetails(inv)}>
                        <td>
                          <div className="inv-row__invoice">
                            <span className="inv-row__number">{inv.invoice_number || `INV-${inv.id}`}</span>
                            {inv.invoice_due_date && isDue && (
                              <span className="inv-row__due">
                                <AlertTriangle size={10} aria-hidden="true" />
                                Due: {new Date(inv.invoice_due_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="inv-row__date">{new Date(inv.payment_date || inv.created_at).toLocaleDateString()}</span>
                        </td>
                        <td>
                          <div className="inv-row__customer">
                            <span className="inv-row__name">{inv.customer_name}</span>
                            <span className="inv-row__mobile">{inv.customer_mobile || 'No Mobile'}</span>
                          </div>
                        </td>
                        <td className="text-right">
                          <span className="inv-row__amount">{formatCurrency(inv.total_amount, true)}</span>
                        </td>
                        <td className="text-right">
                          <span className={`inv-row__balance ${isDue ? 'inv-row__balance--due' : 'inv-row__balance--paid'}`}>
                            {formatCurrency(inv.balance_amount, true)}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className={`badge badge--pill ${statusCfg.class}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="inv-row__actions">
                            <button
                              className="btn btn-secondary btn-icon"
                              onClick={() => openInvoiceDetails(inv)}
                              title="View Details"
                              aria-label={`View details for invoice ${inv.invoice_number}`}
                            >
                              <Eye size={15} aria-hidden="true" />
                            </button>
                            <button
                              className="btn btn-secondary btn-icon"
                              onClick={(e) => handlePrint(inv, e)}
                              title="Print Invoice"
                              aria-label={`Print invoice ${inv.invoice_number}`}
                            >
                              <Printer size={15} aria-hidden="true" />
                            </button>
                            <button
                              className="btn btn-secondary btn-icon"
                              onClick={(e) => handleDownload(inv, e)}
                              title="Download PDF"
                              aria-label={`Download PDF for invoice ${inv.invoice_number}`}
                            >
                              <Download size={15} aria-hidden="true" />
                            </button>
                            {isDue && (
                              <button
                                className="btn btn-accent btn-icon"
                                onClick={(e) => handleRecordPayment(inv, e)}
                                title="Record Payment"
                                aria-label={`Record payment for invoice ${inv.invoice_number}`}
                              >
                                <CreditCard size={15} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Pagination ── */}
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            total={totalCount}
            limit={pageSize}
            onPageChange={setCurrentPage}
            loading={loading}
          />
        </>
      )}

      {/* ── Invoice Details Modal ── */}
      {showDetailsModal && selectedInvoice && (
        <div className="modal-backdrop" onClick={() => setShowDetailsModal(false)} role="dialog" aria-modal="true" aria-label="Invoice details">
          <div className="modal modal--large inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Receipt size={20} style={{ color: 'var(--accent)' }} />
                <h3 style={{ margin: 0 }}>Invoice {selectedInvoice.invoice_number || `INV-${selectedInvoice.id}`}</h3>
              </div>
              <span className={`badge badge--pill ${STATUS_CONFIG[selectedInvoice.invoice_status || 'draft']?.class || 'badge--default'}`} style={{ fontSize: '11px', padding: '4px 10px', marginLeft: '12px' }}>
                {STATUS_CONFIG[selectedInvoice.invoice_status || 'draft']?.label || 'Draft'}
              </span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowDetailsModal(false)} aria-label="Close invoice details" style={{ marginLeft: 'auto' }}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="modal-body">
              <div className="inv-modal__grid">
                <div className="inv-modal__section">
                  <span className="inv-modal__section-title">Customer Information</span>
                  <div className="inv-modal__card">
                    <div className="inv-modal__field" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))', color: 'var(--accent)', flexShrink: 0 }}>
                        <Receipt size={15} />
                      </span>
                      <div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</div>
                        <div style={{ fontWeight: '600', color: 'var(--text-heading)' }}>{selectedInvoice.customer_name}</div>
                      </div>
                    </div>
                    
                    <div className="inv-modal__field" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))', color: 'var(--accent)', flexShrink: 0 }}>
                        <Clock size={15} />
                      </span>
                      <div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mobile</div>
                        <div style={{ fontWeight: '600', color: 'var(--text-heading)' }}>{selectedInvoice.customer_mobile || '—'}</div>
                      </div>
                    </div>

                    {selectedInvoice.description && (
                      <div className="inv-modal__field" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '4px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))', color: 'var(--accent)', flexShrink: 0 }}>
                          <FileText size={15} />
                        </span>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes / Description</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{selectedInvoice.description}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="inv-modal__section">
                  <span className="inv-modal__section-title">Invoice Tracking</span>
                  <div className="inv-modal__card">
                    <div className="inv-modal__field-row">
                      <div className="inv-modal__field stack-xs">
                        <label htmlFor="invoice-status" className="label">Status</label>
                        <select id="invoice-status" className="input-field" value={statusInput} onChange={(e) => setStatusInput(e.target.value)} style={{ height: '36px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                          <option value="draft">Draft</option>
                          <option value="pending">Pending Payment</option>
                          <option value="sent">Sent to Customer</option>
                          <option value="paid">Paid</option>
                          <option value="partially_paid">Partially Paid</option>
                          <option value="overdue">Overdue</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="refunded">Refunded</option>
                          <option value="on_hold">On Hold</option>
                        </select>
                      </div>
                      <div className="inv-modal__field stack-xs">
                        <label htmlFor="invoice-due-date" className="label">Due Date</label>
                        <input id="invoice-due-date" type="date" className="input-field" value={dueDateInput} onChange={(e) => setDueDateInput(e.target.value)} style={{ height: '36px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }} />
                      </div>
                    </div>
                    <div className="inv-modal__field stack-xs">
                      <label htmlFor="invoice-notes" className="label">Notes / History log</label>
                      <input id="invoice-notes" type="text" className="input-field" placeholder="Add details, email logs, calls..." value={notesInput} onChange={(e) => setNotesInput(e.target.value)} autoComplete="off" style={{ height: '36px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="inv-modal__section">
                <span className="inv-modal__section-title">Line Items</span>
                <div className="inv-modal__table-wrap">
                  <table className="table" style={{ width: '100%', fontSize: 13 }}>
                    <caption className="sr-only">Invoice line items</caption>
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: 'left' }}>Item Description</th>
                        <th scope="col" className="text-right" style={{ width: '60px' }}>Qty</th>
                        <th scope="col" className="text-right" style={{ width: '120px' }}>Unit Price</th>
                        <th scope="col" className="text-right" style={{ width: '120px' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedOrderLines.length === 0 ? (
                        <tr><td colSpan="4" className="text-center muted" style={{ padding: '20px' }}>No detailed items recorded (Bulk Payment)</td></tr>
                      ) : (
                        parsedOrderLines.map((line, idx) => (
                          <tr key={idx}>
                            <td style={{ textAlign: 'left' }}>
                              <div className="font-semibold" style={{ color: 'var(--text-heading)', fontWeight: '600' }}>{line.product_name}</div>
                              {(() => {
                                const details = [];
                                if (line.colour) details.push({ label: 'Color', value: line.colour });
                                if (line.paper_preference) details.push({ label: 'Paper', value: line.paper_preference });
                                if (line.numbering_from || line.numbering_to) details.push({ label: 'No', value: `${line.numbering_from || ''} - ${line.numbering_to || ''}` });
                                if (line.description) details.push({ label: 'Desc', value: line.description });
                                if (line.special_instructions) details.push({ label: 'Note', value: line.special_instructions });
                                
                                return details.length > 0 ? (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                                    {details.map((d, idx2) => (
                                      <span key={idx2} style={{ fontSize: '10px', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                        <strong>{d.label}:</strong> {d.value}
                                      </span>
                                    ))}
                                  </div>
                                ) : null;
                              })()}
                            </td>
                            <td className="text-right" style={{ verticalAlign: 'middle' }}>{line.quantity}</td>
                            <td className="text-right" style={{ verticalAlign: 'middle' }}>{formatCurrency(line.unit_price, true)}</td>
                            <td className="text-right font-bold" style={{ verticalAlign: 'middle', fontWeight: '700', color: 'var(--text-heading)' }}>{formatCurrency(line.total_amount, true)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="inv-modal__totals">
                <div className="inv-modal__totals-inner">
                  <div className="inv-modal__total-row">
                    <span className="muted">Subtotal:</span>
                    <span>{formatCurrency(selectedInvoice.bill_amount || selectedInvoice.total_amount || 0, true)}</span>
                  </div>
                  {Number(selectedInvoice.discount_amount) > 0 && (
                    <div className="inv-modal__total-row inv-modal__total-row--discount">
                      <span>Discount ({selectedInvoice.discount_percent}%):</span>
                      <span>-{formatCurrency(selectedInvoice.discount_amount, true)}</span>
                    </div>
                  )}
                  <div className="inv-modal__total-row inv-modal__total-row--sub">
                    <span>Taxable Amount (Net):</span>
                    <span>{formatCurrency(selectedInvoice.net_amount || (selectedInvoice.total_amount / 1.18), true)}</span>
                  </div>
                  <div className="inv-modal__total-row inv-modal__total-row--tax">
                    <span>CGST (9%):</span>
                    <span>{formatCurrency(selectedInvoice.cgst_amount || ((selectedInvoice.total_amount / 1.18) * 0.09), true)}</span>
                  </div>
                  <div className="inv-modal__total-row inv-modal__total-row--tax">
                    <span>SGST (9%):</span>
                    <span>{formatCurrency(selectedInvoice.sgst_amount || ((selectedInvoice.total_amount / 1.18) * 0.09), true)}</span>
                  </div>
                  <div className="inv-modal__divider" />
                  <div className="inv-modal__total-row inv-modal__total-row--grand" style={{ fontSize: '16px', padding: '2px 0' }}>
                    <span>Invoice Total:</span>
                    <span style={{ color: 'var(--accent)', fontWeight: '800' }}>{formatCurrency(selectedInvoice.total_amount, true)}</span>
                  </div>
                  <div className="inv-modal__total-row inv-modal__total-row--paid" style={{ color: 'var(--success)', fontWeight: '600' }}>
                    <span>Amount Paid:</span>
                    <span>{formatCurrency(selectedInvoice.advance_paid, true)}</span>
                  </div>
                  <div className={`inv-modal__total-row ${Number(selectedInvoice.balance_amount) > 0.05 ? 'inv-modal__total-row--balance' : ''}`} style={{ 
                    padding: '8px 12px', 
                    borderRadius: '8px', 
                    background: Number(selectedInvoice.balance_amount) > 0.05 ? 'rgba(239, 68, 68, 0.06)' : 'rgba(16, 185, 129, 0.06)', 
                    color: Number(selectedInvoice.balance_amount) > 0.05 ? 'var(--destructive)' : 'var(--success)',
                    marginTop: '6px',
                    border: Number(selectedInvoice.balance_amount) > 0.05 ? '1px solid rgba(239, 68, 68, 0.12)' : '1px solid rgba(16, 185, 129, 0.12)'
                  }}>
                    <span style={{ fontWeight: '700' }}>{Number(selectedInvoice.balance_amount) > 0.05 ? 'Balance Due:' : 'Status:'}</span>
                    <span style={{ fontWeight: '800', fontSize: '15px' }}>
                      {Number(selectedInvoice.balance_amount) > 0.05 ? formatCurrency(selectedInvoice.balance_amount, true) : 'Paid in Full ✓'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <div className="inv-modal__footer-left">
                <button className="btn btn-secondary btn-with-icon" onClick={() => handlePrint(selectedInvoice)}>
                  <Printer size={16} /> Print
                </button>
                <button className="btn btn-secondary btn-with-icon" onClick={() => handleDownload(selectedInvoice)}>
                  <Download size={16} /> Download PDF
                </button>
                <button className="btn btn-success btn-with-icon" onClick={(e) => handleWhatsApp(selectedInvoice, e)} style={{ background: '#25D366', borderColor: '#25D366', color: '#fff' }}>
                  <MessageCircle size={16} style={{ color: '#fff' }} /> Send via WhatsApp
                </button>
              </div>
              <div className="inv-modal__footer-right">
                {Number(selectedInvoice.balance_amount) > 0 && (
                  <button className="btn btn-accent btn-with-icon" onClick={(e) => handleRecordPayment(selectedInvoice, e)}>
                    <CreditCard size={16} /> Record Payment
                  </button>
                )}
                <button className="btn btn-primary" onClick={handleUpdateInvoiceTracking} disabled={updatingStatus}>
                  {updatingStatus ? <Loader2 className="spin" size={16} /> : null}
                  {updatingStatus ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </PageContainer>
    </SectionErrorBoundary>
  );
};

export default React.memo(Invoices);

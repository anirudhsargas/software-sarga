import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Receipt, Plus, Search, Calendar, FileText, Printer, Download, 
  CreditCard, Loader2, ArrowLeft, X, AlertTriangle, Eye, CheckCircle2, ChevronRight,
  RefreshCw
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import useTranslation from '../hooks/useTranslation';
const Billing = React.lazy(() => import('./Billing'));
import { downloadInvoicePDF, printInvoicePDF } from '../utils/invoicePdf';
import { formatCurrency } from '../constants';
import SectionErrorBoundary from '../components/SectionErrorBoundary';

const statusColors = {
  draft: 'var(--text-muted)',
  pending: 'var(--warning)',
  sent: 'var(--accent)',
  paid: 'var(--success)',
  partially_paid: 'var(--text-muted)',
  overdue: 'var(--error)',
  cancelled: 'var(--error)',
  refunded: 'var(--text-muted)',
  on_hold: 'var(--warning)'
};

const Invoices = () => {
  useSEO('Invoices');
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  // Mode state: 'list' | 'create'
  const [viewMode, setViewMode] = useState('list');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Details Modal
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Tracking edit states inside modal
  const [statusInput, setStatusInput] = useState('draft');
  const [dueDateInput, setDueDateInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [pageError, setPageError] = useState(null);

  // Intercept incoming router state to auto-switch to Create mode
  useEffect(() => {
    if (location.state?.action === 'create' || location.state?.job || location.state?.customer) {
      setViewMode('create');
    } else {
      setViewMode('list');
    }
  }, [location.state]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('limit', pageSize);
      if (searchQuery.trim()) {
        params.append('customer_id', ''); // Server does not search by text directly, but we can query overall
      }
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/customer-payments?${params.toString()}`);
      
      let rows = res.data?.data || res.data || [];
      // Filter out internal departmental bills
      rows = rows.filter(r => !r.is_internal);

      // Simple frontend search query filter for safety (since customer-payments does not filter text queries in DB)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        rows = rows.filter(r => 
          (r.customer_name && r.customer_name.toLowerCase().includes(q)) ||
          (r.customer_mobile && r.customer_mobile.includes(q)) ||
          (r.invoice_number && r.invoice_number.toLowerCase().includes(q))
        );
      }

      setInvoices(rows);
      setTotalCount(res.data?.total || rows.length);
    } catch (err) {
      console.error('Failed to fetch customer invoices:', err);
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

  // Format helper for PDF generation
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
        type: 'Retail', // Default customer type
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
      jobs: []
    };
  };

  const handlePrint = (invoice, e) => {
    if (e) e.stopPropagation();
    const data = buildBillData(invoice);
    printInvoicePDF(data);
    toast.success('Sent to printer');
  };

  const handleDownload = (invoice, e) => {
    if (e) e.stopPropagation();
    const data = buildBillData(invoice);
    downloadInvoicePDF(data);
    toast.success('Invoice PDF downloaded');
  };

  const openInvoiceDetails = (invoice) => {
    setSelectedInvoice(invoice);
    setStatusInput(invoice.invoice_status || 'draft');
    // Format date string to YYYY-MM-DD
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

  // Safe JSON rendering helper
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
    <div className="stack-lg">
      <div className="flex-center-y justify-between">
        <div className="stack-xs">
          <div style={{ width: 180, height: 24, borderRadius: 6, background: 'var(--surface-2)' }} />
          <div style={{ width: 260, height: 14, borderRadius: 4, marginTop: 6, background: 'var(--surface-2)' }} />
        </div>
        <div style={{ width: 130, height: 38, borderRadius: 8, background: 'var(--surface-2)' }} />
      </div>
      <div className="panel" style={{ padding: 20 }}>
        <div className="form-row--3">
          {[1,2,3].map(i => (
            <div key={i}>
              <div style={{ width: 100, height: 12, borderRadius: 4, marginBottom: 8, background: 'var(--surface-2)' }} />
              <div style={{ width: '100%', height: 38, borderRadius: 8, background: 'var(--surface-2)' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 24 }}>
            {[1,2,3,4,5,6,7].map(i => (
              <div key={i} style={{ width: 80, height: 14, borderRadius: 4, background: 'var(--surface-2)' }} />
            ))}
          </div>
        </div>
        {[1,2,3,4,5].map(r => (
          <div key={r} style={{ display: 'flex', gap: 24, padding: '16px 16px', borderBottom: '1px solid var(--border)' }}>
            {[1,2,3,4,5,6,7].map(c => (
              <div key={c} style={{ width: c === 4 || c === 5 ? 70 : 80, height: 14, borderRadius: 4, background: 'var(--surface-2)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  if (pageError && !loading && invoices.length === 0) {
    return (
      <SectionErrorBoundary name="InvoicesPage">
        <div className="stack-lg fade-in">
          <div className="flex-center-y justify-between">
            <div className="stack-xs">
              <h1>{t('invoices', 'Customer Invoices')}</h1>
              <p className="muted">{t('manage_invoices_desc', 'Track customer billing payments, due tracking, and print receipts')}</p>
            </div>
            <button className="btn btn-primary btn-with-icon" onClick={() => { setPageError(null); fetchInvoices(); }}>
              <RefreshCw size={18} /> Retry
            </button>
          </div>
          <div className="panel" style={{ padding: '48px 20px', textAlign: 'center' }}>
            <AlertTriangle size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
            <h3>{pageError}</h3>
            <p className="muted" style={{ marginTop: 8 }}>Check your connection and try again.</p>
          </div>
        </div>
      </SectionErrorBoundary>
    );
  }

  return (
    <SectionErrorBoundary name="InvoicesPage">
    <div className="stack-lg fade-in">
      {viewMode === 'create' ? (
        <div className="stack-md">
          <div className="flex-center-y justify-between">
            <button className="btn btn-ghost flex-center-y gap-xs" onClick={() => navigate('/dashboard/sales/invoices')}>
              <ArrowLeft size={16} /> {t('back_to_list', 'Back to Invoices')}
            </button>
            <h2>{t('create_invoice', 'New Customer Invoice')}</h2>
          </div>
          <div className="panel" style={{ padding: 0 }}>
            <React.Suspense fallback={<div className="p-20 text-center"><Loader2 className="animate-spin" size={20} /> Loading billing…</div>}>
              <SectionErrorBoundary name="BillingForm" title="Failed to load billing form" message="The billing form encountered an error. Please try again.">
                <Billing />
              </SectionErrorBoundary>
            </React.Suspense>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-center-y justify-between">
            <div className="stack-xs">
              <h1>{t('invoices', 'Customer Invoices')}</h1>
              <p className="muted">{t('manage_invoices_desc', 'Track customer billing payments, due tracking, and print receipts')}</p>
            </div>
            <button className="btn btn-primary btn-with-icon" onClick={() => setViewMode('create')}>
              <Plus size={18} /> {t('create_invoice', 'Create Invoice')}
            </button>
          </div>

          {/* Filters Bar */}
          <div className="panel stack-md">
            <div className="form-row--3">
              <div className="stack-xs">
                <label className="label">{t('search', 'Search Customer / Mobile / Invoice')}</label>
                <div className="search-input-wrapper">
                  <Search className="search-input-icon" size={16} />
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder={t('search_placeholder', 'Type customer name, invoice #...')} 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="stack-xs">
                <label className="label">{t('start_date', 'Start Date')}</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="stack-xs">
                <label className="label">{t('end_date', 'End Date')}</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Invoices List Table */}
          <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
            {loading ? (
              <InvoiceSkeleton />
            ) : invoices.length === 0 ? (
              <div className="p-40 text-center muted stack-xs flex-center">
                <Receipt size={48} className="mb-md" />
                <h3>No Customer Invoices Found</h3>
                <p>Add invoices or adjust search parameters.</p>
              </div>
            ) : (
              <table className="table">
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
                    return (
                      <tr key={inv.id} className="cursor-pointer hover-row" onClick={() => openInvoiceDetails(inv)}>
                        <td>
                          <div className="font-bold text-accent">
                            {inv.invoice_number || `INV-${inv.id}`}
                          </div>
                          {inv.invoice_due_date && isDue && (
                            <div className="text-xs text-danger flex-center-y gap-xxs mt-xxs">
                              <AlertTriangle size={10} />
                              Due: {new Date(inv.invoice_due_date).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td>{new Date(inv.payment_date || inv.created_at).toLocaleDateString()}</td>
                        <td>
                          <div>{inv.customer_name}</div>
                          <div className="text-xs muted">{inv.customer_mobile || 'No Mobile'}</div>
                        </td>
                        <td className="text-right font-semibold">{formatCurrency(inv.total_amount, true)}</td>
                        <td className="text-right">
                          <span className={`font-bold ${isDue ? 'text-danger' : 'text-success'}`}>
                            {formatCurrency(inv.balance_amount, true)}
                          </span>
                        </td>
                        <td className="text-center">
                          <span 
                            className="badge text-xs"
                            style={{ 
                              background: `${statusColors[inv.invoice_status || 'draft']}20`, 
                              color: statusColors[inv.invoice_status || 'draft'],
                              borderColor: statusColors[inv.invoice_status || 'draft']
                            }}
                          >
                            {(inv.invoice_status || 'draft').toUpperCase().replace('_', ' ')}
                          </span>
                        </td>
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex-center gap-xs">
                            <button 
                              className="btn btn-ghost btn-icon touch-target" 
                              onClick={() => openInvoiceDetails(inv)}
                              title="View Details"
                              aria-label={`View details for invoice ${inv.invoice_number}`}
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              className="btn btn-ghost btn-icon touch-target" 
                              onClick={(e) => handlePrint(inv, e)}
                              title="Print Invoice"
                              aria-label={`Print invoice ${inv.invoice_number}`}
                            >
                              <Printer size={16} />
                            </button>
                            <button 
                              className="btn btn-ghost btn-icon touch-target" 
                              onClick={(e) => handleDownload(inv, e)}
                              title="Download PDF"
                              aria-label={`Download PDF for invoice ${inv.invoice_number}`}
                            >
                              <Download size={16} />
                            </button>
                            {isDue && (
                              <button 
                                className="btn btn-ghost btn-icon text-accent touch-target" 
                                onClick={(e) => handleRecordPayment(inv, e)}
                                title="Record Payment"
                                aria-label={`Record payment for invoice ${inv.invoice_number}`}
                              >
                                <CreditCard size={16} />
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

          {/* Pagination */}
          {totalCount > pageSize && (
            <div className="flex justify-between items-center mt-md">
              <span className="text-sm muted">Showing {invoices.length} of {totalCount} Invoices</span>
              <div className="flex gap-xs">
                <button 
                  className="btn btn-outline" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                >
                  Previous
                </button>
                <button 
                  className="btn btn-outline"
                  disabled={invoices.length < pageSize}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Invoice Details & Status Modal */}
      {showDetailsModal && selectedInvoice && (
        <div className="modal-backdrop">
          <div className="modal modal--large fade-in">
            <div className="modal-header">
              <h3>Invoice details: {selectedInvoice.invoice_number || `INV-${selectedInvoice.id}`}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowDetailsModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body stack-md">
              <div className="form-row--2">
                <div className="stack-xs">
                  <span className="font-semibold text-accent">Customer Information</span>
                  <div className="panel stack-xs bg-surface-2">
                    <div><strong>Name:</strong> {selectedInvoice.customer_name}</div>
                    <div><strong>Mobile:</strong> {selectedInvoice.customer_mobile || '—'}</div>
                    {selectedInvoice.description && (
                      <div><strong>Internal Notes:</strong> {selectedInvoice.description}</div>
                    )}
                  </div>
                </div>

                <div className="stack-xs">
                  <span className="font-semibold text-accent">Invoice Tracking Details</span>
                  <div className="panel stack-sm">
                    <div className="form-row--2">
                      <div className="stack-xs">
                        <label className="label">Invoice Status</label>
                        <select 
                          className="input-field" 
                          value={statusInput} 
                          onChange={(e) => setStatusInput(e.target.value)}
                        >
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
                      <div className="stack-xs">
                        <label className="label">Due Date</label>
                        <input 
                          type="date" 
                          className="input-field" 
                          value={dueDateInput}
                          onChange={(e) => setDueDateInput(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="stack-xs">
                      <label className="label">Notes / Follow-up Notes</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="Add details, email logs, calls..." 
                        value={notesInput}
                        onChange={(e) => setNotesInput(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Items Table */}
              <div className="stack-xs">
                <span className="font-semibold text-accent">Line Items</span>
                <table className="table" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Item Description</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Unit Price</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedOrderLines.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center muted">No detailed items recorded (Bulk Payment)</td>
                      </tr>
                    ) : (
                      parsedOrderLines.map((line, idx) => (
                        <tr key={idx}>
                          <td>
                            <div className="font-semibold">{line.product_name}</div>
                            {line.description && <div className="text-xs muted">{line.description}</div>}
                          </td>
                          <td className="text-right">{line.quantity}</td>
                          <td className="text-right">{formatCurrency(line.unit_price, true)}</td>
                          <td className="text-right font-bold">{formatCurrency(line.total_amount, true)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* GST and Breakdown Summary */}
              <div className="flex justify-end">
                <div className="stack-xs" style={{ width: '320px', fontSize: 14 }}>
                  <div className="flex-center-y justify-between">
                    <span className="muted">Subtotal:</span>
                    <span>{formatCurrency(selectedInvoice.bill_amount || selectedInvoice.total_amount || 0, true)}</span>
                  </div>
                  {Number(selectedInvoice.discount_amount) > 0 && (
                    <div className="flex-center-y justify-between text-success">
                      <span>Discount ({selectedInvoice.discount_percent}%):</span>
                      <span>-{formatCurrency(selectedInvoice.discount_amount, true)}</span>
                    </div>
                  )}
                  <div className="flex-center-y justify-between font-semibold mt-xs">
                    <span>Taxable Amount (Net):</span>
                    <span>{formatCurrency(selectedInvoice.net_amount || (selectedInvoice.total_amount / 1.18), true)}</span>
                  </div>
                  <div className="flex-center-y justify-between text-xs muted pl-sm">
                    <span>CGST (9%):</span>
                    <span>{formatCurrency(selectedInvoice.cgst_amount || ((selectedInvoice.total_amount / 1.18) * 0.09), true)}</span>
                  </div>
                  <div className="flex-center-y justify-between text-xs muted pl-sm">
                    <span>SGST (9%):</span>
                    <span>{formatCurrency(selectedInvoice.sgst_amount || ((selectedInvoice.total_amount / 1.18) * 0.09), true)}</span>
                  </div>
                  <div className="summary-divider mt-xs mb-xs"></div>
                  <div className="flex-center-y justify-between font-bold text-lg">
                    <span>Invoice Total:</span>
                    <span className="text-accent">{formatCurrency(selectedInvoice.total_amount, true)}</span>
                  </div>
                  <div className="flex-center-y justify-between text-success text-sm">
                    <span>Amount Paid:</span>
                    <span>{formatCurrency(selectedInvoice.advance_paid, true)}</span>
                  </div>
                  <div className="flex-center-y justify-between text-danger font-bold text-sm">
                    <span>Balance Due:</span>
                    <span>{formatCurrency(selectedInvoice.balance_amount, true)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer flex-center-y justify-between">
              <div className="flex gap-xs">
                <button 
                  className="btn btn-outline btn-with-icon" 
                  onClick={() => handlePrint(selectedInvoice)}
                >
                  <Printer size={16} /> Print
                </button>
                <button 
                  className="btn btn-outline btn-with-icon" 
                  onClick={() => handleDownload(selectedInvoice)}
                >
                  <Download size={16} /> Download PDF
                </button>
              </div>
              <div className="flex gap-xs">
                {Number(selectedInvoice.balance_amount) > 0 && (
                  <button 
                    className="btn btn-accent btn-with-icon" 
                    onClick={(e) => handleRecordPayment(selectedInvoice, e)}
                  >
                    <CreditCard size={16} /> Record Payment
                  </button>
                )}
                <button 
                  className="btn btn-primary" 
                  onClick={handleUpdateInvoiceTracking}
                  disabled={updatingStatus}
                >
                  {updatingStatus ? <Loader2 className="animate-spin mr-xxs" size={16} /> : null}
                  Save Tracking Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </SectionErrorBoundary>
  );
};

export default React.memo(Invoices);

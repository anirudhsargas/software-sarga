import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import InvoiceModal from './InvoiceModal';
import PaymentModal from './PaymentModal';
import { 
  ArrowLeft, Plus, FileText, CreditCard, 
  TrendingUp, Edit, Trash2, User, 
  Phone, Mail, MapPin, Calendar, 
  ShieldCheck, AlertCircle, Info, ChevronRight 
} from 'lucide-react';
import '../pages/Vendors.css';

const VendorDetail = ({
  vendor,
  onBack,
  onEditVendor,
  onDeleteVendor,
  formatCurrency,
  getStatusBadge,
  refreshKey = 0,
  canEdit = true,
  canDelete = true,
  canAdd = true
}) => {
  const { id: routeId } = useParams();
  const vendorId = vendor?.id || routeId;
  const [vendorDetails, setVendorDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [spendTrend, setSpendTrend] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const transactionsPerPage = 10;

  useEffect(() => {
    loadVendorDetails();
    loadSpendTrend();
  }, [vendorId, refreshKey]);

  const getLatestRecordDate = (items, dateKey) => {
    if (!items?.length) return null;
    const sorted = [...items].sort((a, b) => new Date(b[dateKey]) - new Date(a[dateKey]));
    return sorted[0]?.[dateKey] ? new Date(sorted[0][dateKey]).toLocaleDateString() : null;
  };

  const latestInvoiceDate = getLatestRecordDate(vendorDetails?.invoices || vendor?.invoices, 'invoice_date');
  const latestPaymentDate = getLatestRecordDate(vendorDetails?.payments || vendor?.payments, 'payment_date');

  const rawTransactions = [
    ...(vendorDetails?.invoices || vendor?.invoices || []).map((inv) => ({
      id: inv.id,
      type: 'Debit',
      category: 'Purchase',
      title: inv.invoice_number || `Invoice ${inv.id}`,
      date: inv.invoice_date || inv.created_at,
      amount: Number(inv.amount) || 0,
      method: 'Invoice',
      status: inv.status || 'Pending',
      note: inv.due_date ? `Due ${new Date(inv.due_date).toLocaleDateString()}` : 'No due date',
    })),
    ...(vendorDetails?.payments || vendor?.payments || []).map((pay) => ({
      id: pay.id,
      type: 'Credit',
      category: 'Payment',
      title: pay.reference_number || `Payment ${pay.id}`,
      date: pay.payment_date || pay.created_at,
      amount: Number(pay.amount) || 0,
      method: pay.payment_mode ? pay.payment_mode.replace('_', ' ') : 'Payment',
      status: 'Completed',
      note: pay.payment_mode ? pay.payment_mode.replace('_', ' ') : '—',
    }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = 0;
  const transactions = rawTransactions.map((txn) => {
    runningBalance += txn.type === 'Debit' ? txn.amount : -txn.amount;
    return {
      ...txn,
      debit: txn.type === 'Debit' ? txn.amount : 0,
      credit: txn.type === 'Credit' ? txn.amount : 0,
      balance: runningBalance,
    };
  }).reverse();

  const pageCount = Math.max(1, Math.ceil(transactions.length / transactionsPerPage));
  const displayedTransactions = transactions.slice((currentPage - 1) * transactionsPerPage, currentPage * transactionsPerPage);

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(pageCount, prev + 1));
  };

  const handleDownloadStatement = () => {
    if (!transactions.length) {
      toast('No transactions available to download');
      return;
    }

    const rows = [
      ['Date', 'Description', 'Method', 'Status', 'Debit', 'Credit', 'Balance'],
      ...transactions.map((txn) => [
        new Date(txn.date).toLocaleDateString(),
        txn.title,
        txn.method,
        txn.status,
        txn.debit ? formatCurrency(txn.debit) : '',
        txn.credit ? formatCurrency(txn.credit) : '',
        formatCurrency(txn.balance),
      ]),
    ];

    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vendor-statement-${details?.name?.replace(/\s+/g, '_') || 'statement'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadVendorDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/vendors/${vendorId}`);
      setVendorDetails(response.data.data);
    } catch (error) {
      console.error('Error loading vendor details:', error);
      toast.error('Failed to load vendor details');
    } finally {
      setLoading(false);
    }
  };

  const loadSpendTrend = async () => {
    try {
      const response = await api.get(`/vendors/${vendorId}/spend-trend`);
      setSpendTrend(response.data.data);
    } catch (error) {
      console.error('Error loading spend trend:', error);
    }
  };

  const handleAddInvoice = () => {
    setShowInvoiceModal(true);
  };

  const handleAddPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  };

  const handleInvoiceSaved = () => {
    setShowInvoiceModal(false);
    loadVendorDetails();
  };

  const handlePaymentSaved = () => {
    setShowPaymentModal(false);
    loadVendorDetails();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', gap: '16px' }}>
        <div className="spinner-premium"></div>
        <p style={{ color: 'var(--muted)', fontWeight: 500 }}>Retrieving partner intelligence...</p>
      </div>
    );
  }

  const details = vendorDetails || vendor || {};

  return (
    <div className="detail-page-container">
      {/* Premium Header */}
      <div className="detail-header">
        <div className="detail-header__title-group">
          <button onClick={onBack} className="back-btn-premium">
            <ArrowLeft size={20} />
          </button>
          <div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <h1 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading, "Space Grotesk")' }}>
                  {details.name}
                </h1>
                {details.vendor_code && (
                  <span className="badge-premium badge-premium--accent" style={{ fontWeight: 800 }}>
                    {details.vendor_code}
                  </span>
                )}
                <span className="badge-premium badge-premium--subtle">
                  {details.category?.replace('_', ' ')}
                </span>
             </div>
             <p style={{ color: 'var(--muted)', fontSize: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} /> Registered Strategic Partner
                {details.created_at && (
                  <span>• Partner since {new Date(details.created_at).toLocaleDateString()}</span>
                )}
             </p>

             <div className="detail-chip-row">
               <span className={`badge-premium ${details.pending_amount > 0 ? 'badge-premium--warning' : 'badge-premium--success'}`}>
                 {details.pending_amount > 0 ? 'Payment pending' : 'Account settled'}
               </span>
               <span className="detail-tag">
                 {details.overdue_invoices ? `${details.overdue_invoices} overdue invoice${details.overdue_invoices > 1 ? 's' : ''}` : 'No overdue invoices'}
               </span>
               <span className="detail-tag">
                 {latestInvoiceDate ? `Last invoice ${latestInvoiceDate}` : 'No invoices yet'}
               </span>
             </div>
          </div>
        </div>
        
        <div className="detail-header-actions">
          {canAdd && (
            <button onClick={handleAddInvoice} className="btn btn-primary btn-sm">
              <Plus size={16} /> New Invoice
            </button>
          )}
          {canEdit && (
            <button onClick={() => onEditVendor(details)} className="btn btn-ghost btn-sm">
              <Edit size={16} /> Edit Profile
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDeleteVendor(details.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>
              <Trash2 size={16} /> Terminate
            </button>
          )}
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="metrics-grid-detail">
        <div className="metric-card-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span className="metric-label-detail">Total Portfolio</span>
            <div className="metric-icon-detail" style={{ color: 'var(--success)' }}><TrendingUp size={18} /></div>
          </div>
          <p className="metric-value-detail" style={{ color: 'var(--success)' }}>{formatCurrency(details.total_spend || 0)}</p>
          <p className="metric-sub-detail">Lifetime volume across all branches</p>
        </div>
        <div className="metric-card-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span className="metric-label-detail">Current Exposure</span>
            <div className="metric-icon-detail" style={{ color: 'var(--error)' }}><AlertCircle size={18} /></div>
          </div>
          <p className="metric-value-detail" style={{ color: 'var(--error)' }}>{formatCurrency(details.pending_amount || 0)}</p>
          <p className="metric-sub-detail">Outstanding accounts payable</p>
        </div>
        <div className="metric-card-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span className="metric-label-detail">Invoicing History</span>
            <div className="metric-icon-detail" style={{ color: 'var(--accent)' }}><FileText size={18} /></div>
          </div>
          <p className="metric-value-detail">{details.total_invoices || 0}</p>
          <p className="metric-sub-detail">Processed procurement documents</p>
        </div>
        <div className="metric-card-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span className="metric-label-detail">Credit Facilities</span>
            <div className="metric-icon-detail" style={{ color: 'var(--warning)' }}><ShieldCheck size={18} /></div>
          </div>
          <p className="metric-value-detail" style={{ color: 'var(--accent)' }}>{formatCurrency(details.credit_limit || 0)}</p>
          <p className="metric-sub-detail">Approved credit ceiling limit</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Entity Dossier - Now at the top */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={18} style={{ color: 'var(--accent)' }} /> Entity Dossier
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            {[
              { label: 'Key Contact', value: details.contact_person, icon: User },
              { label: 'Communication', value: details.phone, icon: Phone },
              { label: 'Digital Mail', value: details.email, icon: Mail },
              { label: 'Taxation ID', value: details.gstin, icon: ShieldCheck },
              { label: 'Operations Base', value: details.city, icon: MapPin },
              { label: 'Financial Terms', value: details.credit_days ? `${details.credit_days} Days Net` : 'Standard', icon: Calendar },
            ].map((item, i) => item.value && (
              <div key={i} style={{ display: 'flex', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', flexShrink: 0 }}>
                  <item.icon size={14} />
                </div>
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>
          
          {details.notes && (
            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'var(--surface-2)', borderRadius: '12px', borderLeft: '4px solid var(--accent)', fontSize: '13px', fontStyle: 'italic', color: 'var(--muted)' }}>
              "{details.notes}"
            </div>
          )}
        </div>

        {/* Chronological History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Ledger / Invoices */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
             <div style={{ padding: '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: 'var(--secondary)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                 <div>
                   <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Procurement Ledger</h3>
                   <p style={{ fontSize: '11px', color: 'var(--muted)' }}>Chronological invoicing records</p>
                 </div>
                 <button onClick={handleAddInvoice} className="btn btn-primary btn-sm">
                   <Plus size={14} /> New Invoice
                 </button>
               </div>
             </div>
             
             <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {details.invoices?.length > 0 ? details.invoices.map(inv => (
                  <div key={inv.id} className="invoice-item">
                    <div className="invoice-row">
                      <div className="invoice-meta">
                        <div className="invoice-title">
                          <span className="invoice-icon"><FileText size={16} /></span>
                          <span style={{ fontWeight: 700 }}>{inv.invoice_number || `INV-${inv.id}`}</span>
                          <span className={`badge-premium badge-premium--${inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : 'error'}`}>
                            {inv.status}
                          </span>
                        </div>
                        <div className="invoice-subtext">
                          {new Date(inv.invoice_date).toLocaleDateString()} • Due {new Date(inv.due_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="invoice-actions">
                        <div className="invoice-amount" style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: 800, color: 'var(--accent)' }}>{formatCurrency(inv.amount)}</p>
                          <p style={{ fontSize: '11px', color: 'var(--muted)' }}>{inv.paid_amount ? `${formatCurrency(inv.paid_amount)} paid` : 'Not settled yet'}</p>
                        </div>
                        {inv.amount - inv.paid_amount > 0 && canAdd && (
                          <button 
                            onClick={() => handleAddPayment(inv)}
                            className="settlement-btn"
                          >
                            <CreditCard size={14} /> Settle
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: '60px 0', textAlign: 'center', opacity: 0.4 }}>
                     <FileText size={32} style={{ margin: '0 auto 8px' }} />
                     <p style={{ fontSize: '13px' }}>No procurement history recorded</p>
                  </div>
                )}
             </div>
          </div>

          {/* Payment Logs */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
             <div style={{ padding: '24px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--secondary)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Financial Settlements</h3>
                <p style={{ fontSize: '11px', color: 'var(--muted)' }}>Outward transaction logs</p>
             </div>
             <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {details.payments?.length > 0 ? details.payments.map(pay => (
                  <div key={pay.id} className="payment-item">
                    <div className="payment-row">
                       <div className="payment-meta">
                          <div className="payment-icon">
                            <CreditCard size={16} />
                          </div>
                          <div>
                             <p className="payment-ref">Ref: {pay.reference_number || pay.id}</p>
                             <p className="payment-subtext">{new Date(pay.payment_date).toLocaleDateString()} • {pay.payment_mode?.replace('_', ' ')}</p>
                          </div>
                       </div>
                       <p className="payment-amount">{formatCurrency(pay.amount)}</p>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.4 }}>
                     <p style={{ fontSize: '13px', fontStyle: 'italic' }}>No transaction records found</p>
                  </div>
                )}
             </div>
          </div>

          {/* Transaction Activity */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
             <div style={{ padding: '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: 'var(--secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Transaction Activity</h3>
                    <p style={{ fontSize: '11px', color: 'var(--muted)' }}>Complete transaction history</p>
                  </div>
                  <button onClick={handleDownloadStatement} className="btn btn-secondary btn-sm">
                    <FileText size={14} /> Download Statement
                  </button>
                </div>
             </div>
             <div className="transaction-table-wrap" style={{ padding: '16px' }}>
               {displayedTransactions.length > 0 ? (
                 <>
                   <div className="transaction-table-scroll">
                     <table className="transaction-table">
                       <thead>
                         <tr>
                           <th>Date</th>
                           <th>Description</th>
                           <th>Method</th>
                           <th>Status</th>
                           <th style={{ textAlign: 'right' }}>Debit</th>
                           <th style={{ textAlign: 'right' }}>Credit</th>
                           <th style={{ textAlign: 'right' }}>Balance</th>
                         </tr>
                       </thead>
                       <tbody>
                         {displayedTransactions.map((txn) => (
                           <tr key={`${txn.type}-${txn.id}`}>
                             <td>{new Date(txn.date).toLocaleDateString()}</td>
                             <td>
                               <div className="transaction-title">{txn.title}</div>
                               <div className="transaction-subtext">{txn.note}</div>
                             </td>
                             <td><span className="transaction-pill">{txn.method}</span></td>
                             <td><span className={`transaction-pill transaction-pill--${txn.type.toLowerCase()}`}>{txn.status}</span></td>
                             <td style={{ textAlign: 'right' }}>{txn.debit ? formatCurrency(txn.debit) : '—'}</td>
                             <td style={{ textAlign: 'right' }}>{txn.credit ? formatCurrency(txn.credit) : '—'}</td>
                             <td style={{ textAlign: 'right' }}>{formatCurrency(txn.balance)}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                   <div className="transaction-pagination">
                     <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                       Showing {(currentPage - 1) * transactionsPerPage + 1} to {Math.min(currentPage * transactionsPerPage, transactions.length)} of {transactions.length}
                     </div>
                     <div className="pagination-controls">
                       <button disabled={currentPage === 1} onClick={handlePrevPage} className="btn btn-secondary btn-sm">
                         Previous
                       </button>
                       <span className="pagination-meta">Page {currentPage} of {pageCount}</span>
                       <button disabled={currentPage === pageCount} onClick={handleNextPage} className="btn btn-secondary btn-sm">
                         Next
                       </button>
                     </div>
                   </div>
                 </>
               ) : (
                 <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.4 }}>
                   <p style={{ fontSize: '13px', fontStyle: 'italic' }}>No transaction activity available</p>
                 </div>
               )}
             </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showInvoiceModal && (
        <InvoiceModal
          vendor={details}
          onClose={() => setShowInvoiceModal(false)}
          onSave={handleInvoiceSaved}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          invoice={selectedInvoice}
          onClose={() => setShowPaymentModal(false)}
          onSave={handlePaymentSaved}
        />
      )}
    </div>
  );
};

export default VendorDetail;
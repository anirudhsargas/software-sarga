import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import InvoiceModal from './InvoiceModal';
import PaymentModal from './PaymentModal';
import { 
  ArrowLeft, Plus, FileText, CreditCard, 
  TrendingUp, Edit, Trash2, User, 
  Phone, Mail, MapPin, Calendar, 
  ShieldCheck, AlertCircle, Info, ChevronRight, RotateCcw, FileEdit,
  Save
} from 'lucide-react';
import '../pages/Vendors.css';

const VendorDetail = ({
  vendor,
  onBack,
  onEditVendor,
  onDeleteVendor,
  formatCurrency,
  _getStatusBadge,
  refreshKey = 0,
  canEdit = true,
  canDelete = true,
  canAdd = true
}) => {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const vendorId = vendor?.id || routeId;
  const [vendorDetails, setVendorDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [draftInvoices, setDraftInvoices] = useState([]);
  const [_spendTrend, setSpendTrend] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [balanceDiscrepancy, setBalanceDiscrepancy] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  const transactionsPerPage = 10;

  const getLatestRecordDate = (items, dateKey) => {
    if (!items?.length) return null;
    const sorted = [...items].sort((a, b) => new Date(b[dateKey]) - new Date(a[dateKey]));
    return sorted[0]?.[dateKey] ? new Date(sorted[0][dateKey]).toLocaleDateString() : null;
  };

  const latestInvoiceDate = getLatestRecordDate(vendorDetails?.invoices || vendor?.invoices, 'invoice_date');
  const _latestPaymentDate = getLatestRecordDate(vendorDetails?.payments || vendor?.payments, 'payment_date');

  const rawTransactions = [
    ...(vendorDetails?.invoices || vendor?.invoices || []).filter(inv => inv.status !== 'draft').map((inv) => ({
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

  const transactions = useMemo(() => {
    const withBalance = rawTransactions.reduce((acc, txn) => {
      const prevBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
      const newBalance = prevBalance + (txn.type === 'Debit' ? txn.amount : -txn.amount);
      acc.push({
        ...txn,
        debit: txn.type === 'Debit' ? txn.amount : 0,
        credit: txn.type === 'Credit' ? txn.amount : 0,
        balance: newBalance,
      });
      return acc;
    }, []);
    return withBalance.reverse();
  }, [rawTransactions]);

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
      if (String(vendorId).startsWith('VEND-')) {
        toast.error('Local pending vendor — not yet synced to server');
        setLoading(false);
        return;
      }
      const response = await api.get(`/vendors/${vendorId}`);
      setVendorDetails(response.data.data);
      // Load draft invoices
      try {
        const draftRes = await api.get(`/vendor-invoices/drafts/list?vendor_id=${vendorId}`);
        setDraftInvoices(draftRes.data.data || []);
      } catch (_) {
        setDraftInvoices([]);
      }
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

  const checkBalanceDiscrepancy = async () => {
    try {
      const response = await api.get('/vendors/payment-audit');
      const discrepancies = response.data?.data || [];
      const vendorDiscrepancy = discrepancies.find(d => d.id === Number(vendorId));
      if (vendorDiscrepancy && Math.abs(Number(vendorDiscrepancy.discrepancy)) > 0.01) {
        setBalanceDiscrepancy(vendorDiscrepancy);
      } else {
        setBalanceDiscrepancy(null);
      }
    } catch (error) {
      console.error('Error checking balance discrepancy:', error);
    }
  };

  const handleRecalculateBalance = async () => {
    try {
      setRecalculating(true);
      const response = await api.post(`/vendors/${vendorId}/recalculate`);
      if (response.data?.success) {
        toast.success(`Balance recalculated: ${formatCurrency(response.data.current_balance)}`);
        setBalanceDiscrepancy(null);
        loadVendorDetails();
      }
    } catch (error) {
      console.error('Error recalculating balance:', error);
      toast.error('Failed to recalculate balance');
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => {
    loadVendorDetails();
    loadSpendTrend();
    checkBalanceDiscrepancy();
  }, [vendorId, refreshKey]);

  const handleAddInvoice = () => {
    setEditingInvoice(null);
    setShowInvoiceModal(true);
  };

  const handleEditDraft = async (draft) => {
    try {
      const res = await api.get(`/vendor-invoices/${draft.id}`);
      setEditingInvoice(res.data.data);
      setShowInvoiceModal(true);
    } catch (error) {
      toast.error('Failed to load draft');
    }
  };

  const handleAddPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  };

  const handleInvoiceSaved = () => {
    setShowInvoiceModal(false);
    setEditingInvoice(null);
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
                <h1 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>
                  {details.name}
                </h1>
                {details.vendor_code && (
                  <span className="badge badge--pill badge--primary" style={{ fontWeight: 800 }}>
                    {details.vendor_code}
                  </span>
                )}
                <span className="badge badge--pill badge--subtle">
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
                <span className={`badge badge--pill badge--${details.pending_amount > 0 ? 'warning' : 'success'}`}>
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
          <button onClick={() => navigate(`/dashboard/vendors/${details.id}/ledger`)} className="btn btn-ghost btn-sm">
            View Ledger
          </button>
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
            <span className="metric-label-detail">Outstanding Balance</span>
            <div className="metric-icon-detail" style={{ color: 'var(--warning)' }}><AlertCircle size={18} /></div>
          </div>
          <p className="metric-value-detail" style={{
            color: !details.pending_amount || details.pending_amount <= 0
              ? 'var(--success)'
              : details.credit_limit > 0 && details.pending_amount >= details.credit_limit
                ? 'var(--error)'
                : 'var(--warning)'
          }}>
            {formatCurrency(details.pending_amount || 0)}
          </p>
          <p className="metric-sub-detail">
            {!details.pending_amount || details.pending_amount <= 0
              ? 'Account in good standing'
              : details.credit_limit > 0
                ? `${((details.pending_amount / details.credit_limit) * 100).toFixed(0)}% of ₹${Number(details.credit_limit).toLocaleString()} credit limit used`
                : 'Outstanding accounts payable'}
          </p>
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

      {/* Balance Discrepancy Warning */}
      {balanceDiscrepancy && (
        <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--error)', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={20} style={{ color: 'var(--error)', flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--error)' }}>Balance Discrepancy Detected</p>
                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Stored balance: <strong>{formatCurrency(balanceDiscrepancy.stored_balance)}</strong> &middot;
                  Calculated balance: <strong>{formatCurrency(balanceDiscrepancy.calculated_balance)}</strong> &middot;
                  Difference: <strong style={{ color: 'var(--error)' }}>{formatCurrency(Math.abs(balanceDiscrepancy.discrepancy))}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={handleRecalculateBalance}
              disabled={recalculating}
              className="btn btn-primary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              <RotateCcw size={14} /> {recalculating ? 'Recalculating...' : 'Recalculate Balance'}
            </button>
          </div>
        </div>
      )}

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
              { label: 'GST Number (GSTIN)', value: details.gst_number || details.gstin, icon: ShieldCheck },
              { label: 'Operations Base', value: details.city, icon: MapPin },
              { label: 'Opening Balance', value: details.opening_balance ? `₹${Number(details.opening_balance).toLocaleString('en-IN')}` : null, icon: Calendar },
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
             
              {/* Draft Bills Section */}
              {draftInvoices.length > 0 && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Save size={16} style={{ color: 'var(--warning)' }} />
                    <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: 'var(--warning)' }}>
                      Draft Bills ({draftInvoices.length})
                    </h4>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>— Complete or edit these drafts</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {draftInvoices.map(draft => (
                      <div key={draft.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', background: 'var(--surface)', borderRadius: 10,
                        border: '1px dashed var(--warning)', cursor: 'pointer'
                      }}
                        onClick={() => handleEditDraft(draft)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEditDraft(draft); }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <FileEdit size={16} style={{ color: 'var(--warning)' }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {draft.invoice_number || `Draft INV-${draft.id}`}
                              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>
                                {new Date(draft.invoice_date).toLocaleDateString()}
                              </span>
                            </div>
                            {draft.notes && (
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{draft.notes}</div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {draft.amount ? formatCurrency(draft.amount) : 'No amount'}
                          </span>
                          <Edit size={14} style={{ color: 'var(--accent)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {(details.invoices || []).filter(inv => inv.status !== 'draft').length > 0 ? (details.invoices || []).filter(inv => inv.status !== 'draft').map(inv => (
                   <div key={inv.id} className="invoice-item">
                     <div className="invoice-row">
                       <div className="invoice-meta">
                         <div className="invoice-title">
                           <span className="invoice-icon"><FileText size={16} /></span>
                           <span style={{ fontWeight: 700 }}>{inv.invoice_number || `INV-${inv.id}`}</span>
                           <span className={`badge badge--pill badge--${inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : 'danger'}`}>
                             {inv.status}
                           </span>
                         </div>
                         <div className="invoice-subtext">
                           {new Date(inv.invoice_date).toLocaleDateString()}{inv.due_date ? ` • Due ${new Date(inv.due_date).toLocaleDateString()}` : ''}
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
          invoice={editingInvoice}
          onClose={() => { setShowInvoiceModal(false); setEditingInvoice(null); }}
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
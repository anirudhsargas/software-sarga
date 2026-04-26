import React, { useState, useEffect } from 'react';
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

const VendorDetail = ({
  vendor,
  onBack,
  onEditVendor,
  onDeleteVendor,
  formatCurrency,
  getStatusBadge
}) => {
  const [vendorDetails, setVendorDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [spendTrend, setSpendTrend] = useState([]);

  useEffect(() => {
    loadVendorDetails();
    loadSpendTrend();
  }, [vendor.id]);

  const loadVendorDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/vendors/${vendor.id}`);
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
      const response = await api.get(`/vendors/${vendor.id}/spend-trend`);
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
      <div className="flex flex-col items-center justify-center h-400 gap-16">
        <div className="spinner-premium"></div>
        <p className="text-muted font-500">Retrieving partner intelligence...</p>
      </div>
    );
  }

  const details = vendorDetails || vendor;

  return (
    <div className="detail-page-container">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-24 mb-32">
        <div className="flex items-center gap-20">
          <button onClick={onBack} className="back-btn-premium">
            <ArrowLeft size={20} />
          </button>
          <div>
             <div className="flex items-center gap-12 mb-4">
                <h1 className="text-32 font-700 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                  {details.name}
                </h1>
                {details.vendor_code && (
                  <span className="badge-premium badge-premium--accent font-800">
                    {details.vendor_code}
                  </span>
                )}
                <span className="badge-premium">
                  {details.category?.replace('_', ' ')}
                </span>
             </div>
             <p className="text-muted text-14 flex items-center gap-6">
                <ShieldCheck size={14} /> Registered Strategic Partner
             </p>
          </div>
        </div>
        
        <div className="flex gap-12">
          <button onClick={() => onEditVendor(details)} className="btn btn-ghost px-20">
            <Edit size={16} /> Edit Profile
          </button>
          <button onClick={() => onDeleteVendor(details.id)} className="btn btn-ghost text-error px-20">
            <Trash2 size={16} /> Termination
          </button>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="metrics-grid-detail mb-32">
        <div className="metric-card-detail">
          <div className="flex justify-between items-start mb-12">
            <span className="metric-label-detail">Total Portfolio</span>
            <div className="metric-icon-detail text-success"><TrendingUp size={18} /></div>
          </div>
          <p className="metric-value-detail text-success">{formatCurrency(details.total_spend || 0)}</p>
          <p className="metric-sub-detail">Lifetime volume across all branches</p>
        </div>
        <div className="metric-card-detail">
          <div className="flex justify-between items-start mb-12">
            <span className="metric-label-detail">Current Exposure</span>
            <div className="metric-icon-detail text-error"><AlertCircle size={18} /></div>
          </div>
          <p className="metric-value-detail text-error">{formatCurrency(details.pending_amount || 0)}</p>
          <p className="metric-sub-detail">Outstanding accounts payable</p>
        </div>
        <div className="metric-card-detail">
          <div className="flex justify-between items-start mb-12">
            <span className="metric-label-detail">Invoicing History</span>
            <div className="metric-icon-detail text-accent"><FileText size={18} /></div>
          </div>
          <p className="metric-value-detail">{details.total_invoices || 0}</p>
          <p className="metric-sub-detail">Processed procurement documents</p>
        </div>
        <div className="metric-card-detail">
          <div className="flex justify-between items-start mb-12">
            <span className="metric-label-detail">Credit Facilities</span>
            <div className="metric-icon-detail text-warning"><ShieldCheck size={18} /></div>
          </div>
          <p className="metric-value-detail text-accent">{formatCurrency(details.credit_limit || 0)}</p>
          <p className="metric-sub-detail">Approved credit ceiling limit</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-32">
        {/* Profile Sidebar */}
        <div className="lg:col-span-4 space-y-24">
          <div className="glass-card p-24">
            <h3 className="text-16 font-700 mb-20 flex items-center gap-8">
              <Info size={18} className="text-accent" /> Entity Dossier
            </h3>
            <div className="space-y-16">
              {[
                { label: 'Key Contact', value: details.contact_person, icon: User },
                { label: 'Communication', value: details.phone, icon: Phone },
                { label: 'Digital Mail', value: details.email, icon: Mail },
                { label: 'Taxation ID', value: details.gstin, icon: ShieldCheck },
                { label: 'Operations Base', value: details.city, icon: MapPin },
                { label: 'Financial Terms', value: details.credit_days ? `${details.credit_days} Days Net` : 'Standard', icon: Calendar },
              ].map((item, i) => item.value && (
                <div key={i} className="flex gap-12">
                  <div className="w-32 h-32 rounded-8 bg-surface-2 flex items-center justify-center text-muted shrink-0">
                    <item.icon size={14} />
                  </div>
                  <div>
                    <p className="text-11 font-600 text-muted uppercase tracking-wider">{item.label}</p>
                    <p className="text-14 font-700 text-accent">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
            
            {details.notes && (
              <div className="mt-24 p-16 bg-surface-2 rounded-12 border-l-4 border-accent text-13 italic text-muted">
                "{details.notes}"
              </div>
            )}
          </div>
        </div>

        {/* Chronological History */}
        <div className="lg:col-span-8 space-y-32">
          {/* Ledger / Invoices */}
          <div className="glass-card overflow-hidden">
             <div className="p-24 border-b border-subtle flex justify-between items-center bg-surface-2/30">
               <div>
                 <h3 className="text-16 font-700">Procurement Ledger</h3>
                 <p className="text-11 text-muted">Chronological invoicing records</p>
               </div>
               <button onClick={handleAddInvoice} className="btn btn-primary btn-sm px-16 h-36">
                 <Plus size={14} /> New Invoice
               </button>
             </div>
             
             <div className="p-16 space-y-12">
                {details.invoices?.map(inv => (
                  <div key={inv.id} className="p-16 bg-surface-2/50 rounded-20 border border-subtle hover:border-accent-soft transition-all group cursor-default">
                    <div className="flex justify-between items-start">
                       <div className="flex items-center gap-12">
                          <div className="w-40 h-40 rounded-12 bg-surface-1 flex items-center justify-center text-accent">
                            <FileText size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-8">
                               <p className="text-14 font-700">{inv.invoice_number || `INV-${inv.id}`}</p>
                               <span className={`badge-premium badge-premium--${inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : 'error'}`}>
                                 {inv.status}
                               </span>
                            </div>
                            <p className="text-11 text-muted font-600 uppercase tracking-tighter mt-2">
                              {new Date(inv.invoice_date).toLocaleDateString()} • Due {new Date(inv.due_date).toLocaleDateString()}
                            </p>
                          </div>
                       </div>
                       
                       <div className="text-right">
                          <p className="text-16 font-800 text-accent">{formatCurrency(inv.amount)}</p>
                          {inv.amount - inv.paid_amount > 0 && (
                            <button 
                              onClick={() => handleAddPayment(inv)}
                              className="mt-6 text-12 font-700 text-success flex items-center gap-4 hover:underline ml-auto"
                            >
                              <CreditCard size={12} /> Settlement <ChevronRight size={12} />
                            </button>
                          )}
                       </div>
                    </div>
                  </div>
                ))}
                {(!details.invoices || details.invoices.length === 0) && (
                  <div className="py-60 text-center opacity-30">
                     <FileText size={32} className="mx-auto mb-8" />
                     <p className="text-13">No procurement history recorded</p>
                  </div>
                )}
             </div>
          </div>

          {/* Payment Logs */}
          <div className="glass-card overflow-hidden">
             <div className="p-24 border-b border-subtle bg-surface-2/30">
                <h3 className="text-16 font-700">Financial Settlements</h3>
                <p className="text-11 text-muted">Outward transaction logs</p>
             </div>
             <div className="p-16 space-y-12">
                {details.payments?.map(pay => (
                  <div key={pay.id} className="p-16 bg-surface-2/40 rounded-20 border border-subtle flex justify-between items-center">
                    <div className="flex items-center gap-12">
                       <div className="w-40 h-40 rounded-12 bg-success-bg text-success flex items-center justify-center">
                         <CreditCard size={18} />
                       </div>
                       <div>
                          <p className="text-14 font-700">Ref: {pay.reference_number || pay.id}</p>
                          <p className="text-11 text-muted font-600 uppercase tracking-tighter mt-2">
                            {new Date(pay.payment_date).toLocaleDateString()} • {pay.payment_mode?.replace('_', ' ')}
                          </p>
                       </div>
                    </div>
                    <p className="text-16 font-800 text-success">{formatCurrency(pay.amount)}</p>
                  </div>
                ))}
                {(!details.payments || details.payments.length === 0) && (
                  <div className="py-40 text-center opacity-30">
                     <p className="text-13 italic">No transaction records found</p>
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

      <style jsx>{`
        .detail-page-container { animation: fade-in 0.6s ease-out; }
        .mb-32 { margin-bottom: 32px; }
        .mb-24 { margin-bottom: 24px; }
        .mb-20 { margin-bottom: 20px; }
        .mb-16 { margin-bottom: 16px; }
        .mb-12 { margin-bottom: 12px; }
        .mb-8 { margin-bottom: 8px; }
        .mb-4 { margin-bottom: 4px; }
        .p-24 { padding: 24px; }
        .p-16 { padding: 16px; }
        .gap-24 { gap: 24px; }
        .gap-20 { gap: 20px; }
        .gap-12 { gap: 12px; }
        .gap-8 { gap: 8px; }
        
        .back-btn-premium {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          display: grid;
          place-items: center;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text-muted);
        }
        .back-btn-premium:hover {
          background: var(--accent);
          color: var(--on-accent);
          transform: translateX(-4px);
        }

        .metrics-grid-detail {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 24px;
        }

        .metric-card-detail {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          padding: 24px;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .metric-card-detail:hover { transform: translateY(-4px); }

        .metric-label-detail {
          font-size: 12px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .metric-value-detail {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .metric-sub-detail {
          font-size: 11px;
          color: var(--muted);
          margin-top: 4px;
          font-weight: 500;
        }

        .glass-card {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          box-shadow: var(--shadow-sm);
        }

        .badge-premium {
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-premium--accent { background: var(--accent-soft); color: var(--accent); }
        .badge-premium--success { background: var(--success-bg); color: var(--success); }
        .badge-premium--warning { background: var(--warning-bg); color: var(--warning); }
        .badge-premium--error { background: var(--error-bg); color: var(--error); }

        .spinner-premium {
          width: 44px;
          height: 44px;
          border: 3px solid var(--accent-soft);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default VendorDetail;
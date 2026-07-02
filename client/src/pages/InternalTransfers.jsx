import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState, useEffect } from 'react';
import { BookOpen, Building2, ArrowRightCircle, Loader2, Plus, Search, X, TrendingUp, Clock, CheckCircle, ArrowRight, ArrowDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';
import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
import './InternalTransfers.css';

const BOOK_TYPES = [
  { key: 'Offset', label: 'Offset' },
  { key: 'Laser', label: 'Laser' },
  { key: 'Other', label: 'Other' }
];

const transferSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  fromBook: z.string().min(1, 'From Book is required'),
  toBook: z.string().min(1, 'To Book is required'),
  amount: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number({ required_error: 'Amount is required', invalid_type_error: 'Amount must be a number' })
      .positive('Amount must be positive')
  ),
  note: z.string().optional()
}).refine(data => data.fromBook !== data.toBook, {
  message: "Source and destination books must be different",
  path: ["toBook"]
});

const InternalTransfers = () => {
  usePageTitle('Internal Transfers');

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  const [branches, setBranches] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [branchFilter, setBranchFilter] = useState(isAdmin ? '' : String(user?.branch_id || ''));
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('idle'); // 'idle' | 'loading' | 'success'

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      branchId: isAdmin ? '' : String(user?.branch_id || ''),
      fromBook: 'Offset',
      toBook: 'Laser',
      amount: '',
      note: ''
    }
  });

  const loading = submitStatus === 'loading';

  useEffect(() => {
    if (isAdmin) fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchTransfers(branchFilter);
  }, [branchFilter]);

  async function fetchBranches() {
    try {
      const res = await api.get('/branches');
      setBranches(res.data || []);
    } catch (e) {
      console.error('Failed to load branches', e);
    }
  }

  async function fetchTransfers(bId) {
    try {
      const res = await api.get('/internal-transfers', { params: { branch_id: bId || undefined } });
      setTransfers(res.data || []);
    } catch (e) {
      console.error('Failed to load transfers', e);
    }
  }

  const onSubmit = async (data) => {
    setSubmitStatus('loading');
    try {
      await api.post('/internal-transfers', {
        branch_id: data.branchId || undefined,
        from_book_type: data.fromBook,
        to_book_type: data.toBook,
        amount: Number(data.amount),
        note: data.note || null
      });
      setSubmitStatus('success');
      toast.success('Transfer recorded successfully!');
      
      // Auto close and reset after showing success state
      setTimeout(() => {
        setSubmitStatus('idle');
        reset({
          branchId: isAdmin ? '' : String(user?.branch_id || ''),
          fromBook: 'Offset',
          toBook: 'Laser',
          amount: '',
          note: ''
        });
        setShowForm(false);
      }, 1500);

      fetchTransfers(branchFilter);
    } catch (err) {
      console.error(err);
      setSubmitStatus('idle');
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to create transfer');
    }
  };

  // Dynamic statistics calculations
  const totalAmountToday = transfers
    .filter(t => {
      const todayStr = new Date().toDateString();
      const tDateStr = new Date(t.created_at).toDateString();
      return todayStr === tDateStr;
    })
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const successfulCount = transfers.length;
  const pendingCount = submitStatus === 'loading' ? 1 : 0;
  const uniqueBooks = new Set(
    transfers.flatMap(t => [t.from_book_type, t.to_book_type])
  ).size || BOOK_TYPES.length;

  // Search and status filtering logic
  const filteredTransfers = transfers.filter(t => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      t.note?.toLowerCase().includes(searchLower) ||
      t.from_book_type?.toLowerCase().includes(searchLower) ||
      t.to_book_type?.toLowerCase().includes(searchLower) ||
      String(t.amount).includes(searchLower) ||
      (t.branch_name && t.branch_name.toLowerCase().includes(searchLower));

    const matchesStatus = statusFilter === 'All' || statusFilter === 'Synced';

    return matchesSearch && matchesStatus;
  });

  return (
    <PageContainer>
      <div className="it-container">
        
        {/* 1. Page Header */}
        <div className="it-header">
          <div className="it-header-left">
            <div className="it-header-title-row">
              <BookOpen className="it-header-title-icon" size={24} />
              <h1>Internal Transfers</h1>
            </div>
            <p className="it-header-subtitle">
              Move funds between cash books and bank accounts across branches.
            </p>
          </div>
          <div className="it-header-actions">
            <button 
              className={`btn-premium ${showForm ? 'btn-premium-ghost' : 'btn-premium-primary'}`}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? (
                <>
                  <X size={16} style={{ marginRight: '8px' }} />
                  Close Form
                </>
              ) : (
                <>
                  <Plus size={16} style={{ marginRight: '8px' }} />
                  New Transfer
                </>
              )}
            </button>
          </div>
        </div>

        {/* 9. Quick Statistics */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-card-content">
              <span className="kpi-label">Today's Transfers</span>
              <span className="kpi-value">₹{totalAmountToday.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="kpi-icon-wrapper">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-content">
              <span className="kpi-label">Pending</span>
              <span className="kpi-value">{pendingCount}</span>
            </div>
            <div className="kpi-icon-wrapper">
              <Clock size={20} />
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-content">
              <span className="kpi-label">Successful</span>
              <span className="kpi-value">{successfulCount}</span>
            </div>
            <div className="kpi-icon-wrapper">
              <CheckCircle size={20} />
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-content">
              <span className="kpi-label">Books</span>
              <span className="kpi-value">{uniqueBooks}</span>
            </div>
            <div className="kpi-icon-wrapper">
              <BookOpen size={20} />
            </div>
          </div>
        </div>

        {/* 2. Transfer Form Card */}
        <div 
          className="it-form-collapse-wrapper"
          style={{ 
            maxHeight: showForm ? '800px' : '0', 
            opacity: showForm ? 1 : 0,
            marginBottom: showForm ? 'var(--space-24)' : '0'
          }}
        >
          <div className="it-card fade-in">
            <h2 className="it-card-title">New Internal Transfer</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="stack-premium" noValidate>
              
              {isAdmin ? (
                <div>
                  <label htmlFor="branchId" className="label-premium">Branch *</label>
                  <BranchSelect 
                    id="branchId"
                    className="input-field-premium" 
                    {...register('branchId')}
                  >
                    <option value="">Select Branch</option>
                    {branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                  </BranchSelect>
                  {errors.branchId && (
                    <p style={{ color: 'var(--danger, #f87171)', fontSize: '12px', marginTop: '6px' }}>
                      {errors.branchId.message}
                    </p>
                  )}
                </div>
              ) : (
                <input type="hidden" value={String(user?.branch_id || '')} {...register('branchId')} />
              )}

              {/* 4. & 11. Transfer Direction */}
              <div className="transfer-direction-row">
                <div className="book-select-group">
                  <label htmlFor="fromBook" className="label-premium">From Book *</label>
                  <select id="fromBook" className="input-field-premium" {...register('fromBook')}>
                    {BOOK_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                  {errors.fromBook && (
                    <p style={{ color: 'var(--danger, #f87171)', fontSize: '12px', marginTop: '6px' }}>
                      {errors.fromBook.message}
                    </p>
                  )}
                </div>

                <div className="transfer-arrow-wrapper">
                  <div className="arrow-circle">
                    <ArrowRight className="arrow-icon arrow-right" size={18} />
                    <ArrowDown className="arrow-icon arrow-down" size={18} />
                  </div>
                </div>

                <div className="book-select-group">
                  <label htmlFor="toBook" className="label-premium">To Book *</label>
                  <select id="toBook" className="input-field-premium" {...register('toBook')}>
                    {BOOK_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                  {errors.toBook && (
                    <p style={{ color: 'var(--danger, #f87171)', fontSize: '12px', marginTop: '6px' }}>
                      {errors.toBook.message}
                    </p>
                  )}
                </div>
              </div>

              {/* 3. Improve Inputs (Amount field with rupee prefix) */}
              <div>
                <label htmlFor="amount" className="label-premium">Amount *</label>
                <div className="amount-input-container">
                  <span className="amount-input-prefix">₹</span>
                  <input 
                    id="amount" 
                    className="amount-input-field" 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00"
                    {...register('amount')}
                  />
                </div>
                {errors.amount && (
                  <p style={{ color: 'var(--danger, #f87171)', fontSize: '12px', marginTop: '6px' }}>
                    {errors.amount.message}
                  </p>
                )}
              </div>

              {/* Note field */}
              <div>
                <label htmlFor="note" className="label-premium">Note (optional)</label>
                <input 
                  id="note" 
                  className="input-field-premium" 
                  placeholder="Describe the transaction..." 
                  {...register('note')} 
                />
                {errors.note && (
                  <p style={{ color: 'var(--danger, #f87171)', fontSize: '12px', marginTop: '6px' }}>
                    {errors.note.message}
                  </p>
                )}
              </div>

              {/* 5. Submit Button */}
              <div className="form-actions-premium">
                <button 
                  type="button" 
                  className="btn-premium btn-premium-ghost" 
                  disabled={loading || submitStatus === 'success'}
                  onClick={() => {
                    reset({
                      branchId: isAdmin ? '' : String(user?.branch_id || ''),
                      fromBook: 'Offset',
                      toBook: 'Laser',
                      amount: '',
                      note: ''
                    });
                  }}
                >
                  Reset
                </button>

                <button 
                  className={`btn-premium btn-premium-primary btn-submit-premium ${submitStatus === 'success' ? 'btn-premium-success' : ''}`} 
                  disabled={loading || submitStatus === 'success'} 
                  type="submit"
                >
                  {submitStatus === 'loading' ? (
                    <>
                      <Loader2 size={16} className="animate-spin" style={{ display: 'inline', marginRight: '8px' }} />
                      Saving...
                    </>
                  ) : submitStatus === 'success' ? (
                    <>
                      <span className="success-checkmark">✓</span>
                      Recorded!
                    </>
                  ) : (
                    <>
                      <span style={{ marginRight: '8px', fontWeight: 'bold' }}>↗</span>
                      Transfer Funds
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* 6. Recent Transfers Section Card */}
        <div className="recent-transfers-card">
          <div className="recent-transfers-header">
            <div>
              <h3>Recent Transfers</h3>
              <p className="recent-transfers-subtitle">Last transfers between books.</p>
            </div>
          </div>

          {/* Filters container */}
          <div className="filters-container">
            <div className="search-wrapper">
              <Search className="search-icon" size={16} />
              <input 
                type="text" 
                placeholder="Search notes, routes, or amounts..." 
                className="search-input" 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="filters-right">
              {isAdmin && (
                <div className="filter-select-wrapper">
                  <BranchSelect 
                    className="filter-select" 
                    value={branchFilter} 
                    onChange={e => setBranchFilter(e.target.value)}
                  >
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                  </BranchSelect>
                </div>
              )}

              <div className="filter-select-wrapper">
                <select 
                  className="filter-select" 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="Synced">Synced</option>
                  <option value="Syncing">Syncing</option>
                  <option value="Processing">Processing</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>
            </div>
          </div>

          {/* 10. Better Empty State */}
          {transfers.length === 0 ? (
            <div className="empty-state-container fade-in">
              <div className="empty-state-icon">📖</div>
              <h4 className="empty-state-title">No transfers yet</h4>
              <p className="empty-state-description">Create your first internal transfer to move funds between books.</p>
              <button className="btn-premium btn-premium-primary" onClick={() => setShowForm(true)}>
                New Transfer
              </button>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="empty-state-container fade-in">
              <div className="empty-state-icon">🔍</div>
              <h4 className="empty-state-title">No matching transfers</h4>
              <p className="empty-state-description">Try adjusting your search query or filters.</p>
              <button 
                className="btn-premium btn-premium-ghost" 
                onClick={() => { setSearchTerm(''); setStatusFilter('All'); }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            /* 8. Table Improvements */
            <div className="table-scroll-premium fade-in">
              <table className="table-premium">
                <thead>
                  <tr>
                    <th>Date</th>
                    {isAdmin && <th>Branch</th>}
                    <th>Route</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransfers.map(t => (
                    <tr key={t.id}>
                      <td className="font-mono text-xs">
                        {new Date(t.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      {isAdmin && (
                        <td style={{ fontWeight: '500' }}>
                          {t.branch_name || `Branch #${t.branch_id}`}
                        </td>
                      )}
                      <td>
                        <div className="route-cell">
                          <span className="book-badge">{t.from_book_type}</span>
                          <span className="route-arrow">→</span>
                          <span className="book-badge">{t.to_book_type}</span>
                        </div>
                      </td>
                      <td className="text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                        ₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {/* 7. Status Badge */}
                      <td>
                        <span className="status-badge synced">
                          <span className="status-dot" />
                          Synced
                        </span>
                      </td>
                      <td className="note-cell text-sm" title={t.note}>
                        {t.note || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </PageContainer>
  );
};

export default InternalTransfers;

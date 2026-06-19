import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState, useEffect } from 'react';
import { BookOpen, Building2, ArrowRightCircle, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';
import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';

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
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [branchFilter, setBranchFilter] = useState(isAdmin ? '' : String(user?.branch_id || ''));

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      branchId: isAdmin ? '' : String(user?.branch_id || ''),
      fromBook: 'Offset',
      toBook: 'Laser',
      amount: '',
      note: ''
    }
  });

  useEffect(() => {
    if (isAdmin) fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchTransfers(branchFilter);
  }, [branchFilter]);

  const fetchBranches = async () => {
    try {
      const res = await api.get('/branches');
      setBranches(res.data || []);
    } catch (e) {
      console.error('Failed to load branches', e);
    }
  };

  const fetchTransfers = async (bId) => {
    try {
      const res = await api.get('/internal-transfers', { params: { branch_id: bId || undefined } });
      setTransfers(res.data || []);
    } catch (e) {
      console.error('Failed to load transfers', e);
    }
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await api.post('/internal-transfers', {
        branch_id: data.branchId || undefined,
        from_book_type: data.fromBook,
        to_book_type: data.toBook,
        amount: Number(data.amount),
        note: data.note || null
      });
      toast.success('Transfer recorded successfully!');
      reset({
        branchId: isAdmin ? '' : String(user?.branch_id || ''),
        fromBook: 'Offset',
        toBook: 'Laser',
        amount: '',
        note: ''
      });
      fetchTransfers(branchFilter);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to create transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <div className="panel-header">
        <BookOpen size={18} />
        <h2>Internal Transfers</h2>
      </div>

      <div className="form-section">
        <form onSubmit={handleSubmit(onSubmit)} className="stack-md" noValidate>
          {isAdmin ? (
            <div>
              <label htmlFor="branchId" className="label">Branch *</label>
              <BranchSelect 
                id="branchId"
                className="input-field" 
                {...register('branchId')}
              >
                <option value="">Select Branch</option>
                {branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
              </BranchSelect>
              {errors.branchId && (
                <p style={{ color: 'var(--error, #e53e3e)', fontSize: '12px', marginTop: '4px' }}>
                  {errors.branchId.message}
                </p>
              )}
            </div>
          ) : (
            <input type="hidden" value={String(user?.branch_id || '')} {...register('branchId')} />
          )}

          <div className="form-row form-row--3">
            <div>
              <label htmlFor="fromBook" className="label">From Book *</label>
              <select id="fromBook" className="input-field" {...register('fromBook')}>
                {BOOK_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
              {errors.fromBook && (
                <p style={{ color: 'var(--error, #e53e3e)', fontSize: '12px', marginTop: '4px' }}>
                  {errors.fromBook.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="toBook" className="label">To Book *</label>
              <select id="toBook" className="input-field" {...register('toBook')}>
                {BOOK_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
              {errors.toBook && (
                <p style={{ color: 'var(--error, #e53e3e)', fontSize: '12px', marginTop: '4px' }}>
                  {errors.toBook.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="amount" className="label">Amount (₹) *</label>
              <input 
                id="amount" 
                className="input-field" 
                type="number" 
                step="0.01" 
                placeholder="0.00"
                {...register('amount')}
              />
              {errors.amount && (
                <p style={{ color: 'var(--error, #e53e3e)', fontSize: '12px', marginTop: '4px' }}>
                  {errors.amount.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="note" className="label">Note (optional)</label>
            <input id="note" className="input-field" placeholder="Describe the transaction..." {...register('note')} />
            {errors.note && (
              <p style={{ color: 'var(--error, #e53e3e)', fontSize: '12px', marginTop: '4px' }}>
                {errors.note.message}
              </p>
            )}
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={loading} type="submit">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-8" style={{ display: 'inline' }} />
                  Saving...
                </>
              ) : 'Transfer'}
            </button>
            <button 
              type="button" 
              className="btn btn-ghost" 
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
          </div>
        </form>
      </div>

      <div className="transfers-history" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3>Recent Transfers</h3>
          {isAdmin && (
            <div style={{ width: '200px' }}>
              <BranchSelect 
                className="input-field" 
                value={branchFilter} 
                onChange={e => setBranchFilter(e.target.value)}
              >
                <option value="">All Branches</option>
                {branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
              </BranchSelect>
            </div>
          )}
        </div>
        <div className="table-scroll" style={{ flex: 1, minHeight: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Branch</th>
                <th>From</th>
                <th className="text-center">→</th>
                <th>To</th>
                <th className="text-right">Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr><td colSpan={7} className="text-center muted table-empty">No transfers recorded</td></tr>
              ) : transfers.map(t => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                  <td>{t.branch_name || `Branch #${t.branch_id}`}</td>
                  <td>{t.from_book_type}</td>
                  <td className="text-center"><ArrowRightCircle size={16} /></td>
                  <td>{t.to_book_type}</td>
                  <td className="text-right font-mono">₹{Number(t.amount).toFixed(2)}</td>
                  <td className="text-sm muted">{t.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
};

export default InternalTransfers;

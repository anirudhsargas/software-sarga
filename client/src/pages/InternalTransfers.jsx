import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { BookOpen, Building2, ArrowRightCircle } from 'lucide-react';
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

const InternalTransfers = () => {
    useSEO('Internal Transfers');

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(isAdmin ? '' : user.branch_id);
  const [fromBook, setFromBook] = useState('Offset');
  const [toBook, setToBook] = useState('Laser');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState([]);

  useEffect(() => {
    if (isAdmin) fetchBranches();
    fetchTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBranches = async () => {
    try {
      const res = await api.get('/branches');
      setBranches(res.data || []);
    } catch (e) {
      console.error('Failed to load branches', e);
    }
  };

  const fetchTransfers = async () => {
    try {
      const res = await api.get('/internal-transfers', { params: { branch_id: branchId || undefined } });
      setTransfers(res.data || []);
    } catch (e) {
      console.error('Failed to load transfers', e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    if (fromBook === toBook) {
      toast.error('Source and destination must be different');
      return;
    }
    setLoading(true);
    try {
      await api.post('/internal-transfers', {
        branch_id: branchId || undefined,
        from_book_type: fromBook,
        to_book_type: toBook,
        amount: Number(amount),
        note: note || null
      });
      toast.success('Transfer recorded');
      setAmount(''); setNote('');
      fetchTransfers();
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
        <form onSubmit={handleSubmit} className="stack-md">
          {isAdmin && (
            <div>
              <label className="label">Branch</label>
              <BranchSelect className="input-field" value={branchId || ''} onChange={e => setBranchId(e.target.value)}>
                <option value="">Select Branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </BranchSelect>
            </div>
          )}

          <div className="form-row form-row--3">
            <div>
              <label className="label">From Book</label>
              <select className="input-field" value={fromBook} onChange={e => setFromBook(e.target.value)}>
                {BOOK_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>

            <div>
              <label className="label">To Book</label>
              <select className="input-field" value={toBook} onChange={e => setToBook(e.target.value)}>
                {BOOK_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Amount (₹)</label>
              <input className="input-field" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Note (optional)</label>
            <input className="input-field" value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Saving...' : 'Transfer'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setAmount(''); setNote(''); }}>Reset</button>
          </div>
        </form>
      </div>

      <div className="transfers-history" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <h3>Recent Transfers</h3>
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
                  <td>{t.branch_id}</td>
                  <td>{t.from_book_type}</td>
                  <td className="text-center"><ArrowRightCircle /></td>
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

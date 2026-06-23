import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Star, Trash2, Edit3, Plus, RefreshCw, ExternalLink, Star as StarIcon, Search } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import PageContainer from '../../components/ui/PageContainer';

const STARS = [1, 2, 3, 4, 5];

function StarDisplay({ rating, interactive, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {STARS.map(s => (
        <button key={s} type="button" onClick={() => interactive && onChange?.(s)}
          style={{ background: 'none', border: 'none', cursor: interactive ? 'pointer' : 'default', padding: 0, color: s <= Math.round(rating) ? 'var(--warning)' : 'var(--border)' }}>
          <StarIcon size={interactive ? 22 : 14} fill={s <= Math.round(rating) ? 'var(--warning)' : 'none'} />
        </button>
      ))}
    </div>
  );
}

function ReviewsManagement() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ reviewer_name: '', rating: 5, review_text: '', source: 'manual', is_featured: false, is_active: true, sort_order: 0, review_date: '' });
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return reviews;
    const q = searchQuery.toLowerCase();
    return reviews.filter(r =>
      r.reviewer_name?.toLowerCase().includes(q) ||
      r.review_text?.toLowerCase().includes(q)
    );
  }, [reviews, searchQuery]);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await api.get('/reviews');
      setReviews(res.data?.reviews || []);
    } catch {
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const handleSave = useCallback(async () => {
    if (!form.reviewer_name.trim()) return toast.error('Reviewer name is required');
    try {
      if (editing) {
        await api.put(`/reviews/${editing}`, form);
        toast.success('Review updated');
      } else {
        await api.post('/reviews', form);
        toast.success('Review created');
      }
      setEditing(null);
      setForm({ reviewer_name: '', rating: 5, review_text: '', source: 'manual', is_featured: false, is_active: true, sort_order: 0, review_date: '' });
      fetchReviews();
    } catch {
      toast.error('Failed to save review');
    }
  }, [editing, form, fetchReviews]);

  const handleEdit = useCallback((r) => {
    setEditing(r.id);
    setForm({ reviewer_name: r.reviewer_name, rating: r.rating, review_text: r.review_text || '', source: r.source || 'manual', is_featured: !!r.is_featured, is_active: !!r.is_active, sort_order: r.sort_order || 0, review_date: r.review_date || '' });
  }, []);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Delete this review?')) return;
    try {
      await api.delete(`/reviews/${id}`);
      toast.success('Review deleted');
      fetchReviews();
    } catch {
      toast.error('Failed to delete');
    }
  }, [fetchReviews]);

  const handleToggleFeature = useCallback(async (id) => {
    try {
      const res = await api.put(`/reviews/${id}/feature`);
      toast.success(res.data.message);
      fetchReviews();
    } catch {
      toast.error('Failed to toggle feature');
    }
  }, [fetchReviews]);

  const handleImportGoogle = useCallback(async () => {
    setImporting(true);
    try {
      const res = await api.post('/website/reviews/fetch-google');
      toast.success(res.data.message);
      fetchReviews();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to import');
    } finally {
      setImporting(false);
    }
  }, [fetchReviews]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading reviews...</div>;

  return (
    <PageContainer>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Google Reviews Management</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handleImportGoogle} disabled={importing}>
            <RefreshCw size={14} className={importing ? 'spinning' : ''} /> {importing ? 'Importing...' : 'Import from Google'}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ reviewer_name: '', rating: 5, review_text: '', source: 'manual', is_featured: false, is_active: true, sort_order: 0, review_date: '' }); }}>
            <Plus size={14} /> Add Review
          </button>
        </div>
      </div>

      {/* Form */}
      {(editing !== null || editing === null && form.reviewer_name) && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem' }}>{editing ? 'Edit Review' : 'New Review'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Name *</label>
              <input className="input" value={form.reviewer_name} onChange={e => setForm(f => ({ ...f, reviewer_name: e.target.value }))} placeholder="Reviewer name" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Rating</label>
              <StarDisplay rating={form.rating} interactive onChange={v => setForm(f => ({ ...f, rating: v }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Date</label>
              <input className="input" type="date" value={form.review_date} onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Source</label>
              <select className="input" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                <option value="manual">Manual</option>
                <option value="google">Google</option>
                <option value="facebook">Facebook</option>
                <option value="website">Website</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Sort Order</label>
              <input className="input" type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Review Text</label>
            <textarea className="input" rows={3} value={form.review_text} onChange={e => setForm(f => ({ ...f, review_text: e.target.value }))} placeholder="Review text..." style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_featured} onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))} />
              Featured
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Active
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
            <button className="btn btn-ghost" onClick={() => { setEditing(null); setForm({ reviewer_name: '', rating: 5, review_text: '', source: 'manual', is_featured: false, is_active: true, sort_order: 0, review_date: '' }); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input className="input" placeholder="Search reviews..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '36px', width: '100%' }} />
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Rating</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Review</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Date</th>
              <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>Featured</th>
              <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>Active</th>
              <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{r.reviewer_name}</td>
                <td style={{ padding: '0.75rem 0.5rem' }}><StarDisplay rating={r.rating} /></td>
                <td style={{ padding: '0.75rem 0.5rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{r.review_text || '—'}</td>
                <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap' }}>{r.review_date || '—'}</td>
                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                  <button className="btn btn-sm" style={{ background: r.is_featured ? 'var(--warning)' : 'transparent', color: r.is_featured ? 'var(--card)' : 'var(--text-muted)', border: '1px solid', borderColor: r.is_featured ? 'var(--warning)' : 'var(--border)' }} onClick={() => handleToggleFeature(r.id)}>
                    <Star size={12} />
                  </button>
                </td>
                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: r.is_active ? 'var(--success)' : 'var(--text-muted)' }} />
                </td>
                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleEdit(r)}><Edit3 size={14} /></button>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(r.id)} style={{ color: 'var(--error)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7}><EmptyState icon={Star} title="No reviews found" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}

export default React.memo(ReviewsManagement);

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Search, ExternalLink, RefreshCw, Loader2, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';

const STATUSES = [
  { value: 'uploaded', label: 'Uploaded', color: 'var(--color-primaryHover)' },
  { value: 'under_review', label: 'Under Review', color: 'var(--color-warning)' },
  { value: 'proof_sent', label: 'Proof Sent', color: 'var(--color-textSecondary)' },
  { value: 'approved', label: 'Approved', color: 'var(--color-textSecondary)' },
  { value: 'printing', label: 'Printing', color: 'var(--color-textMuted)' },
  { value: 'completed', label: 'Completed', color: 'var(--color-textSecondary)' },
  { value: 'cancelled', label: 'Cancelled', color: 'var(--color-danger)' },
];

function ArtworkManager() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [designers, setDesigners] = useState([]);
  const limit = 20;

  const fetchList = useCallback(async () => {
    try {
      const params = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.get('/artwork/list', { params });
      setUploads(res.data.reviews || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      toast.error('Failed to load artwork uploads');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  const fetchDetail = useCallback(async (id) => {
    try {
      const res = await api.get(`/artwork/${id}`);
      setDetail(res.data.artwork);
    } catch (e) {
      toast.error('Failed to load details');
    }
  }, []);

  const fetchDesigners = useCallback(async () => {
    try {
      const res = await api.get('/artwork/designers/list');
      setDesigners(res.data.designers || []);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchDesigners(); }, [fetchDesigners]);

  useEffect(() => {
    if (selected) fetchDetail(selected);
  }, [selected, fetchDetail]);

  const handleStatusChange = useCallback(async (id, status) => {
    try {
      await api.put(`/artwork/${id}/status`, { status });
      toast.success('Status updated');
      if (detail && detail.id === id) setDetail(d => ({ ...d, status }));
      fetchList();
    } catch (e) {
      toast.error('Failed to update status');
    }
  }, [detail, fetchList]);

  const handleAssignDesigner = useCallback(async (id, designer_id) => {
    try {
      await api.put(`/artwork/${id}/assign-designer`, { designer_id: Number(designer_id) || null });
      toast.success('Designer assigned');
      if (detail && detail.id === id) {
        const d = designers.find(dd => dd.id === Number(designer_id));
        setDetail(dd => ({ ...dd, assigned_designer_id: Number(designer_id) || null, assigned_designer_name: d?.name || null }));
      }
      fetchList();
    } catch (e) {
      toast.error('Failed to assign designer');
    }
  }, [detail, designers, fetchList]);

  const handleSaveNotes = useCallback(async () => {
    if (!detail) return;
    try {
      await api.put(`/artwork/${detail.id}/notes`, { notes: detail.notes || '' });
      toast.success('Notes saved');
    } catch (e) {
      toast.error('Failed to save notes');
    }
  }, [detail]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Delete this artwork upload and its files?')) return;
    try {
      await api.delete(`/artwork/${id}`);
      toast.success('Artwork deleted');
      if (selected === id) { setSelected(null); setDetail(null); }
      fetchList();
    } catch (e) {
      toast.error('Failed to delete');
    }
  }, [selected, fetchList]);

  const totalPages = useMemo(() => Math.ceil(total / limit), [total]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading artwork uploads...</div>;

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Artwork Uploads</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-disabled)' }} />
            <input className="input" placeholder="Search name, order, phone..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ paddingLeft: '32px', width: '220px' }} />
          </div>
          <select className="input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 'auto' }}>
            <option value="">All Status</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="btn btn-outline" onClick={() => { setLoading(true); fetchList(); }}><RefreshCw size={14} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Order #</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Customer</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Product</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Qty</th>
                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Designer</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Date</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected === r.id ? 'var(--glass-bg)' : 'transparent' }}
                  onClick={() => setSelected(r.id)}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, fontFamily: 'monospace' }}>{r.order_number}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ fontWeight: 600 }}>{r.customer_name}</div>
                    {r.customer_phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.customer_phone}</div>}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem' }}>{r.product_type || '—'}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{r.quantity || '—'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                      background: STATUSES.find(s => s.value === r.status)?.color + '1a',
                      color: STATUSES.find(s => s.value === r.status)?.color
                    }}>
                      {STATUSES.find(s => s.value === r.status)?.label || r.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem' }}>{r.assigned_designer_name || '—'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); setSelected(r.id); }}>
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {uploads.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No artwork uploads found</td></tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.25rem', marginTop: '1rem' }}>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} className={`btn btn-sm ${page === i + 1 ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPage(i + 1)}>{i + 1}</button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && detail && (
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'monospace' }}>{detail.order_number}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => { setSelected(null); setDetail(null); }}>X</button>
            </div>

            {/* Status + Designer controls */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <select className="input" value={detail.status} onChange={e => handleStatusChange(detail.id, e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select className="input" value={detail.assigned_designer_id || ''}
                onChange={e => handleAssignDesigner(detail.id, e.target.value)}
                style={{ width: 'auto', fontSize: '0.85rem' }}>
                <option value="">Unassigned</option>
                {designers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            {/* Customer info */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Customer</h4>
              <div style={{ fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Name:</span> {detail.customer_name}</div>
                {detail.customer_email && <div><span style={{ color: 'var(--text-muted)' }}>Email:</span> {detail.customer_email}</div>}
                {detail.customer_phone && <div><span style={{ color: 'var(--text-muted)' }}>Phone:</span> {detail.customer_phone}</div>}
              </div>
            </div>

            {/* Order info */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Order Details</h4>
              <div style={{ fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                {detail.product_type && <div><span style={{ color: 'var(--text-muted)' }}>Product:</span> {detail.product_type}</div>}
                {detail.quantity && <div><span style={{ color: 'var(--text-muted)' }}>Qty:</span> {detail.quantity}</div>}
                {detail.size && <div><span style={{ color: 'var(--text-muted)' }}>Size:</span> {detail.size}</div>}
                <div><span style={{ color: 'var(--text-muted)' }}>Printing:</span> {detail.printing_side === 'double' ? 'Double Side' : 'Single Side'}</div>
                {detail.delivery_requirement && <div><span style={{ color: 'var(--text-muted)' }}>Delivery:</span> {detail.delivery_requirement}</div>}
              </div>
              {detail.special_instructions && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Instructions:</span>
                  <p style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap' }}>{detail.special_instructions}</p>
                </div>
              )}
            </div>

            {/* Files */}
            {detail.files && JSON.parse(detail.files).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Files ({JSON.parse(detail.files).length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {JSON.parse(detail.files).map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem',
                      background: 'var(--glass-bg)', borderRadius: '6px', fontSize: '0.8rem'
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', background: f.error ? 'var(--color-danger)' : 'var(--color-success)', flexShrink: 0
                      }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.original_name}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {f.size ? (f.size / 1024 / 1024).toFixed(1) + 'MB' : ''}
                      </span>
                      {f.secure_url && (
                        <a href={f.secure_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', color: 'var(--accent)' }}>
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Admin Notes</h4>
              <textarea className="input" rows={3} value={detail.notes || ''}
                onChange={e => setDetail(d => ({ ...d, notes: e.target.value }))}
                style={{ width: '100%', fontSize: '0.85rem' }}
                placeholder="Internal notes about this artwork..." />
              <button className="btn btn-sm btn-primary" onClick={handleSaveNotes} style={{ marginTop: '0.5rem' }}>Save Notes</button>
            </div>

            {/* Delete */}
            <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(detail.id)}
              style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>
              Delete Artwork
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(ArtworkManager);

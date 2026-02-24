import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Upload, Search, Eye, Trash2, Loader2, X } from 'lucide-react';
import api from '../../services/api';
import { fmtDate, today, fmt, baseFileUrl, DOCUMENT_TYPES } from './constants';

const defaultForm = { document_type: 'Invoice', related_tab: '', vendor_name: '', bill_number: '', bill_date: today(), amount: '', description: '', file: null };

const BillsDocsTab = ({ onError }) => {
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState({ document_type: '', vendor_name: '' });
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const fetchDocs = useCallback(async () => {
    try {
      const r = await api.get('/bills-documents', { params: { document_type: filter.document_type || undefined, vendor_name: filter.vendor_name || undefined } });
      setDocs(r.data);
    } catch {}
  }, [filter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const uploadDoc = async (e) => {
    e.preventDefault(); setUploading(true);
    try {
      const fd = new FormData();
      if (form.file) fd.append('file', form.file);
      fd.append('document_type', form.document_type);
      fd.append('related_tab', form.related_tab);
      fd.append('vendor_name', form.vendor_name);
      fd.append('bill_number', form.bill_number);
      fd.append('bill_date', form.bill_date);
      fd.append('amount', form.amount);
      fd.append('description', form.description);
      const url = form.file ? '/bills-documents/upload' : '/bills-documents';
      await api.post(url, form.file ? fd : form, form.file ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
      setShowUpload(false); setForm(defaultForm); fetchDocs();
    } catch (err) { onError(err.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this document?')) return;
    try { await api.delete(`/bills-documents/${id}`); fetchDocs(); } catch {}
  };

  return (
    <div className="em-section">
      <div className="em-filter-row" style={{ justifyContent: 'space-between' }}>
        <div className="em-section-title"><FileText size={18} /> Bills & Documents</div>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm(defaultForm); setShowUpload(true); }}><Upload size={15} /> Upload Document</button>
      </div>

      <div className="em-filter-row">
        <select className="em-input em-input--sm" value={filter.document_type} onChange={e => setFilter(p => ({ ...p, document_type: e.target.value }))}>
          <option value="">All Types</option>
          {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="em-search-wrap"><Search className="em-search-icon" size={16} /><input className="em-input" placeholder="Search vendor..." value={filter.vendor_name} onChange={e => setFilter(p => ({ ...p, vendor_name: e.target.value }))} /></div>
      </div>

      {docs.length > 0 ? (
        <div className="em-table-wrap">
          <table className="em-table">
            <thead><tr><th>Date</th><th>Type</th><th>Vendor</th><th>Bill #</th><th>Amount</th><th>File</th><th>Actions</th></tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td>{fmtDate(d.bill_date)}</td><td><span className="em-type-badge em-type-badge--other">{d.document_type}</span></td><td>{d.vendor_name || '—'}</td><td>{d.bill_number || '—'}</td><td className="em-amount-cell">{d.amount ? `₹${fmt(d.amount)}` : '—'}</td>
                  <td>{d.file_path ? <a href={`${baseFileUrl}${d.file_path}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><Eye size={14} /> View</a> : '—'}</td>
                  <td><button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(d.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="em-empty-text">No documents yet</div>}

      {/* Bill Upload Modal */}
      {showUpload && (
        <div className="modal-backdrop" onClick={() => setShowUpload(false)}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>Upload Document</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowUpload(false)}><X size={18} /></button></div>
            <form onSubmit={uploadDoc}>
              <div className="em-modal__body">
                <div className="em-form-grid">
                  <div className="em-form-group"><label>Document Type</label><select className="em-input" value={form.document_type} onChange={e => setForm(p => ({ ...p, document_type: e.target.value }))}>{DOCUMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div className="em-form-group"><label>Related Tab</label><select className="em-input" value={form.related_tab} onChange={e => setForm(p => ({ ...p, related_tab: e.target.value }))}><option value="">General</option><option value="office">Office</option><option value="transport">Transport</option><option value="misc">Misc</option><option value="rent">Rent</option><option value="vendor">Vendor</option></select></div>
                  <div className="em-form-group"><label>Vendor Name</label><input className="em-input" value={form.vendor_name} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Bill #</label><input className="em-input" value={form.bill_number} onChange={e => setForm(p => ({ ...p, bill_number: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Bill Date</label><input className="em-input" type="date" value={form.bill_date} onChange={e => setForm(p => ({ ...p, bill_date: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Amount (₹)</label><input className="em-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div className="em-form-group em-form-group--full"><label>Description</label><input className="em-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <div className="em-form-group em-form-group--full">
                    <label>File (JPG, PNG, PDF, XLS, DOC — max 10MB)</label>
                    <input type="file" className="em-input" accept=".jpg,.jpeg,.png,.webp,.pdf,.xls,.xlsx,.doc,.docx" onChange={e => setForm(p => ({ ...p, file: e.target.files[0] || null }))} />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setShowUpload(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={uploading}>{uploading ? <><Loader2 size={14} className="spin" /> Uploading...</> : <><Upload size={14} /> Upload</>}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillsDocsTab;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { FileText, Upload, Search, Eye, Trash2, Loader2, X, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import localDb from '../../services/localDb';
import { fmtDate, today, fmt, DOCUMENT_TYPES } from './constants';
import { imgUrl } from '../../services/api';
import { useConfirm } from '../../contexts/ConfirmContext';
import useAuth from '../../hooks/useAuth';
import SmartBillUpload from './SmartBillUpload';
import FullBillModal from './FullBillModal';

const defaultForm = { document_type: 'Invoice', related_tab: '', vendor_name: '', bill_number: '', bill_date: today(), amount: '', description: '', file: null };
const PAGE_SIZE = 50;

const BillsDocsTab = ({ onError }) => {
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const canDelete = user?.role === 'Admin' || user?.role === 'Accountant';
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState({ document_type: '', vendor_name: '' });
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showSmartUpload, setShowSmartUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(defaultForm);
  const [fullBillDocId, setFullBillDocId] = useState(null);

  const fetchDocs = useCallback(async () => {
    try {
      const docs = await localDb.getBillsDocuments({ document_type: filter.document_type || undefined, vendor_name: filter.vendor_name || undefined });
      setDocs(docs); setPage(1);
    } catch {
      setDocs([]);
      setPage(1);
    }
  }, [filter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const uploadDoc = async (e) => {
    e.preventDefault(); setUploading(true);
    try {
      const file = form.file || null;
      const docData = {
        document_type: form.document_type,
        related_tab: form.related_tab,
        vendor_name: form.vendor_name,
        bill_number: form.bill_number,
        bill_date: form.bill_date,
        amount: form.amount,
        description: form.description,
        // Store the actual file blob locally so it can be viewed offline
        file_blob: file || undefined,
        file_name: file?.name || undefined,
        file_type: file?.type || undefined,
      };
      await localDb.saveBillDocument(docData);
      setShowUpload(false); setForm(defaultForm); fetchDocs();
    } catch {
      onError('Local upload failed');
    }
    finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Document',
      message: 'Are you sure you want to delete this document?',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;

    // Optimistic UI Update
    setDocs(prev => prev.filter(d => d.id !== id));
    try {
      await localDb.deleteBillDocument(id);
      fetchDocs();
    } catch {
      onError('Failed to delete bill document');
      fetchDocs();
    }
  };

  const debouncedSearch = useDebounce(search, 300);
  const filteredDocs = useMemo(() => {
    if (!debouncedSearch) return docs;
    const s = debouncedSearch.toLowerCase();
    return docs.filter(d =>
      (d.document_type && d.document_type.toLowerCase().includes(s)) ||
      (d.vendor_name && d.vendor_name.toLowerCase().includes(s)) ||
      (d.bill_number && d.bill_number.toLowerCase().includes(s)) ||
      (d.amount && String(d.amount).includes(s)) ||
      (d.description && d.description.toLowerCase().includes(s))
    );
  }, [docs, debouncedSearch]);
  const totalPages = Math.ceil(filteredDocs.length / PAGE_SIZE);
  const pagedDocs = useMemo(() => filteredDocs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredDocs, page]);


  return (
    <div className="em-section">
      <div className="em-filter-row" style={{ justifyContent: 'space-between' }}>
        <div className="em-section-title"><FileText size={18} /> Bills & Documents</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSmartUpload(true)}>
            <Sparkles size={15} /> Smart Upload
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setForm(defaultForm); setShowUpload(true); }}>
            <Upload size={15} /> Upload
          </button>
        </div>
      </div>

      <div className="em-filter-row">
        <select aria-label="Select option"  className="em-input em-input--sm" value={filter.document_type} onChange={e => setFilter(p => ({ ...p, document_type: e.target.value }))}>
          <option value="">All Types</option>
          {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="em-search-wrap">
          <Search className="em-search-icon" size={16} />
          <input
            className="em-input"
            placeholder="Search bills & docs..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ maxWidth: 220 }}
          />
        </div>
      </div>

      {docs.length > 0 ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {filteredDocs.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '8px 0', flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredDocs.length)} of {filteredDocs.length}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={16} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={16} /></button>
            </div>
          )}
          <div className="em-table-wrap" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <table className="em-table">
              <thead><tr><th style={{ width: 100 }}>Date</th><th style={{ width: 130 }}>Type</th><th>Vendor</th><th style={{ width: 100 }}>Bill #</th><th style={{ width: 110 }}>Amount</th><th style={{ width: 80 }}>File</th><th style={{ width: 150 }}>Actions</th></tr></thead>
              <tbody>
                {pagedDocs.map(d => (
                  <tr key={d.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.bill_date)}</td>
                    <td><span className="em-type-badge em-type-badge--other">{d.document_type}</span></td>
                    <td style={{ wordBreak: 'break-word' }}>{d.vendor_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{d.bill_number || '—'}</td>
                    <td className="em-amount-cell">{d.amount ? `₹${fmt(d.amount)}` : '—'}</td>
                    <td>{d.file_path ? <a href={imgUrl(d.file_path)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><Eye size={14} /> View</a> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setFullBillDocId(d.id)}><Eye size={14} /> Full Bill</button>
                        {canDelete ? (
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(d.id)} title="Delete document"><Trash2 size={14} /></button>
                        ) : (
                          <button className="btn btn-ghost btn-icon btn-sm" disabled title="Only Admin or Accountant can delete bills" style={{ opacity: 0.35, cursor: 'not-allowed' }}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagedDocs.length === 0 && <div className="em-empty-text">No documents found</div>}
          </div>
        </div>
      ) : <div className="em-empty-text">No documents yet</div>}

      {/* Bill Upload Modal */}
      {showUpload && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div role="button" tabIndex={0}  className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>Upload Document</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowUpload(false)}><X size={18} /></button></div>
            <form onSubmit={uploadDoc}>
              <div className="em-modal__body">
                <div className="em-form-grid">
                  <div className="em-form-group"><label>Document Type</label><select aria-label="Select option"  className="em-input" value={form.document_type} onChange={e => setForm(p => ({ ...p, document_type: e.target.value }))}>{DOCUMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div className="em-form-group"><label>Related Tab</label><select aria-label="Select option"  className="em-input" value={form.related_tab} onChange={e => setForm(p => ({ ...p, related_tab: e.target.value }))}><option value="">General</option><option value="office">Office</option><option value="transport">Transport</option><option value="misc">Misc</option><option value="rent">Rent</option><option value="vendor">Vendor</option></select></div>
                  <div className="em-form-group"><label>Vendor Name</label><input className="em-input" value={form.vendor_name} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Bill #</label><input className="em-input" value={form.bill_number} onChange={e => setForm(p => ({ ...p, bill_number: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Bill Date</label>
        <label htmlFor="date-v0kghe" className="sr-only">Select Date</label>
        <input id="date-v0kghe"  className="em-input" type="date" value={form.bill_date} onChange={e => setForm(p => ({ ...p, bill_date: e.target.value }))} /></div>
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

      {/* Smart Bill Upload Modal */}
      {showSmartUpload && (
        <SmartBillUpload
          onClose={() => setShowSmartUpload(false)}
          onSuccess={() => {
            fetchDocs();
          }}
          onError={(err) => onError(err.response?.data?.message || 'Smart upload failed')}
        />
      )}

      <FullBillModal
        open={Boolean(fullBillDocId)}
        documentId={fullBillDocId}
        onClose={() => setFullBillDocId(null)}
      />
    </div>
  );
};

export default React.memo(BillsDocsTab);

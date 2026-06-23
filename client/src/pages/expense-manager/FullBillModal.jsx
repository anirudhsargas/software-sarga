import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, ExternalLink, FileText } from 'lucide-react';
import api, { imgUrl } from '../../services/api';
import localDb from '../../services/localDb';
import { fmt, fmtDate } from './constants';
import SecureImage from '../../components/SecureImage';

const FullBillModal = ({ open, onClose, vendorBillId = null, documentId = null }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (!open) return;

    const fetchFullBill = async () => {
      setLoading(true);
      setError('');
      try {
        // Always try local IndexedDB first
        if (documentId != null) {
          const allDocs = await localDb.getBillsDocuments();
          const localDoc = allDocs.find(d => String(d.id) === String(documentId));
          if (localDoc) {
            setPayload({ document: localDoc, items: [] });
            setLoading(false);
            return;
          }
        }
        if (vendorBillId != null) {
          const allBills = await localDb.getVendorBills?.() || [];
          const localBill = allBills.find(b => String(b.id) === String(vendorBillId));
          if (localBill) {
            setPayload({ vendor_bill: localBill, items: localBill.items || [] });
            setLoading(false);
            return;
          }
        }
        // Fallback to server
        const endpoint = vendorBillId
          ? `/vendor-bills/${vendorBillId}/full`
          : `/bills-documents/${documentId}/full`;
        const { data } = await api.get(endpoint);
        setPayload(data || null);
      } catch (err) {
        setPayload(null);
        setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load bill details');
      } finally {
        setLoading(false);
      }
    };

    fetchFullBill();
  }, [open, vendorBillId, documentId]);

  const bill = payload?.bill || payload?.vendor_bill || null;
  const document = payload?.document || null;
  const items = Array.isArray(payload?.items) ? payload.items : [];

  // Build attachment URL: prefer locally stored blob, then server path
  const attachmentUrl = useMemo(() => {
    if (document?.file_blob) {
      return URL.createObjectURL(document.file_blob);
    }
    if (!document?.file_path) return '';
    return imgUrl(document.file_path);
  }, [document?.file_blob, document?.file_path, document]);

  // Cleanup blob URL on unmount / change
  useEffect(() => {
    return () => {
      if (document?.file_blob && attachmentUrl) {
        URL.revokeObjectURL(attachmentUrl);
      }
    };
  }, [attachmentUrl]);

  const isImage = String(document?.file_type || '').startsWith('image/');
  const isPdf = String(document?.file_type || '').includes('pdf');

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div role="button" tabIndex={0}  className="em-modal" style={{ maxWidth: 980, width: '95vw' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
        <div className="em-modal__header">
          <h2>Full Bill Details</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="em-modal__body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
          {loading ? (
            <div className="em-loading"><Loader2 className="spin" size={20} /> Loading bill...</div>
          ) : error ? (
            <div className="em-error">{error}</div>
          ) : (
            <>
              <div className="em-form-grid" style={{ marginBottom: 14 }}>
                <div className="em-form-group">
                  <label>Vendor</label>
                  <div>{bill?.vendor_name || document?.vendor_name || '—'}</div>
                </div>
                <div className="em-form-group">
                  <label>Bill Number</label>
                  <div>{bill?.bill_number || document?.bill_number || '—'}</div>
                </div>
                <div className="em-form-group">
                  <label>Bill Date</label>
                  <div>{fmtDate(bill?.bill_date || document?.bill_date)}</div>
                </div>
                <div className="em-form-group">
                  <label>Total Amount</label>
                  <div style={{ fontWeight: 700 }}>₹{fmt(Number(bill?.total_amount || document?.amount || 0))}</div>
                </div>
                <div className="em-form-group em-form-group--full">
                  <label>Description</label>
                  <div>{bill?.description || document?.description || '—'}</div>
                </div>
              </div>

              {items.length > 0 && (
                <div className="em-table-wrap" style={{ marginBottom: 14 }}>
                  <table className="em-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>SKU</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Unit Cost</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.item_name || `Item #${item.inventory_item_id}`}</td>
                          <td>{item.item_sku || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(Number(item.quantity || 0))}</td>
                          <td style={{ textAlign: 'right' }}>₹{fmt(Number(item.unit_cost || 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{fmt(Number(item.total_cost || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {attachmentUrl ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <strong>Attachment</strong>
                    <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                      <ExternalLink size={14} /> Open Original
                    </a>
                  </div>
                  {isImage && <SecureImage src={document.file_path} alt="Bill attachment" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />}
                  {!isImage && isPdf && (
                    <iframe
                      src={attachmentUrl}
                      title="Bill PDF"
                      style={{ width: '100%', height: 520, border: '1px solid var(--border)', borderRadius: 8 }}
                    />
                  )}
                  {!isImage && !isPdf && (
                    <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                      <FileText size={14} /> View Attachment
                    </a>
                  )}
                </div>
              ) : (
                <div className="em-empty-inline" style={{ marginTop: 8 }}>
                  <FileText size={28} strokeWidth={1.3} />
                  <p>No attachment available for this bill</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(FullBillModal);

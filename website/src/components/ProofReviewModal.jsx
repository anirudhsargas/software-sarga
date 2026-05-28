import React, { useState } from 'react';

export default function ProofReviewModal({ open, proof, onClose, onSubmit }) {
  const [status, setStatus] = useState(proof?.status || 'Approved');
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const handleSubmit = async () => {
    await onSubmit({ status, customer_feedback: notes });
  };

  const renderPreview = () => {
    if (!proof || !proof.file_url) return <div>No preview available</div>;
    const url = proof.file_url;
    // If data URI or absolute path, just embed. Support images and PDFs.
    const isImage = /(\.jpg|\.jpeg|\.png|\.webp|\.gif|image\/)/i.test(url) || /data:image\//.test(url);
    const isPdf = /\.pdf$|data:application\/pdf/.test(url);
    if (isImage) return <img src={url} alt={`Proof v${proof.version}`} style={{ maxWidth: '100%', maxHeight: '60vh' }} />;
    if (isPdf) return <object data={url} type="application/pdf" width="100%" height="600">PDF preview not available</object>;
    // fallback link
    return <a href={url} target="_blank" rel="noreferrer">Open file</a>;
  };

  return (
    <div style={modalBackdrop}>
      <div style={modalBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Proof v{proof?.version} Review</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div style={{ marginTop: 8 }}>{renderPreview()}</div>

        <div style={{ marginTop: 12 }}>
          <label><strong>Decision</strong></label>
          <div>
            <label style={{ marginRight: 12 }}><input type="radio" name="decision" checked={status === 'Approved'} onChange={() => setStatus('Approved')} /> Approve</label>
            <label style={{ marginRight: 12 }}><input type="radio" name="decision" checked={status === 'Revision Requested'} onChange={() => setStatus('Revision Requested')} /> Request Revision</label>
            <label><input type="radio" name="decision" checked={status === 'Rejected'} onChange={() => setStatus('Rejected')} /> Reject</label>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label><strong>Notes (optional)</strong></label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%', minHeight: 100 }} placeholder="Tell the designer what to change or any comments" />
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleSubmit}>Submit</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const modalBackdrop = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
};

const modalBox = {
  width: '90%', maxWidth: 900, background: '#fff', padding: 16, borderRadius: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
};

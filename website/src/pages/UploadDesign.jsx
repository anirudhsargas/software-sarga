import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { uploadDesign } from '../api';
import './UploadDesign.css';

export default function UploadDesign() {
  const [files, setFiles] = useState([]);
  const [needDesign, setNeedDesign] = useState(false);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const navigate = useNavigate();

  const onFiles = (selected) => {
    const arr = Array.from(selected).slice(0, 10);
    const mapped = arr.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setFiles((s) => [...s, ...mapped]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    onFiles(e.dataTransfer.files);
  };

  const handleSelect = (e) => onFiles(e.target.files);

  const removeFile = (i) => {
    URL.revokeObjectURL(files[i].preview);
    setFiles(files.filter((_, idx) => idx !== i));
  };

  const submit = async (e) => {
    e && e.preventDefault();
    if (files.length === 0 && !needDesign) return toast.error('Please upload at least one file or request design support.');
    const form = new FormData();
    files.forEach(f => form.append('files', f.file));
    form.append('needDesign', needDesign ? '1' : '0');
    form.append('notes', notes || '');

    try {
      setUploading(true);
      const resp = await uploadDesign(form);
      toast.success(resp.data?.message || 'Uploaded');
      navigate('/portal/dashboard');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  return (
    <div className="container" style={{ maxWidth: 900, marginTop: 40 }}>
      <h2>Upload Existing Design</h2>
      <p>Upload PDF, PNG/JPG, or source files. Drag & drop supported. Max 10 files.</p>

      <div
        className="uploader" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onClick={() => fileInput.current?.click()}
      >
        <input ref={fileInput} type="file" multiple onChange={handleSelect} style={{ display: 'none' }} />
        <div className="uploader-inner">
          <div>Drag & drop files here or click to select</div>
          <div className="uploader-hint">Supported: PDF, PNG, JPG, PSD, AI, CDR</div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="upload-previews">
          {files.map((f, i) => (
            <div className="preview" key={i}>
              {f.file.type.startsWith('image') ? (
                <img src={f.preview} alt={f.file.name} />
              ) : (
                <div className="file-box">{f.file.name}</div>
              )}
              <div className="preview-meta">
                <div className="fname">{f.file.name}</div>
                <button className="btn btn-ghost" onClick={() => removeFile(i)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={needDesign} onChange={(e) => setNeedDesign(e.target.checked)} /> Need design support?
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Notes / Instructions</label>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Tell us what you need..." />
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={submit} disabled={uploading}>{uploading ? 'Uploading...' : 'Submit'}</button>
        <button className="btn btn-outline" onClick={() => { setFiles([]); setNotes(''); setNeedDesign(false); }}>Reset</button>
      </div>
    </div>
  );
}

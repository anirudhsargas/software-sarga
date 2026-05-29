import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, X, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadDesign } from '../../api';
import './UploadDesign.css';

export default function UploadDesign() {
  const [files, setFiles] = useState([]);
  const [needDesign, setNeedDesign] = useState(false);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef(null);
  const navigate = useNavigate();

  const onFiles = (selected) => {
    const arr = Array.from(selected).slice(0, 10);
    const mapped = arr.map(f => ({ file: f, preview: f.type.startsWith('image') ? URL.createObjectURL(f) : null }));
    setFiles((s) => [...s, ...mapped]);
  };

  const handleDrop = (e) => { e.preventDefault(); onFiles(e.dataTransfer.files); };
  const handleSelect = (e) => onFiles(e.target.files);

  const removeFile = (i) => {
    if (files[i].preview) URL.revokeObjectURL(files[i].preview);
    setFiles(files.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (files.length === 0 && !needDesign) {
      toast.error('Upload at least one file or request design support.');
      return;
    }
    const form = new FormData();
    files.forEach(f => form.append('files', f.file));
    form.append('needDesign', needDesign ? '1' : '0');
    form.append('notes', notes || '');

    try {
      setUploading(true);
      const resp = await uploadDesign(form);
      toast.success(resp.data?.message || 'Submitted successfully!');
      setSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally { setUploading(false); }
  };

  if (submitted) {
    return (
      <div className="ud-page">
        <div className="ud-success">
          <div className="ud-success-icon"><Check size={40} /></div>
          <h2>Design Submitted!</h2>
          <p>Your files have been received. Our team will review and get back to you shortly.</p>
          <div className="ud-success-actions">
            <button className="btn btn-primary" onClick={() => navigate('/portal/dashboard')}>View My Orders</button>
            <button className="btn btn-outline" onClick={() => { setFiles([]); setNotes(''); setNeedDesign(false); setSubmitted(false); }}>Upload Another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ud-page">
      <div className="ud-header">
        <button className="ud-back" onClick={() => navigate('/design')}>
          <ArrowLeft size={18} /> Back to Design Tools
        </button>
        <div className="ud-header-content">
          <h1>Upload Your Design</h1>
          <p>Already have a design file? Send it to our print team. We support PDF, PNG, JPG, PSD, AI, and CDR formats.</p>
        </div>
      </div>

      <div className="ud-body">
        <div className="ud-dropzone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInput.current?.click()}
        >
          <input ref={fileInput} type="file" multiple onChange={handleSelect} accept=".pdf,.png,.jpg,.jpeg,.psd,.ai,.cdr,.tiff,.eps" hidden />
          <Upload size={40} />
          <p className="ud-dropzone-title">Drop files here or click to browse</p>
          <p className="ud-dropzone-hint">PDF, PNG, JPG, PSD, AI, CDR — up to 10 files</p>
        </div>

        {files.length > 0 && (
          <div className="ud-files">
            <h3>{files.length} file{files.length !== 1 ? 's' : ''} selected</h3>
            <div className="ud-file-list">
              {files.map((f, i) => (
                <div key={i} className="ud-file-item">
                  <div className="ud-file-preview">
                    {f.preview ? (
                      <img src={f.preview} alt={f.file.name} />
                    ) : (
                      <FileText size={28} />
                    )}
                  </div>
                  <div className="ud-file-info">
                    <span className="ud-file-name">{f.file.name}</span>
                    <span className="ud-file-size">{(f.file.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <button className="ud-file-remove" onClick={() => removeFile(i)}><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ud-options">
          <label className="ud-checkbox">
            <input type="checkbox" checked={needDesign} onChange={(e) => setNeedDesign(e.target.checked)} />
            <span className="ud-checkbox-mark"><Check size={12} /></span>
            I need design support — I don't have a final design ready
          </label>
        </div>

        <div className="ud-notes">
          <label>Notes / Instructions</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
            placeholder="Tell us about your project — quantity, size, paper type, finishing, delivery date..." />
        </div>

        <div className="ud-actions">
          <button className="btn btn-primary" onClick={submit} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Submit Design'}
          </button>
          <button className="btn btn-ghost" onClick={() => { setFiles([]); setNotes(''); setNeedDesign(false); }}>
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}

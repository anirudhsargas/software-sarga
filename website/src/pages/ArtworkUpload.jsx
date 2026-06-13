import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Loader2, Search } from 'lucide-react';
import api from '../api';
import './ArtworkUpload.css';

const ALLOWED_TYPES = ['.pdf', '.ai', '.psd', '.cdr', '.jpg', '.jpeg', '.png', '.tiff', '.tif'];
const SIZE_LIMIT = 100 * 1024 * 1024;
const MAX_FILES = 20;

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(format) {
  const map = {
    pdf: '📄', ai: '🎨', psd: '🖌️', cdr: '✏️',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', tiff: '📷', tif: '📷'
  };
  return map[format] || '📁';
}

export default function ArtworkUpload() {
  const [step, setStep] = useState('form');
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploaded, setUploaded] = useState(null);
  const [error, setError] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [trackQuery, setTrackQuery] = useState('');
  const [tracking, setTracking] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    customer_name: '', customer_email: '', customer_phone: '',
    product_type: '', quantity: '', size: '', printing_side: 'single',
    special_instructions: '', delivery_requirement: ''
  });

  // Load saved contact info from localStorage for returning customers
  useEffect(() => {
    const saved = localStorage.getItem('artwork_contact');
    if (saved) {
      try {
        const sc = JSON.parse(saved);
        setForm(f => ({ ...f, customer_name: sc.name || '', customer_email: sc.email || '', customer_phone: sc.phone || '' }));
      } catch (e) {}
    }
  }, []);

  const validateFile = useCallback((file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_TYPES.includes(ext)) return `"${file.name}" — unsupported type (${ext}). Allowed: PDF, AI, PSD, CDR, JPG, PNG, TIFF`;
    if (file.size > SIZE_LIMIT) return `"${file.name}" — exceeds 100MB limit (${formatSize(file.size)})`;
    return null;
  }, []);

  const addFiles = useCallback((newFiles) => {
    const fileArray = Array.from(newFiles);
    const valid = [];
    const errors = [];
    for (const f of fileArray) {
      const err = validateFile(f);
      if (err) errors.push(err);
      else valid.push(f);
    }
    setFiles(prev => {
      const combined = [...prev, ...valid];
      return combined.slice(0, MAX_FILES);
    });
    if (errors.length) setError(errors.join('\n'));
    else setError('');
  }, [validateFile]);

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) { setError('Please enter your name'); return; }
    if (files.length === 0) { setError('Please select at least one file'); return; }
    setError('');

    // Save contact info to localStorage
    localStorage.setItem('artwork_contact', JSON.stringify({
      name: form.customer_name, email: form.customer_email, phone: form.customer_phone
    }));

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('customer_name', form.customer_name);
    formData.append('customer_email', form.customer_email);
    formData.append('customer_phone', form.customer_phone);
    formData.append('product_type', form.product_type);
    formData.append('quantity', form.quantity);
    formData.append('size', form.size);
    formData.append('printing_side', form.printing_side);
    formData.append('special_instructions', form.special_instructions);
    formData.append('delivery_requirement', form.delivery_requirement);
    files.forEach(f => formData.append('files', f));

    try {
      const res = await api.post('/website/artwork/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      setUploaded(res.data);
      setStep('success');
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleTrack = async () => {
    if (!trackQuery.trim()) return;
    setTracking(true);
    setTrackResult(null);
    try {
      const res = await api.get(`/website/artwork/track/${trackQuery.trim()}`);
      setTrackResult(res.data.artwork);
      setError('');
    } catch (e) {
      setTrackResult(null);
      setError(e.response?.status === 404 ? 'Artwork not found. Check your order number.' : 'Tracking failed');
    } finally {
      setTracking(false);
    }
  };

  const statusSteps = ['uploaded', 'under_review', 'proof_sent', 'approved', 'printing', 'completed'];
  const statusLabels = {
    uploaded: 'Uploaded',
    under_review: 'Under Review',
    proof_sent: 'Proof Sent',
    approved: 'Approved',
    printing: 'Printing',
    completed: 'Completed',
    cancelled: 'Cancelled'
  };

  if (step === 'success' && uploaded) {
    return (
      <div className="artwork-page">
        <div className="artwork-container">
          <div className="artwork-success">
            <div className="success-icon"><CheckCircle size={48} /></div>
            <h2>Artwork Submitted Successfully!</h2>
            <p className="success-order">Order Number: <strong>{uploaded.order_number}</strong></p>
            <p className="success-note">Save this order number to track your artwork status.</p>
            <div className="success-details">
              <div><span>Files uploaded:</span> <strong>{uploaded.files_uploaded}</strong></div>
              {uploaded.files_failed > 0 && <div className="warn"><span>Files failed:</span> <strong>{uploaded.files_failed}</strong></div>}
            </div>
            <div className="success-actions">
              <button className="btn btn-primary" onClick={() => {
                setStep('form'); setFiles([]); setUploaded(null); setUploadProgress(0);
                setForm(f => ({ ...f, product_type: '', quantity: '', size: '', printing_side: 'single', special_instructions: '', delivery_requirement: '' }));
              }}>Upload Another</button>
              <button className="btn btn-outline" onClick={() => { setStep('track'); setTrackQuery(uploaded.order_number); }}>
                Track Status
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="artwork-page">
      <div className="artwork-hero">
        <h1>Upload Your Artwork</h1>
        <p>Submit print-ready files directly — no need to visit the shop</p>
      </div>

      <div className="artwork-container">
        {/* Tab switcher */}
        <div className="artwork-tabs">
          <button className={`tab ${step === 'form' ? 'active' : ''}`} onClick={() => setStep('form')}>New Upload</button>
          <button className={`tab ${step === 'track' ? 'active' : ''}`} onClick={() => setStep('track')}>Track Status</button>
        </div>

        {step === 'track' && (
          <div className="track-section">
            <div className="track-input-group">
              <input
                id="track-query"
                name="track-query"
                className="form-input"
                placeholder="Enter your order number (e.g. ART-250601-1234)"
                value={trackQuery}
                onChange={e => setTrackQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTrack()}
              />
              <button className="btn btn-primary" onClick={handleTrack} disabled={tracking}>
                {tracking ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                Track
              </button>
            </div>

            {trackResult && (
              <div className="track-card">
                <div className="track-header">
                  <h3>{trackResult.order_number}</h3>
                  <span className={`status-badge status-${trackResult.status}`}>
                    {statusLabels[trackResult.status] || trackResult.status}
                  </span>
                </div>
                <div className="track-progress">
                  {statusSteps.map((s, i) => {
                    const idx = statusSteps.indexOf(trackResult.status);
                    const done = i <= idx;
                    const current = i === idx;
                    return (
                      <div key={s} className={`progress-step ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                        <div className="step-dot" />
                        <span className="step-label">{statusLabels[s]}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="track-info">
                  {trackResult.product_type && <div><span>Product:</span> {trackResult.product_type}</div>}
                  {trackResult.quantity && <div><span>Qty:</span> {trackResult.quantity}</div>}
                  {trackResult.size && <div><span>Size:</span> {trackResult.size}</div>}
                  {trackResult.assigned_designer_name && <div><span>Designer:</span> {trackResult.assigned_designer_name}</div>}
                  <div><span>Submitted:</span> {new Date(trackResult.created_at).toLocaleDateString()}</div>
                </div>
                {trackResult.notes && (
                  <div className="track-notes">
                    <strong>Notes:</strong> {trackResult.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'form' && (
          <>
            {/* Upload area */}
            <div
              className={`dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.ai,.psd,.cdr,.jpg,.jpeg,.png,.tiff,.tif"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                style={{ display: 'none' }}
              />
              <Upload size={40} className="drop-icon" />
              <p className="drop-text">Drag & drop files here, or <span>browse</span></p>
              <p className="drop-hint">PDF, AI, PSD, CDR, JPG, PNG, TIFF — up to 100MB each</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="file-list">
                <div className="file-list-header">
                  <span>{files.length} file{files.length > 1 ? 's' : ''} selected (max {MAX_FILES})</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => setFiles([])}>Clear all</button>
                </div>
                {files.map((f, i) => {
                  const ext = f.name.split('.').pop().toLowerCase();
                  return (
                    <div key={i} className="file-item">
                      <span className="file-icon">{getFileIcon(ext)}</span>
                      <span className="file-name">{f.name}</span>
                      <span className="file-size">{formatSize(f.size)}</span>
                      <button className="file-remove" onClick={() => removeFile(i)}><X size={16} /></button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Order info form */}
            <div className="order-form">
              <h3>Order Information</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Your Name *</label>
                  <input id="customer-name" name="customer-name" className="form-input" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Full name" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input id="customer-email" name="customer-email" className="form-input" type="email" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} placeholder="For updates" />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input id="customer-phone" name="customer-phone" className="form-input" type="tel" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="Contact number" />
                </div>
                <div className="form-group">
                  <label>Product Type</label>
                  <select id="product-type" name="product-type" className="form-input" value={form.product_type} onChange={e => setForm(f => ({ ...f, product_type: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="business_card">Business Card</option>
                    <option value="flyer">Flyer / Brochure</option>
                    <option value="poster">Poster / Banner</option>
                    <option value="letterhead">Letterhead</option>
                    <option value="envelope">Envelope</option>
                    <option value="invoice_book">Invoice Book</option>
                    <option value="catalogue">Catalogue</option>
                    <option value="magazine">Magazine</option>
                    <option value="sticker">Sticker / Label</option>
                    <option value="packaging">Packaging Box</option>
                    <option value="calendar">Calendar</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input id="quantity" name="quantity" className="form-input" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="e.g. 1000" />
                </div>
                <div className="form-group">
                  <label>Size</label>
                  <input id="size" name="size" className="form-input" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} placeholder="e.g. A4, 5x7 inch" />
                </div>
                <div className="form-group">
                  <label>Printing Side</label>
                  <select id="printing-side" name="printing-side" className="form-input" value={form.printing_side} onChange={e => setForm(f => ({ ...f, printing_side: e.target.value }))}>
                    <option value="single">Single Side</option>
                    <option value="double">Double Side</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Delivery Requirement</label>
                  <input id="delivery-requirement" name="delivery-requirement" className="form-input" value={form.delivery_requirement} onChange={e => setForm(f => ({ ...f, delivery_requirement: e.target.value }))} placeholder="When needed?" />
                </div>
              </div>
              <div className="form-group full-width">
                <label>Special Instructions</label>
                <textarea id="special-instructions" name="special-instructions" className="form-input" rows={3} value={form.special_instructions} onChange={e => setForm(f => ({ ...f, special_instructions: e.target.value }))} placeholder="Color preferences, finishing, notes for the designer..." />
              </div>
            </div>

            {/* Progress bar */}
            {uploading && (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="progress-text">{uploadProgress}% — Uploading...</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="artwork-error">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {/* Submit */}
            <button className="btn btn-primary btn-submit" onClick={handleSubmit} disabled={uploading || files.length === 0}>
              {uploading ? <><Loader2 size={16} className="spin" /> Uploading...</> : <><Upload size={16} /> Submit Artwork</>}
            </button>

            {/* Guidelines toggle */}
            <div className="guidelines">
              <button className="guidelines-toggle" onClick={() => setShowInstructions(!showInstructions)}>
                Artwork Guidelines {showInstructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showInstructions && (
                <div className="guidelines-content">
                  <ul>
                    <li>Use CMYK color mode for print-ready files (RGB may cause color shifts)</li>
                    <li>Minimum 300 DPI resolution for sharp output</li>
                    <li>Include 3mm bleed on all sides for designs touching the edge</li>
                    <li>Convert text to outlines/curves in vector files to avoid font issues</li>
                    <li>Accepted formats: PDF (preferred), AI, PSD, CDR, JPG, PNG, TIFF</li>
                    <li>Maximum file size: 100MB per file</li>
                    <li>Name files clearly (e.g., business_card_front.pdf, business_card_back.pdf)</li>
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

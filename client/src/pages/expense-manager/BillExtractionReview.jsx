import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2, AlertCircle, CheckCircle, Plus, Trash2, Camera, Image as ImageIcon } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import './BillExtractionReview.css';

const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PAGES = 10;
const MAX_COMPRESS_WIDTH = 1600;
const COMPRESS_QUALITY = 0.8;

const EMPTY_FORM = {
  vendor_name: '',
  bill_number: '',
  bill_date: '',
  gst_number: '',
  items: [{ description: '', quantity: '', rate: '', amount: '' }],
  subtotal: '',
  tax_amount: '',
  total_amount: '',
};

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_COMPRESS_WIDTH) {
        height = Math.round(height * (MAX_COMPRESS_WIDTH / width));
        width = MAX_COMPRESS_WIDTH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Compression failed')); return; }
        const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
        resolve(compressed);
      }, 'image/jpeg', COMPRESS_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

const BillExtractionReview = ({ onClose, onSuccess, onError }) => {
  const [step, setStep] = useState('upload');
  const [pages, setPages] = useState([]);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [form, setForm] = useState({ ...EMPTY_FORM, items: [{ ...EMPTY_FORM.items[0] }] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [queueStatus, setQueueStatus] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const validateFile = useCallback((f) => {
    if (!f) return 'No file selected';
    if (!f.type && f.name?.match(/\.pdf$/i)) return 'Unsupported file type. Use JPG, PNG, WebP, or PDF.';
    if (!VALID_TYPES.includes(f.type) && !f.name?.match(/\.pdf$/i)) return 'Unsupported file type. Use JPG, PNG, WebP, or PDF.';
    if (f.size > MAX_FILE_SIZE) return 'File too large. Maximum size is 10MB.';
    return null;
  }, []);

  const addPages = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    const newPages = [];

    for (const f of files) {
      const validationError = validateFile(f);
      if (validationError) {
        setError(validationError);
        return;
      }
      newPages.push(f);
    }

    const totalAfterAdd = pages.length + newPages.length;
    if (totalAfterAdd > MAX_PAGES) {
      setError(`Maximum ${MAX_PAGES} pages allowed. You have ${pages.length} page(s) — can add ${MAX_PAGES - pages.length} more.`);
      return;
    }

    setError('');

    if (files.length > 1 || files.some(f => f.size > 1024 * 1024)) {
      setCompressing(true);
      setCompressProgress(0);
      const compressed = [];
      for (let i = 0; i < newPages.length; i++) {
        try {
          const result = await compressImage(newPages[i]);
          compressed.push(result);
        } catch {
          compressed.push(newPages[i]);
        }
        setCompressProgress(Math.round(((i + 1) / newPages.length) * 100));
      }
      setCompressing(false);
      setPages(prev => [...prev, ...compressed]);
    } else {
      setPages(prev => [...prev, ...newPages]);
    }
  }, [pages.length, validateFile]);

  const handleCameraCapture = useCallback((e) => {
    if (e.target.files?.length > 0) {
      addPages(e.target.files);
    }
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, [addPages]);

  const handleGallerySelect = useCallback((e) => {
    if (e.target.files?.length > 0) {
      addPages(e.target.files);
    }
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }, [addPages]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length > 0) {
      addPages(e.dataTransfer.files);
    }
  }, [addPages]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const removePage = useCallback((index) => {
    setPages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleExtract = useCallback(async () => {
    if (pages.length === 0) return;
    setLoading(true);
    setError('');
    setStep('processing');
    setQueueStatus(null);

    try {
      const formData = new FormData();
      for (const page of pages) {
        formData.append('billPages', page);
      }
      const response = await api.post('/bills/extract-data', formData, {
        timeout: 120000,
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setCompressProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          }
        },
      });

      console.log('[BillExtraction] Raw API response:', response);
      console.log('[BillExtraction] response.data:', JSON.stringify(response.data, null, 2));

      if (response.data?.success) {
        const d = response.data.data;
        if (!d) {
          console.warn('[BillExtraction] response.data.data is null/undefined — sending to else branch');
          setError(response.data?.message || 'Extraction returned no data. You can fill in the details manually below.');
          setForm({ ...EMPTY_FORM, items: [{ ...EMPTY_FORM.items[0] }] });
          setStep('review');
        } else {
          console.log('[BillExtraction] Extracted data keys:', Object.keys(d));
          console.log('[BillExtraction] Extracted data values:', d);
          setQueueStatus(response.data.queueStatus || null);
          setForm({
            vendor_name: d.vendor_name || d.vendorName || '',
            bill_number: d.bill_number || d.billNumber || '',
            bill_date: d.bill_date || d.billDate || '',
            gst_number: d.gst_number || d.gstNumber || d.gstin || '',
            items: (d.items && d.items.length > 0)
              ? d.items.map(item => ({
                  description: item.description || item.name || '',
                  quantity: item.quantity != null ? String(item.quantity) : '',
                  rate: item.rate != null ? String(item.rate) : '',
                  amount: item.amount != null ? String(item.amount) : '',
                }))
              : [{ description: '', quantity: '', rate: '', amount: '' }],
            subtotal: d.subtotal != null ? String(d.subtotal) : '',
            tax_amount: d.tax_amount || d.taxAmount || d.tax || '',
            total_amount: d.total_amount || d.totalAmount || d.total || '',
          });
          setStep('review');
        }
      } else {
        console.warn('[BillExtraction] response.data.success is falsy:', response.data);
        setError(response.data?.message || 'Extraction failed. You can fill in the details manually below.');
        setForm({ ...EMPTY_FORM, items: [{ ...EMPTY_FORM.items[0] }] });
        setStep('review');
      }
    } catch (err) {
      console.error('[BillExtraction] API call threw an error:', err);
      const msg = err.response?.data?.message || err.message || 'Network error';
      setError(msg + '. You can fill in the details manually below.');
      setForm({ ...EMPTY_FORM, items: [{ ...EMPTY_FORM.items[0] }] });
      setStep('review');
    } finally {
      setLoading(false);
    }
  }, [pages]);

  const updateField = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateItem = useCallback((index, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  }, []);

  const addItem = useCallback(() => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: '', rate: '', amount: '' }],
    }));
  }, []);

  const removeItem = useCallback((index) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.vendor_name.trim()) {
      toast.error('Vendor name is required');
      return;
    }
    if (!form.total_amount && form.total_amount !== '0') {
      toast.error('Total amount is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payloadItems = form.items
        .filter(item => item.description.trim())
        .map(item => ({
          item_name: item.description,
          quantity: Number(item.quantity) || 0,
          rate: Number(item.rate) || 0,
          amount: Number(item.amount) || 0,
          serial_no: 1,
          hsn_sac: '',
          gst_percent: 0,
          mrp: 0,
          sell_price: 0,
          sku: '',
          category_id: null,
          subcategory_id: null,
          category_name: '',
          subcategory_name: '',
          skip_product_library: true,
        }));

      const uploadFormData = new FormData();
      if (pages.length > 0) uploadFormData.append('file', pages[0]);
      uploadFormData.append('document_type', 'Vendor Bill');
      uploadFormData.append('related_tab', 'vendors');
      uploadFormData.append('vendor_name', form.vendor_name.trim());
      uploadFormData.append('bill_number', form.bill_number.trim());
      uploadFormData.append('bill_date', form.bill_date);
      uploadFormData.append('amount', String(Number(form.total_amount) || 0));
      uploadFormData.append('subtotal', String(Number(form.subtotal) || 0));
      uploadFormData.append('tax_amount', String(Number(form.tax_amount) || 0));
      uploadFormData.append('vendor_gstin', form.gst_number.trim());
      if (payloadItems.length > 0) {
        uploadFormData.append('line_items', JSON.stringify(payloadItems));
      }
      const autoDesc = payloadItems.slice(0, 6).map(i => i.item_name).filter(Boolean).join(', ');
      uploadFormData.append('description', autoDesc);

      try {
        await api.post('/bills-documents/upload', uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        });
      } catch (uploadErr) {
        if (uploadErr.response?.status === 409) {
          const proceed = window.confirm(
            'A similar bill was already uploaded. Save this one anyway?'
          );
          if (!proceed) {
            setError('Save cancelled — possible duplicate.');
            setSaving(false);
            return;
          }
          uploadFormData.append('force_duplicate', '1');
          await api.post('/bills-documents/upload', uploadFormData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
          });
        } else {
          throw uploadErr;
        }
      }

      toast.success('Bill saved successfully');
      onSuccess?.();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to save bill';
      toast.error(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  }, [form, pages, onSuccess, onError]);

  const handleRetry = useCallback(() => {
    setError('');
    setStep('upload');
    setPages([]);
    setForm({ ...EMPTY_FORM, items: [{ ...EMPTY_FORM.items[0] }] });
    setQueueStatus(null);
  }, []);

  if (step === 'upload') {
    return (
      <div className="extraction-review">
        <div className="extraction-review-header">
          <h2>AI Bill Extraction</h2>
          <p className="extraction-subtitle">Capture or select photos of the bill pages to extract data using AI</p>
        </div>

        <div
          className={`extraction-dropzone ${pages.length > 0 ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {pages.length === 0 ? (
            <div className="extraction-dropzone-content">
              <Upload size={32} />
              <p>Drop bill images here</p>
              <span className="extraction-hint">JPG, PNG, WebP, PDF — max 10MB each, up to {MAX_PAGES} pages</span>
            </div>
          ) : (
            <div className="extraction-page-strip">
              {pages.map((page, i) => (
                <div key={i} className="extraction-page-thumb">
                  <span className="extraction-page-label">Page {i + 1}</span>
                  <button className="extraction-page-remove" onClick={() => removePage(i)} title="Remove page">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {pages.length > 0 && (
          <div className="extraction-page-count">
            {pages.length} page{pages.length !== 1 ? 's' : ''} captured
            {pages.reduce((sum, p) => sum + p.size, 0) > 0 && (
              <span className="extraction-total-size">
                &nbsp;· {(pages.reduce((sum, p) => sum + p.size, 0) / 1024 / 1024).toFixed(1)} MB total
              </span>
            )}
          </div>
        )}

        {compressing && (
          <div className="extraction-compress-bar">
            <Loader2 className="spin" size={14} />
            <span>Compressing images... {compressProgress}%</span>
          </div>
        )}

        {error && (
          <div className="extraction-error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="extraction-capture-options">
          <input
            ref={cameraInputRef}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
          />
          <input
            ref={galleryInputRef}
            type="file"
            hidden
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            multiple
            onChange={handleGallerySelect}
          />

          {pages.length < MAX_PAGES && (
            <>
              <button
                className="btn btn-outline extraction-capture-btn"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera size={16} /> Take Photo
              </button>
              <button
                className="btn btn-outline extraction-capture-btn"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon size={16} /> Choose from Gallery
              </button>
            </>
          )}
        </div>

        <div className="extraction-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          {pages.length > 0 && (
            <button className="btn btn-primary" onClick={handleExtract} disabled={loading || compressing}>
              {loading ? <Loader2 className="spin" size={16} /> : null}
              Done — Extract Bill Data
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div className="extraction-review">
        <div className="extraction-processing">
          <Loader2 className="spin" size={40} />
          <h3>Processing bill{pages.length > 1 ? ` (${pages.length} pages)` : ''}...</h3>
          {queueStatus && queueStatus.queueLength > 0 ? (
            <p className="extraction-queue-msg">
              {queueStatus.queueLength} bill{queueStatus.queueLength !== 1 ? 's' : ''} ahead of yours,
              estimated wait: ~{queueStatus.estimatedWaitSeconds} seconds
            </p>
          ) : (
            <p className="extraction-queue-msg">Running AI extraction, this may take a moment...</p>
          )}
          <p className="extraction-hint">Please don't close or refresh this page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="extraction-review">
      <div className="extraction-review-header">
        <h2>Review Extracted Data</h2>
        <div className="extraction-badge">
          <SparklesIcon /> AI-extracted, please verify
        </div>
      </div>

      {error && (
        <div className="extraction-error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="extraction-form-grid">
        <div className="extraction-field">
          <label>Vendor Name</label>
          <input
            type="text"
            value={form.vendor_name}
            onChange={e => updateField('vendor_name', e.target.value)}
            placeholder="Vendor name"
          />
        </div>

        <div className="extraction-field">
          <label>Bill Number</label>
          <input
            type="text"
            value={form.bill_number}
            onChange={e => updateField('bill_number', e.target.value)}
            placeholder="Bill number"
          />
        </div>

        <div className="extraction-field">
          <label>Bill Date</label>
          <input
            type="date"
            value={form.bill_date}
            onChange={e => updateField('bill_date', e.target.value)}
          />
        </div>

        <div className="extraction-field">
          <label>GST Number</label>
          <input
            type="text"
            value={form.gst_number}
            onChange={e => updateField('gst_number', e.target.value)}
            placeholder="GSTIN (if applicable)"
          />
        </div>
      </div>

      <div className="extraction-section-divider">
        <h3>Line Items</h3>
        <button className="btn btn-sm btn-outline" onClick={addItem}>
          <Plus size={14} /> Add Item
        </button>
      </div>

      <div className="extraction-items-table-wrapper">
        <table className="extraction-items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Rate</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {form.items.map((item, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => updateItem(i, 'description', e.target.value)}
                    placeholder="Item description"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.quantity}
                    onChange={e => updateItem(i, 'quantity', e.target.value)}
                    placeholder="Qty"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.rate}
                    onChange={e => updateItem(i, 'rate', e.target.value)}
                    placeholder="Rate"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.amount}
                    onChange={e => updateItem(i, 'amount', e.target.value)}
                    placeholder="Amount"
                  />
                </td>
                <td>
                  {form.items.length > 1 && (
                    <button className="extraction-icon-btn" onClick={() => removeItem(i)} title="Remove item">
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="extraction-totals-grid">
        <div className="extraction-field">
          <label>Subtotal</label>
          <input
            type="number"
            step="any"
            min="0"
            value={form.subtotal}
            onChange={e => updateField('subtotal', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="extraction-field">
          <label>Tax Amount</label>
          <input
            type="number"
            step="any"
            min="0"
            value={form.tax_amount}
            onChange={e => updateField('tax_amount', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="extraction-field extraction-field-highlight">
          <label>Total Amount</label>
          <input
            type="number"
            step="any"
            min="0"
            value={form.total_amount}
            onChange={e => updateField('total_amount', e.target.value)}
            placeholder="0.00"
          />
          <span className="extraction-field-note">Manually verify — AI may misread</span>
        </div>
      </div>

      <div className="extraction-actions extraction-actions-bottom">
        <button className="btn btn-outline" onClick={handleRetry}>Upload Different Bill</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="spin" size={16} /> : <CheckCircle size={16} />}
          {saving ? 'Saving...' : 'Save Bill'}
        </button>
      </div>
    </div>
  );
};

function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
      <path d="M19 17l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </svg>
  );
}

export default BillExtractionReview;

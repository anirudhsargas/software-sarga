import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, Loader2, AlertCircle, CheckCircle, Plus, Trash2, Camera, Image as ImageIcon, ChevronRight, ArrowLeft, Search } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { onSocketEvent, getSocket } from '../../services/socketClient';
import './BillExtractionReview.css';

const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PAGES = 10;
const MAX_COMPRESS_WIDTH = 1600;
const COMPRESS_QUALITY = 0.8;

const EMPTY_ITEM = () => ({ description: '', quantity: '', rate: '', amount: '', hsn_sac: '', sell_price: '', _originalIndex: -1 });

const EMPTY_FORM = {
  vendor_name: '',
  bill_number: '',
  bill_date: '',
  gst_number: '',
  items: [EMPTY_ITEM()],
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

function normalizeVendorName(name) {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ').replace(/&/g, 'and').replace(/[.,]+/g, '').trim();
}

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function vendorNameSimilarity(a, b) {
  if (!a || !b) return 0;
  const normA = normalizeVendorName(a), normB = normalizeVendorName(b);
  if (normA === normB) return 1;
  const dist = levenshteinDistance(normA, normB);
  return 1 - dist / Math.max(normA.length, normB.length, 1);
}

function ProductSearchCell({ match, override, isActive, onActivate, onSelect, onClear }) {
  const [search, setSearch] = React.useState('');
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (isActive) {
      const handler = (e) => {
        if (ref.current && !ref.current.contains(e.target)) onActivate();
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [isActive, onActivate]);

  const suggestions = match.suggestions || [];
  const displayName = override?.product_name || (match.matched ? match.canonical_product_name : null);

  const filtered = search.trim()
    ? suggestions.filter(s =>
        s.product_name && s.product_name.toLowerCase().includes(search.toLowerCase())
      )
    : suggestions;

  return (
    <div className="pms-wrapper" ref={ref}>
      <button
        type="button"
        className={`pms-trigger ${displayName ? 'pms-matched' : 'pms-unmatched'}`}
        onClick={onActivate}
        title={displayName || 'Click to search product'}
      >
        <span className="pms-label">{displayName || 'Not in library'}</span>
        <Search size={12} className="pms-search-icon" />
      </button>

      {isActive && (
        <div className="pms-dropdown">
          <div className="pms-search-wrap">
            <Search size={14} />
            <input
              type="text"
              className="pms-search-input"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="pms-list">
            {override && (
              <button
                type="button"
                className="pms-item pms-item-selected"
                onClick={() => { onSelect(override); setSearch(''); }}
              >
                <span className="pms-item-name">{override.product_name}</span>
                {override.mrp > 0 && <span className="pms-item-mrp">₹{Number(override.mrp).toFixed(2)}</span>}
                <span className="pms-item-badge">selected</span>
              </button>
            )}
            {filtered.length === 0 && (
              <div className="pms-empty">No matching products found</div>
            )}
            {filtered.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`pms-item ${override?.product_id === s.product_id ? 'pms-item-selected' : ''}`}
                onClick={() => { onSelect(s); setSearch(''); }}
              >
                <span className="pms-item-name">{s.product_name}</span>
                {s.mrp > 0 && <span className="pms-item-mrp">₹{Number(s.mrp).toFixed(2)}</span>}
                <span className="pms-item-conf">{Math.round(s.confidence * 100)}%</span>
              </button>
            ))}
          </div>
          {override && (
            <button
              type="button"
              className="pms-clear"
              onClick={() => { onClear(); setSearch(''); onActivate(); }}
            >
              Reset to auto-match
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VendorSearchCell({ vendorName, vendorMatch, selectedVendorId, onSelect, onAddVendor, onChange }) {
  const [search, setSearch] = React.useState(vendorName || '');
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [allVendors, setAllVendors] = React.useState([]);
  const [loadingVendors, setLoadingVendors] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      const handler = (e) => {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open]);

  React.useEffect(() => {
    setSearch(vendorName || '');
  }, [vendorName]);

  React.useEffect(() => {
    if (open && allVendors.length === 0 && !loadingVendors) {
      setLoadingVendors(true);
      api.get('/vendors', { params: { limit: 1000 } })
        .then(res => {
          const list = res.data?.data || res.data?.vendors || [];
          setAllVendors(list);
        })
        .catch(() => {})
        .finally(() => setLoadingVendors(false));
    }
  }, [open, allVendors.length, loadingVendors]);

  const suggestions = vendorMatch?.suggestions || [];
  const isMatched = vendorMatch?.matched && selectedVendorId;

  const mergedVendors = React.useMemo(() => {
    const map = new Map();
    for (const s of suggestions) {
      if (s.vendor_id) map.set(String(s.vendor_id), { vendor_id: s.vendor_id, vendor_name: s.vendor_name, confidence: s.confidence || 0, source: 'ai' });
    }
    for (const v of allVendors) {
      const id = v.id || v.vendor_id;
      if (id) {
        if (map.has(String(id))) {
          const existing = map.get(String(id));
          if (!existing.source) existing.source = 'all';
        } else {
          map.set(String(id), { vendor_id: id, vendor_name: v.name || v.vendor_name, confidence: 0, source: 'all' });
        }
      } else if (v.name || v.vendor_name) {
        const key = `name_${(v.name || v.vendor_name).toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, { vendor_id: null, vendor_name: v.name || v.vendor_name, confidence: 0, source: 'all' });
        }
      }
    }
    return Array.from(map.values());
  }, [suggestions, allVendors]);

  const filtered = search.trim()
    ? mergedVendors.filter(s =>
        s.vendor_name && normalizeVendorName(s.vendor_name).includes(normalizeVendorName(search))
      )
    : mergedVendors;

  const exactMatchExists = mergedVendors.some(s =>
    s.vendor_name && normalizeVendorName(s.vendor_name) === normalizeVendorName(search.trim())
  );
  const showAddOption = search.trim().length >= 2 && !exactMatchExists;

  const SIMILARITY_THRESHOLD = 0.85;
  const fuzzyMatches = search.trim().length >= 2 && filtered.length === 0
    ? mergedVendors
        .map(s => ({
          ...s,
          _score: s.vendor_name ? vendorNameSimilarity(s.vendor_name, search.trim()) : 0
        }))
        .filter(s => s._score >= SIMILARITY_THRESHOLD)
        .sort((a, b) => b._score - a._score)
        .slice(0, 3)
    : [];

  const handleSelect = (v) => {
    onSelect(v);
    setSearch(v.name);
    setOpen(false);
  };

  return (
    <div className="pms-wrapper" ref={ref}>
      <div className="pms-trigger" onClick={() => setOpen(!open)} style={{ cursor: 'pointer', borderBottom: open ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
        <input
          type="text"
          className="pms-search-input"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', color: 'var(--text-primary)', padding: '4px 0' }}
          value={search}
          onChange={e => { setSearch(e.target.value); onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          placeholder="Vendor name"
        />
        {isMatched && <span className="pms-item-badge" style={{ fontSize: 9 }}>{Math.round((vendorMatch.confidence || 0) * 100)}%</span>}
      </div>

      {open && (
        <div className="pms-dropdown">
          <div className="pms-list">
            {loadingVendors && (
              <div className="pms-empty"><Loader2 className="spin" size={12} /> Loading vendors...</div>
            )}
            {!loadingVendors && filtered.length === 0 && fuzzyMatches.length === 0 && !showAddOption && (
              <div className="pms-empty">Type to search vendors</div>
            )}
            {filtered.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`pms-item ${String(s.vendor_id) === selectedVendorId ? 'pms-item-selected' : ''}`}
                onClick={() => handleSelect({ id: s.vendor_id, name: s.vendor_name })}
              >
                <span className="pms-item-name">{s.vendor_name}</span>
                {s.confidence > 0 && <span className="pms-item-conf">{Math.round(s.confidence * 100)}%</span>}
                {s.source === 'ai' && <span className="pms-item-badge" style={{ fontSize: 9 }}>match</span>}
              </button>
            ))}
            {!loadingVendors && fuzzyMatches.length > 0 && (
              <>
                {filtered.length > 0 && <div className="pms-divider" />}
                <div className="pms-suggestion-header">Did you mean?</div>
                {fuzzyMatches.map((s, i) => (
                  <button
                    key={`fuzzy-${i}`}
                    type="button"
                    className="pms-item"
                    onClick={() => handleSelect({ id: s.vendor_id, name: s.vendor_name })}
                  >
                    <span className="pms-item-name">{s.vendor_name}</span>
                    <span className="pms-item-conf">{Math.round(s._score * 100)}%</span>
                  </button>
                ))}
              </>
            )}
            {showAddOption && (
              <button
                type="button"
                className="pms-item"
                style={{ borderTop: filtered.length > 0 || fuzzyMatches.length > 0 ? '1px solid var(--border)' : 'none', color: 'var(--accent)' }}
                onClick={async () => {
                  setAdding(true);
                  try {
                    await onAddVendor(search.trim());
                    setAdding(false);
                    setOpen(false);
                  } catch { setAdding(false); }
                }}
                disabled={adding}
              >
                {adding ? 'Adding...' : `+ Add "${search.trim()}" as new vendor`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  const [extractionProgress, setExtractionProgress] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [itemMatches, setItemMatches] = useState([]);
  const [productOverrides, setProductOverrides] = useState({});
  const [vendorMatch, setVendorMatch] = useState(null);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [activeSelector, setActiveSelector] = useState(null);
  const cleanupSocketRef = useRef(null);

  useEffect(() => {
    return () => {
      if (cleanupSocketRef.current) {
        cleanupSocketRef.current();
        cleanupSocketRef.current = null;
      }
    };
  }, []);

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
    setExtractionProgress(null);

    const socket = getSocket();
    const socketId = socket?.id || null;

    if (socketId) {
      cleanupSocketRef.current = onSocketEvent('billExtractionProgress', (progress) => {
        if (progress.stage === 'failed') {
          setExtractionProgress(null);
          setError(progress.message || 'Extraction failed. Please try again.');
          setForm({ ...EMPTY_FORM, items: [{ ...EMPTY_FORM.items[0] }] });
          setStep('review');
          return;
        }
        setExtractionProgress(progress);
      });
    }

    try {
      const formData = new FormData();
      for (const page of pages) {
        formData.append('billPages', page);
      }
      if (socketId) {
        formData.append('socketId', socketId);
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
          setItemMatches([]);
          setStep('review');
        } else {
          console.log('[BillExtraction] Extracted data keys:', Object.keys(d));
          console.log('[BillExtraction] Extracted data values:', d);
          setQueueStatus(response.data.queueStatus || null);
          setItemMatches(response.data.itemMatches || []);
          setVendorMatch(response.data.vendorMatch || null);
          if (response.data.vendorMatch?.matched) {
            setSelectedVendorId(String(response.data.vendorMatch.vendor_id));
          }
          setProductOverrides({});
          setActiveSelector(null);
          const extractedItems = (d.items && d.items.length > 0)
            ? d.items.map((item, idx) => {
                const match = (response.data.itemMatches || [])[idx];
                return {
                  description: item.description || item.name || '',
                  quantity: item.quantity != null ? String(item.quantity) : (item.qty != null ? String(item.qty) : ''),
                  rate: item.rate != null ? String(item.rate) : '',
                  amount: item.amount != null ? String(item.amount) : '',
                  hsn_sac: item.hsn_sac || item.hsn || '',
                  sell_price: match?.mrp ? String(match.mrp) : '',
                  _originalIndex: idx,
                };
              })
            : [EMPTY_ITEM()];
          setForm({
            vendor_name: d.vendor_name || d.vendorName || '',
            bill_number: d.bill_number || d.billNumber || '',
            bill_date: d.bill_date || d.billDate || '',
            gst_number: d.gst_number || d.gstNumber || d.gstin || '',
            items: extractedItems,
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
      setItemMatches([]);
      setStep('review');
    } finally {
      setLoading(false);
      if (cleanupSocketRef.current) {
        cleanupSocketRef.current();
        cleanupSocketRef.current = null;
      }
    }
  }, [pages]);

  const updateField = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateItem = useCallback((index, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      const updatedItem = { ...items[index], [field]: value };
      
      if (field === 'quantity' || field === 'rate') {
        const qty = Number(updatedItem.quantity);
        const rate = Number(updatedItem.rate);
        if (!isNaN(qty) && !isNaN(rate) && qty >= 0 && rate >= 0) {
          updatedItem.amount = String(Number((qty * rate).toFixed(2)));
        }
      }
      items[index] = updatedItem;

      // Recalculate subtotal and total
      const newSubtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const tax = Number(prev.tax_amount) || 0;

      return { 
        ...prev, 
        items,
        subtotal: String(Number(newSubtotal.toFixed(2))),
        total_amount: String(Number((newSubtotal + tax).toFixed(2)))
      };
    });
  }, []);

  const addItem = useCallback(() => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, EMPTY_ITEM()],
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
        .map((item, idx) => {
          const origIdx = item._originalIndex;
          const match = origIdx >= 0 ? (itemMatches[origIdx] || {}) : {};
          const override = origIdx >= 0 ? productOverrides[origIdx] : undefined;
          return {
            item_name: item.description,
            quantity: Number(item.quantity) || 0,
            rate: Number(item.rate) || 0,
            amount: Number(item.amount) || 0,
            serial_no: idx + 1,
            hsn_sac: item.hsn_sac || '',
            gst_percent: 0,
            mrp: (override?.mrp ?? match.mrp) || 0,
            sell_price: Number(item.sell_price) || 0,
            sku: '',
            category_id: null,
            subcategory_id: null,
            category_name: '',
            subcategory_name: '',
            skip_product_library: true,
          };
        });

      const uploadFormData = new FormData();
      if (pages.length > 0) uploadFormData.append('file', pages[0]);
      uploadFormData.append('document_type', 'Vendor Bill');
      uploadFormData.append('related_tab', 'vendors');
      uploadFormData.append('vendor_name', form.vendor_name.trim());
      uploadFormData.append('bill_number', form.bill_number.trim());
      if (form.bill_date) uploadFormData.append('bill_date', form.bill_date);
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
  }, [form, pages, itemMatches, productOverrides, onSuccess, onError]);

  const handleRetry = useCallback(() => {
    setError('');
    setStep('upload');
    setPages([]);
    setForm({ ...EMPTY_FORM, items: [{ ...EMPTY_FORM.items[0] }] });
    setQueueStatus(null);
    setExtractionProgress(null);
    setItemMatches([]);
    setVendorMatch(null);
    setSelectedVendorId('');
    setProductOverrides({});
    setActiveSelector(null);
    if (cleanupSocketRef.current) {
      cleanupSocketRef.current();
      cleanupSocketRef.current = null;
    }
  }, []);

  const handleVendorSelect = useCallback((vendor) => {
    if (vendor) {
      setSelectedVendorId(String(vendor.id));
      updateField('vendor_name', vendor.name);
    }
  }, [updateField]);

  const handleGoToPricing = useCallback(() => {
    setStep('pricing');
  }, []);

  const handleBackToReview = useCallback(() => {
    setStep('review');
  }, []);

  const handleProductSelect = useCallback((originalIdx, product) => {
    setProductOverrides(prev => ({
      ...prev,
      [originalIdx]: product,
    }));
    setActiveSelector(null);
  }, []);

  const clearProductOverride = useCallback((originalIdx) => {
    setProductOverrides(prev => {
      const next = { ...prev };
      delete next[originalIdx];
      return next;
    });
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
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setForm({
                ...EMPTY_FORM,
                bill_date: today,
                items: [{ ...EMPTY_FORM.items[0] }]
              });
              setPages([]);
              setError('');
              setItemMatches([]);
              setVendorMatch(null);
              setSelectedVendorId('');
              setProductOverrides({});
              setActiveSelector(null);
              setStep('review');
            }}
          >
            Enter Manually
          </button>
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
    const stage = extractionProgress?.stage || 'uploading';
    const percent = extractionProgress?.percent || 5;
    const label = extractionProgress?.label || 'Starting extraction...';
    const pageInfo = extractionProgress?.page;

    return (
      <div className="extraction-review">
        <div className="extraction-progress">
          <div className="extraction-progress-header">
            <Loader2 className="spin" size={20} />
            <div className="extraction-progress-title">Extracting Bill Data</div>
          </div>

          <div className="extraction-progress-bar-track">
            <div
              className="extraction-progress-bar-fill"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="extraction-progress-label">{label}</div>

          {pageInfo && pageInfo.total > 1 && (
            <div className="extraction-progress-page">
              Page {pageInfo.current} of {pageInfo.total}
            </div>
          )}

          <div className="extraction-progress-stages">
            {(() => {
              const stageOrder = ['uploading', 'ocr_processing', 'ai_extracting', 'matching', 'complete'];
              const serverToDisplay = { uploading: 0, ocr_processing: 1, ocr_complete: 2, ai_extracting: 2, matching: 3, complete: 4 };
              const displayIdx = serverToDisplay[stage] ?? 0;
              return stageOrder.map((s, idx) => {
                const isActive = idx <= displayIdx;
                const isCurrent = idx === displayIdx;
                return (
                  <div key={s} className={`extraction-progress-stage${isActive ? ' active' : ''}${isCurrent ? ' current' : ''}`}>
                    <div className="extraction-progress-dot" />
                    <span>{s === 'ocr_processing' ? 'OCR' : s === 'ai_extracting' ? 'AI' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  </div>
                );
              });
            })()}
          </div>

          {stage === 'ocr_complete' || stage === 'ocr_processing' || stage === 'uploading' ? (
            <p className="extraction-progress-hint">Reading text from your bill images...</p>
          ) : stage === 'ai_extracting' ? (
            <p className="extraction-progress-hint">Analyzing text with AI to extract fields...</p>
          ) : stage === 'matching' ? (
            <p className="extraction-progress-hint">Matching vendors and products in database...</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === 'pricing') {
    return (
      <div className="extraction-review">
        <div className="extraction-review-header">
          <h2>Set Sale Prices</h2>
          <p className="extraction-subtitle">Set the selling price for each item. Matched products from the library show their MRP.</p>
        </div>

        {error && (
          <div className="extraction-error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="extraction-items-table-wrapper">
          <table className="extraction-items-table extraction-pricing-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>HSN/SAC</th>
                <th>Qty</th>
                <th>Matched Product</th>
                <th>MRP (₹)</th>
                <th>Sale Price (₹)</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, idx) => {
                if (!item.description.trim()) return null;
                const origIdx = item._originalIndex;
                const match = origIdx >= 0 ? (itemMatches[origIdx] || {}) : {};
                const override = origIdx >= 0 ? productOverrides[origIdx] : undefined;
                const selectorKey = `p-${origIdx >= 0 ? origIdx : idx}`;
                return (
                  <tr key={idx}>
                    <td><span className="extraction-pricing-item-name">{item.description}</span></td>
                    <td><span className="extraction-pricing-cell">{item.hsn_sac || '—'}</span></td>
                    <td><span className="extraction-pricing-cell">{item.quantity || '—'}</span></td>
                    <td className="extraction-pricing-product-cell">
                      <ProductSearchCell
                        match={match}
                        override={override}
                        isActive={activeSelector === selectorKey}
                        onActivate={() => setActiveSelector(activeSelector === selectorKey ? null : selectorKey)}
                        onSelect={(product) => handleProductSelect(origIdx >= 0 ? origIdx : idx, product)}
                        onClear={() => origIdx >= 0 && clearProductOverride(origIdx)}
                      />
                    </td>
                    <td>
                      {(override?.mrp || match.mrp) ? (
                        <span className="extraction-pricing-mrp">₹{Number(override?.mrp || match.mrp).toFixed(2)}</span>
                      ) : (
                        <span className="extraction-pricing-cell">—</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className="extraction-pricing-input"
                        value={item.sell_price}
                        onChange={e => updateItem(idx, 'sell_price', e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="extraction-totals-grid">
          <div className="extraction-field">
            <label>Subtotal</label>
            <input type="number" step="any" min="0" value={form.subtotal} readOnly placeholder="0.00" />
          </div>
          <div className="extraction-field">
            <label>Tax Amount</label>
            <input type="number" step="any" min="0" value={form.tax_amount} readOnly placeholder="0.00" />
          </div>
          <div className="extraction-field extraction-field-highlight">
            <label>Total Amount</label>
            <input type="number" step="any" min="0" value={form.total_amount} readOnly placeholder="0.00" />
          </div>
        </div>

        <div className="extraction-actions extraction-actions-bottom">
          <button className="btn btn-outline" onClick={handleBackToReview}>
            <ArrowLeft size={16} /> Back to Review
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="spin" size={16} /> : <CheckCircle size={16} />}
            {saving ? 'Saving...' : 'Save Bill'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="extraction-review">
      <div className="extraction-review-header">
        <h2>{pages.length > 0 ? 'Review Extracted Data' : 'Enter Bill Details'}</h2>
        {pages.length > 0 ? (
          <div className="extraction-badge">
            <SparklesIcon /> AI-extracted, please verify
          </div>
        ) : (
          <div className="extraction-badge-manual">
            Manual Entry
          </div>
        )}
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
          <VendorSearchCell
            vendorName={form.vendor_name}
            vendorMatch={vendorMatch}
            selectedVendorId={selectedVendorId}
            onSelect={handleVendorSelect}
            onChange={(val) => { setSelectedVendorId(''); updateField('vendor_name', val); }}
            onAddVendor={async (name) => {
              const res = await api.post('/vendors', { name, gst_number: form.gst_number || '' });
              if (res.data?.success) {
                const v = res.data.data;
                handleVendorSelect({ id: v.id, name: v.name || name });
                toast.success(`Vendor "${name}" added`);
              }
            }}
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
              <th>HSN/SAC</th>
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
                    type="text"
                    value={item.hsn_sac}
                    onChange={e => updateItem(i, 'hsn_sac', e.target.value)}
                    placeholder="HSN/SAC"
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
            onChange={e => {
              const sub = Number(e.target.value) || 0;
              const tax = Number(form.tax_amount) || 0;
              setForm(prev => ({
                ...prev,
                subtotal: e.target.value,
                total_amount: String(Number((sub + tax).toFixed(2)))
              }));
            }}
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
            onChange={e => {
              const tax = Number(e.target.value) || 0;
              const sub = Number(form.subtotal) || 0;
              setForm(prev => ({
                ...prev,
                tax_amount: e.target.value,
                total_amount: String(Number((sub + tax).toFixed(2)))
              }));
            }}
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
          {pages.length > 0 && <span className="extraction-field-note">Manually verify — AI may misread</span>}
        </div>
      </div>

      <div className="extraction-actions extraction-actions-bottom">
        <button className="btn btn-outline" onClick={handleRetry}>
          {pages.length > 0 ? 'Upload Different Bill' : 'Go Back'}
        </button>
        <button className="btn btn-primary" onClick={handleGoToPricing} disabled={saving}>
          Next — Set Prices <ChevronRight size={16} />
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

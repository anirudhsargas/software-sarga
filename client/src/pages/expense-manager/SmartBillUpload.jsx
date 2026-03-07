import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, AlertCircle, Loader2, CheckCircle, Link2, Plus } from 'lucide-react';
import api from '../../services/api';
import './SmartBillUpload.css';

const SmartBillUpload = ({ onClose, onSuccess, onError }) => {
  const [step, setStep] = useState('upload'); // upload | extracting | suggestions | linking | confirming
  const [file, setFile] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [linkedProduct, setLinkedProduct] = useState(null);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [editableItems, setEditableItems] = useState([]);
  const [finalForm, setFinalForm] = useState({
    document_type: 'Invoice',
    vendor_name: '',
    bill_number: '',
    bill_date: '',
    amount: '',
    description: '',
    related_tab: ''
  });
  const fileInputRef = useRef(null);

  const buildEditableItems = (items = []) => {
    return items.map((item) => {
      const quantity = item.quantity ?? '';
      const rate = item.rate ?? '';
      const gstPercent = item.gst_percent ?? '';
      const taxable = item.taxable_amount ?? (quantity && rate ? Number(quantity) * Number(rate) : '');
      const gstAmount = (taxable !== '' && gstPercent !== '')
        ? (Number(taxable) * Number(gstPercent) / 100)
        : '';
      const mrp = item.total_amount ?? (taxable !== '' && gstAmount !== '' ? Number(taxable) + Number(gstAmount) : taxable);

      return {
        item_name: item.description || '',
        hsn_sac: item.hsn_sac || '',
        quantity,
        rate,
        gst_percent: gstPercent,
        mrp: mrp !== '' && Number.isFinite(Number(mrp)) ? Number(mrp).toFixed(2) : ''
      };
    });
  };

  const updateEditableItem = (index, key, value) => {
    setEditableItems((prev) => {
      const next = [...prev];
      const row = { ...next[index], [key]: value };

      if (key === 'quantity' || key === 'rate' || key === 'gst_percent') {
        const quantity = Number(row.quantity || 0);
        const rate = Number(row.rate || 0);
        const gstPercent = Number(row.gst_percent || 0);
        const taxable = quantity * rate;
        const total = taxable + (taxable * gstPercent / 100);
        row.mrp = Number.isFinite(total) ? total.toFixed(2) : row.mrp;
      }

      next[index] = row;
      return next;
    });
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files || e.target.files;
    if (files?.[0]) {
      setFile(files[0]);
      setError('');
    }
  };

  const extractBillDetails = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/bills-documents/extract-details', formData);
      setExtractedData(response.data);
      setEditableItems(buildEditableItems(response.data.extracted_data?.items || []));
      setStep('suggestions');

      // Pre-fill form with extracted data
      setFinalForm(prev => ({
        ...prev,
        document_type: response.data.extracted_data.detected_type || 'Invoice',
        vendor_name: response.data.extracted_data.vendor_name || '',
        bill_number: response.data.extracted_data.bill_number || '',
        bill_date: response.data.extracted_data.bill_date || '',
        amount: response.data.extracted_data.amount || '',
        related_tab: response.data.category_suggestions?.[0]?.related_tab || ''
      }));

      // Fetch product suggestions if keywords found
      if (response.data.extracted_data.items?.length > 0) {
        const keywords = response.data.extracted_data.items
          .slice(0, 2)
          .map(item => item.description)
          .join(' ');
        fetchProductSuggestions(keywords);
      }
    } catch (err) {
      console.error('[SmartBillUpload] Extraction failed:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to extract bill details';
      setError(errorMsg);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductSuggestions = async (keyword) => {
    try {
      const response = await api.get('/bills-documents/suggest-products', {
        params: { keyword }
      });
      setProductSuggestions(response.data);
    } catch (err) {
      console.error('Failed to fetch product suggestions:', err);
    }
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setFinalForm(prev => ({
      ...prev,
      related_tab: category.related_tab
    }));
  };

  const handleProductLink = (product) => {
    setLinkedProduct(product);
    setStep('linking');
  };

  const submitForm = async () => {
    if (!finalForm.amount) {
      setError('Amount is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', finalForm.document_type);
      formData.append('related_tab', finalForm.related_tab);
      formData.append('vendor_name', finalForm.vendor_name);
      formData.append('bill_number', finalForm.bill_number);
      formData.append('bill_date', finalForm.bill_date);
      formData.append('amount', finalForm.amount);
      const autoDescription = editableItems.length > 0
        ? editableItems.slice(0, 6).map((item) => item.item_name).filter(Boolean).join(', ')
        : '';
      formData.append('description', finalForm.description || autoDescription);
      formData.append('line_items', JSON.stringify(editableItems));

      const response = await api.post('/bills-documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // If product is linked, create inventory entry
      if (linkedProduct?.should_add) {
        try {
          await api.post(`/bills-documents/${response.data.id}/link-product`, {
            product_id: linkedProduct.product_id,
            quantity: linkedProduct.quantity,
            unit_price: linkedProduct.unit_price,
            add_to_inventory: true
          });
        } catch (err) {
          console.error('Failed to link product, but bill still uploaded:', err);
        }
      }

      setStep('confirming');
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload bill');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="smart-bill-upload-modal" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="modal-overlay" />
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>

        {/* UPLOAD STEP */}
        {step === 'upload' && (
          <div className="upload-section">
            <h2>📄 Smart Bill Upload</h2>
            <p className="subtitle">Upload bill image or PDF to auto-extract details</p>

            <div
              className="upload-area"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={48} />
              <h3>Drag & drop your bill here</h3>
              <p>or click to select a file</p>
              <small>Supports PNG, JPG, PDF (max 10MB)</small>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => handleFileDrop(e)}
              />
            </div>

            {file && (
              <div className="file-selected">
                <CheckCircle size={20} className="text-green-500" />
                <span>{file.name}</span>
                <button onClick={() => setFile(null)} className="btn-remove">
                  Change
                </button>
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={extractBillDetails}
              disabled={!file || loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Extracting...
                </>
              ) : (
                'Extract Details'
              )}
            </button>
          </div>
        )}

        {/* SUGGESTIONS STEP */}
        {step === 'suggestions' && extractedData && (
          <div className="suggestions-section">
            <h2>✨ Extracted Information</h2>

            {/* Low confidence warning */}
            {extractedData.confidence < 0.5 && (
              <div className="low-confidence-warning">
                <AlertCircle size={16} />
                <span>
                  Low extraction confidence ({Math.round((extractedData.confidence || 0) * 100)}%).
                  For better results, upload a <strong>higher resolution image</strong> or a <strong>PDF</strong> directly.
                </span>
              </div>
            )}

            {/* Extracted Data Display */}
            <div className="extracted-data-card">
              <h3>Basic Details</h3>
              <div className="data-grid">
                <div className="data-item">
                  <label>Amount (₹)</label>
                  <input
                    type="number"
                    value={finalForm.amount}
                    onChange={(e) => setFinalForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="data-item">
                  <label>Bill Number</label>
                  <input
                    type="text"
                    value={finalForm.bill_number}
                    onChange={(e) => setFinalForm(prev => ({ ...prev, bill_number: e.target.value }))}
                    placeholder="e.g., INV-001"
                  />
                </div>
                <div className="data-item">
                  <label>Bill Date</label>
                  <input
                    type="date"
                    value={finalForm.bill_date}
                    onChange={(e) => setFinalForm(prev => ({ ...prev, bill_date: e.target.value }))}
                  />
                </div>
                <div className="data-item" style={{ gridColumn: '1 / 3' }}>
                  <label>Vendor Name</label>
                  <input
                    type="text"
                    value={finalForm.vendor_name}
                    onChange={(e) => setFinalForm(prev => ({ ...prev, vendor_name: e.target.value }))}
                    placeholder="Vendor or supplier name"
                  />
                </div>
                <div className="data-item">
                  <label>Type</label>
                  <input
                    type="text"
                    value={finalForm.document_type}
                    onChange={(e) => setFinalForm(prev => ({ ...prev, document_type: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Category Suggestions */}
            {extractedData.category_suggestions?.length > 0 && (
              <div className="suggestions-section">
                <h3>Suggested Category</h3>
                <div className="suggestion-chips">
                  {extractedData.category_suggestions.slice(0, 3).map((cat, idx) => (
                    <button
                      key={idx}
                      className={`chip ${selectedCategory?.type === cat.type ? 'active' : ''}`}
                      onClick={() => handleCategorySelect(cat)}
                    >
                      {cat.type}
                      <small>{Math.round(cat.score * 100)}%</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Product Suggestions */}
            {extractedData.inventory_suggestions?.length > 0 && (
              <div className="suggestions-section">
                <h3>
                  <Plus size={18} /> Suggested Products to Add to Stock
                </h3>
                <div className="product-suggestions">
                  {extractedData.inventory_suggestions.slice(0, 4).map((product, idx) => (
                    <div key={idx} className="product-suggestion-card">
                      <div className="product-info">
                        <h4>{product.name}</h4>
                        <small>{product.category}</small>
                        <span className="unit-badge">{product.unit}</span>
                      </div>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleProductLink({
                          product_id: product.matched_keyword,
                          quantity: 1,
                          unit_price: 0,
                          name: product.name
                        })}
                      >
                        Add to Stock
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted Items Editable Table */}
            {editableItems.length > 0 && (
              <div className="items-section">
                <h3>Items from Bill (Editable)</h3>
                <div className="items-table-wrap">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>HSN/SAC</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>GST %</th>
                        <th>MRP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="text"
                              value={item.item_name}
                              onChange={(e) => updateEditableItem(idx, 'item_name', e.target.value)}
                              placeholder="Item name"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={item.hsn_sac}
                              onChange={(e) => updateEditableItem(idx, 'hsn_sac', e.target.value)}
                              placeholder="HSN"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateEditableItem(idx, 'quantity', e.target.value)}
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.rate}
                              onChange={(e) => updateEditableItem(idx, 'rate', e.target.value)}
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.gst_percent}
                              onChange={(e) => updateEditableItem(idx, 'gst_percent', e.target.value)}
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.mrp}
                              onChange={(e) => updateEditableItem(idx, 'mrp', e.target.value)}
                              min="0"
                              step="0.01"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && (
              <div className="error-message">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <div className="action-buttons">
              <button className="btn btn-outline" onClick={() => setStep('upload')}>
                Upload Different File
              </button>
              <button className="btn btn-primary" onClick={submitForm} disabled={loading || !finalForm.amount}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload Bill'
                )}
              </button>
            </div>
          </div>
        )}

        {/* LINKING STEP */}
        {step === 'linking' && linkedProduct && (
          <div className="linking-section">
            <h2>
              <Link2 size={24} /> Link Product to Bill
            </h2>
            <p>Configure how to add this product to inventory</p>

            <div className="product-link-form">
              <div className="form-group">
                <label>Product</label>
                <input type="text" value={linkedProduct.name} disabled />
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  value={linkedProduct.quantity}
                  onChange={(e) =>
                    setLinkedProduct(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))
                  }
                  min="1"
                />
              </div>
              <div className="form-group">
                <label>Unit Price</label>
                <input
                  type="number"
                  value={linkedProduct.unit_price}
                  onChange={(e) =>
                    setLinkedProduct(prev => ({ ...prev, unit_price: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="0.00"
              />
              </div>
              <div className="form-group checkbox">
                <input
                  type="checkbox"
                  id="add-to-inventory"
                  checked={linkedProduct.should_add || false}
                  onChange={(e) =>
                    setLinkedProduct(prev => ({ ...prev, should_add: e.target.checked }))
                  }
                />
                <label htmlFor="add-to-inventory">Add to Inventory</label>
              </div>
            </div>

            <div className="action-buttons">
              <button className="btn btn-outline" onClick={() => setStep('suggestions')}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setStep('suggestions');
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {/* CONFIRMING STEP */}
        {step === 'confirming' && (
          <div className="confirming-section">
            <div className="success-icon">
              <CheckCircle size={64} className="text-green-500" />
            </div>
            <h2>✅ Bill Uploaded Successfully!</h2>
            <p>Your bill has been processed and added to the system.</p>
            {linkedProduct?.should_add && (
              <p className="success-sub">Product has been added to inventory.</p>
            )}
            <div className="action-buttons" style={{ justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => {
                setStep('upload');
                setFile(null);
                setExtractedData(null);
                setEditableItems([]);
                setLinkedProduct(null);
                setProductSuggestions([]);
                setError('');
                setFinalForm({
                  document_type: 'Invoice',
                  vendor_name: '',
                  bill_number: '',
                  bill_date: '',
                  amount: '',
                  description: '',
                  related_tab: ''
                });
              }}>
                Upload Another Bill
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SmartBillUpload;

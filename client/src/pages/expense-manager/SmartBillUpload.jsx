import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, AlertCircle, Loader2, CheckCircle, Link2, Plus } from 'lucide-react';
import api from '../../services/api';
import './SmartBillUpload.css';

const SmartBillUpload = ({ onClose, onSuccess, onError }) => {
  const [step, setStep] = useState('upload'); // upload | extracting | suggestions | pricing | linking | confirming
  const [file, setFile] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [linkedProduct, setLinkedProduct] = useState(null);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [editableItems, setEditableItems] = useState([]);
  const [hierarchyOptions, setHierarchyOptions] = useState([]);
  const [categoryMode, setCategoryMode] = useState('single');
  const [globalCategoryId, setGlobalCategoryId] = useState('');
  const [globalSubcategoryId, setGlobalSubcategoryId] = useState('');
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

  const normalizeDocumentType = (value, relatedTab = '') => {
    const raw = String(value || '').trim().toLowerCase();
    const tab = String(relatedTab || '').trim().toLowerCase();
    const map = {
      'invoice': 'Vendor Bill',
      'sales order': 'Vendor Bill',
      'bill': 'Vendor Bill',
      'vendor bill': 'Vendor Bill',
      'utility': 'Utility Bill',
      'utility bill': 'Utility Bill',
      'rent': 'Rent Receipt',
      'rent receipt': 'Rent Receipt',
      'emi': 'EMI Receipt',
      'emi receipt': 'EMI Receipt',
      'kuri': 'Kuri Receipt',
      'kuri receipt': 'Kuri Receipt',
      'transport': 'Transport Bill',
      'transport bill': 'Transport Bill',
      'office': 'Office Bill',
      'office bill': 'Office Bill',
      'petty cash': 'Petty Cash Receipt',
      'petty cash receipt': 'Petty Cash Receipt',
      'other': 'Other'
    };
    if (map[raw]) return map[raw];
    if (tab === 'vendors' || tab === 'vendor') return 'Vendor Bill';
    if (tab === 'utilities' || tab === 'utility') return 'Utility Bill';
    if (tab === 'rent') return 'Rent Receipt';
    if (tab === 'transport') return 'Transport Bill';
    if (tab === 'office') return 'Office Bill';
    return 'Other';
  };

  const buildEditableItems = (items = []) => {
    return items.map((item, index) => {
      const quantity = item.quantity ?? '';
      const rate = item.rate ?? '';
      const gstPercent = item.gst_percent ?? '';
      const taxable = item.taxable_amount ?? (quantity && rate ? Number(quantity) * Number(rate) : '');
      const gstAmount = (taxable !== '' && gstPercent !== '')
        ? (Number(taxable) * Number(gstPercent) / 100)
        : '';
      const mrp = item.total_amount ?? (taxable !== '' && gstAmount !== '' ? Number(taxable) + Number(gstAmount) : taxable);

      return {
        serial_no: item.serial_no ?? (index + 1),
        item_name: item.description || '',
        hsn_sac: item.hsn_sac || '',
        quantity,
        rate,
        gst_percent: gstPercent,
        mrp: mrp !== '' && Number.isFinite(Number(mrp)) ? Number(mrp).toFixed(2) : '',
        sell_price: '',
        sku: '',
        category_id: '',
        subcategory_id: '',
        category_name: '',
        subcategory_name: ''
      };
    });
  };

  const fetchHierarchyOptions = async (vendorName = '') => {
    try {
      const { data } = await api.get('/product-hierarchy');
      const categories = (Array.isArray(data) ? data : []).filter((cat) =>
        typeof cat?.id === 'number' && Array.isArray(cat?.subcategories)
      );
      setHierarchyOptions(categories);

      const vendorLower = String(vendorName || '').toLowerCase();
      const wantsMemento = /memento|troph|award|shield|plaque|souvenir/.test(vendorLower);
      if (wantsMemento) {
        const mementoCategory = categories.find((cat) => String(cat.name || '').toLowerCase().includes('memento'));
        const mementoSubcategory = mementoCategory?.subcategories?.find((sub) => String(sub.name || '').toLowerCase().includes('memento'))
          || mementoCategory?.subcategories?.[0];

        if (mementoCategory) {
          setGlobalCategoryId(String(mementoCategory.id));
          if (mementoSubcategory) {
            setGlobalSubcategoryId(String(mementoSubcategory.id));
            setEditableItems((prev) => prev.map((row) => ({
              ...row,
              category_id: String(mementoCategory.id),
              subcategory_id: String(mementoSubcategory.id),
              category_name: mementoCategory.name,
              subcategory_name: mementoSubcategory.name
            })));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load product hierarchy:', err);
      setHierarchyOptions([]);
    }
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

  const getSkuSuggestion = (item, index) => {
    const vendorCode = String(finalForm.vendor_name || 'INV')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.slice(0, 2))
      .join('')
      .slice(0, 3) || 'INV';

    const itemCode = String(item?.item_name || 'ITEM')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 8) || 'ITEM';

    const serial = String(item?.serial_no || index + 1).padStart(2, '0');
    return `${vendorCode}-${itemCode}-${serial}`;
  };

  const resolveItemCategory = (item) => {
    if (categoryMode === 'single') {
      const selectedCategory = hierarchyOptions.find((cat) => String(cat.id) === String(globalCategoryId));
      const selectedSubcategory = selectedCategory?.subcategories?.find((sub) => String(sub.id) === String(globalSubcategoryId));
      return {
        categoryId: selectedCategory?.id || item.category_id || null,
        subcategoryId: selectedSubcategory?.id || item.subcategory_id || null,
        categoryName: selectedCategory?.name || item.category_name || '',
        subcategoryName: selectedSubcategory?.name || item.subcategory_name || ''
      };
    }

    const rowCategory = hierarchyOptions.find((cat) => String(cat.id) === String(item.category_id));
    const rowSubcategory = rowCategory?.subcategories?.find((sub) => String(sub.id) === String(item.subcategory_id));
    return {
      categoryId: rowCategory?.id || item.category_id || null,
      subcategoryId: rowSubcategory?.id || item.subcategory_id || null,
      categoryName: rowCategory?.name || item.category_name || '',
      subcategoryName: rowSubcategory?.name || item.subcategory_name || ''
    };
  };

  const isMementoOrPhotoFrameItem = (item, resolvedCategory) => {
    const name = String(item?.item_name || '').toLowerCase();
    const categoryText = `${resolvedCategory?.categoryName || ''} ${resolvedCategory?.subcategoryName || ''}`.toLowerCase();
    return /memento|photo\s*frame|photoframe|frame|troph|award|shield|plaque|souvenir/.test(`${name} ${categoryText}`);
  };

  const isConsumableItem = (item, resolvedCategory) => {
    const name = String(item?.item_name || '').toLowerCase();
    const categoryText = `${resolvedCategory?.categoryName || ''} ${resolvedCategory?.subcategoryName || ''}`.toLowerCase();
    return /consumable|ink|toner|cartridge|ribbon|paper|sheet|sticker|label|adhesive|glue|lamination|pouch|tape/.test(`${name} ${categoryText}`);
  };

  const initPricingStep = () => {
    setEditableItems((prev) => prev.map((item) => {
      const cost = Number(item.rate || 0);
      const resolvedCategory = resolveItemCategory(item);
      const isConsumable = isConsumableItem(item, resolvedCategory);
      const isMementoOrFrame = isMementoOrPhotoFrameItem(item, resolvedCategory);

      return {
        ...item,
        sku: item.sku || getSkuSuggestion(item, Number(item.serial_no || 0) - 1),
        // For memento/photo frame suggest 2x cost. For consumables, keep sell price blank.
        sell_price: item.sell_price !== ''
          ? item.sell_price
          : (isConsumable ? '' : (isMementoOrFrame && cost > 0 ? (cost * 2).toFixed(2) : ''))
      };
    }));
    setStep('pricing');
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
      const response = await api.post('/bills-documents/extract-details', formData, {
        timeout: 120000,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
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

      fetchHierarchyOptions(response.data.extracted_data.vendor_name || '');

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
      const isTimeout = String(err?.code || '').toUpperCase() === 'ECONNABORTED';
      const errorMsg = isTimeout
        ? 'Extraction is taking too long. Please try a smaller/clearer file or retry in a moment.'
        : (err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to extract bill details');
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

  const isLowConfidence = Number(extractedData?.confidence || 1) < 0.5;

  const hasRequiredCategorySelection = () => {
    if (!isLowConfidence) return true;
    if (!editableItems.length) return true;

    if (categoryMode === 'single') {
      return Boolean(globalCategoryId && globalSubcategoryId);
    }

    if (categoryMode === 'per-item') {
      return editableItems.every((item) => Boolean(item.category_id && item.subcategory_id));
    }

    return false;
  };

  const submitForm = async () => {
    if (!finalForm.amount) {
      setError('Amount is required');
      return;
    }

    if (!hasRequiredCategorySelection()) {
      setError('Low confidence extraction: please select category and subcategory before uploading.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const buildUploadFormData = (payloadItems, forceDuplicate = false) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('document_type', normalizeDocumentType(finalForm.document_type, finalForm.related_tab));
        formData.append('related_tab', finalForm.related_tab);
        formData.append('vendor_name', finalForm.vendor_name);
        formData.append('bill_number', finalForm.bill_number);
        formData.append('bill_date', finalForm.bill_date);
        formData.append('amount', finalForm.amount);
        const autoDescription = editableItems.length > 0
          ? editableItems.slice(0, 6).map((item) => item.item_name).filter(Boolean).join(', ')
          : '';
        formData.append('description', finalForm.description || autoDescription);
        formData.append('line_items', JSON.stringify(payloadItems));
        if (forceDuplicate) {
          formData.append('force_duplicate', '1');
        }
        return formData;
      };

      const payloadItems = editableItems.map((item) => {
        const resolvedCategory = resolveItemCategory(item);
        const consumable = isConsumableItem(item, resolvedCategory);
        return {
          ...item,
          category_id: resolvedCategory.categoryId,
          subcategory_id: resolvedCategory.subcategoryId,
          category_name: resolvedCategory.categoryName,
          subcategory_name: resolvedCategory.subcategoryName,
          sku: String(item.sku || '').trim() || getSkuSuggestion(item, Number(item.serial_no || 0) - 1),
          sell_price: Number(item.sell_price || 0) || 0,
          skip_product_library: consumable
        };
      });

      let response;
      try {
        response = await api.post('/bills-documents/upload', buildUploadFormData(payloadItems), {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } catch (uploadErr) {
        const duplicateCode = uploadErr?.response?.data?.code;
        if (uploadErr?.response?.status === 409 && duplicateCode === 'POSSIBLE_DUPLICATE_BILL') {
          const proceed = window.confirm('This looks like a duplicate bill. Is this another bill? Click OK to upload anyway.');
          if (!proceed) {
            setLoading(false);
            return;
          }

          response = await api.post('/bills-documents/upload', buildUploadFormData(payloadItems, true), {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } else {
          throw uploadErr;
        }
      }

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

            {error && (
              <div className="error-message" role="alert" aria-live="polite">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
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
                <div className="category-assignment-card">
                  <div className="category-assignment-header">
                    <span className="category-assignment-title">Category &amp; Subcategory</span>
                    <span className="category-assignment-hint">Choose how to classify items in the product library</span>
                  </div>

                  <div className="category-mode-toggle">
                    <button
                      type="button"
                      className={`mode-toggle-btn${categoryMode === 'single' ? ' active' : ''}`}
                      onClick={() => setCategoryMode('single')}
                    >
                      All items same
                    </button>
                    <button
                      type="button"
                      className={`mode-toggle-btn${categoryMode === 'per-item' ? ' active' : ''}`}
                      onClick={() => setCategoryMode('per-item')}
                    >
                      Per-item
                    </button>
                  </div>

                  {categoryMode === 'single' && hierarchyOptions.length > 0 && (
                    <div className="category-selects-row">
                      <div className="category-select-group">
                        <label className="category-select-label">Category</label>
                        <select
                          className="category-select"
                          value={globalCategoryId}
                          onChange={(e) => {
                            const nextCategoryId = e.target.value;
                            setGlobalCategoryId(nextCategoryId);
                            setGlobalSubcategoryId('');
                          }}
                        >
                          <option value="">— Auto —</option>
                          {hierarchyOptions.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="category-select-group">
                        <label className="category-select-label">Subcategory</label>
                        <select
                          className="category-select"
                          value={globalSubcategoryId}
                          onChange={(e) => setGlobalSubcategoryId(e.target.value)}
                          disabled={!globalCategoryId}
                        >
                          <option value="">— Auto —</option>
                          {(hierarchyOptions.find((cat) => String(cat.id) === String(globalCategoryId))?.subcategories || []).map((sub) => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <h3>Items from Bill (Editable)</h3>
                <div className="items-table-wrap">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>SI No.</th>
                        <th>Item Name</th>
                        <th>HSN/SAC</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>GST %</th>
                        <th>MRP</th>
                        {categoryMode === 'per-item' && <th>Category</th>}
                        {categoryMode === 'per-item' && <th>Subcategory</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {editableItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="number"
                              value={item.serial_no}
                              onChange={(e) => updateEditableItem(idx, 'serial_no', e.target.value)}
                              min="1"
                              step="1"
                            />
                          </td>
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
                          {categoryMode === 'per-item' && (
                            <td>
                              <select
                                className="table-category-select"
                                value={item.category_id || ''}
                                onChange={(e) => {
                                  const categoryId = e.target.value;
                                  const category = hierarchyOptions.find((cat) => String(cat.id) === String(categoryId));
                                  setEditableItems((prev) => prev.map((row, rowIdx) => rowIdx === idx ? {
                                    ...row,
                                    category_id: categoryId,
                                    subcategory_id: '',
                                    category_name: category?.name || '',
                                    subcategory_name: ''
                                  } : row));
                                }}
                              >
                                <option value="">Auto</option>
                                {hierarchyOptions.map((cat) => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                              </select>
                            </td>
                          )}
                          {categoryMode === 'per-item' && (
                            <td>
                              <select
                                className="table-category-select"
                                value={item.subcategory_id || ''}
                                onChange={(e) => {
                                  const subcategoryId = e.target.value;
                                  const category = hierarchyOptions.find((cat) => String(cat.id) === String(item.category_id));
                                  const subcategory = category?.subcategories?.find((sub) => String(sub.id) === String(subcategoryId));
                                  setEditableItems((prev) => prev.map((row, rowIdx) => rowIdx === idx ? {
                                    ...row,
                                    subcategory_id: subcategoryId,
                                    subcategory_name: subcategory?.name || ''
                                  } : row));
                                }}
                                disabled={!item.category_id}
                              >
                                <option value="">Auto</option>
                                {(hierarchyOptions.find((cat) => String(cat.id) === String(item.category_id))?.subcategories || []).map((sub) => (
                                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                                ))}
                              </select>
                            </td>
                          )}
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
              <button className="btn btn-primary" onClick={editableItems.length > 0 ? initPricingStep : submitForm} disabled={loading || !finalForm.amount || !hasRequiredCategorySelection()}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    Uploading...
                  </>
                ) : (
                  editableItems.length > 0 ? 'Next: SKU & Pricing →' : 'Upload Bill'
                )}
              </button>
            </div>

            {isLowConfidence && !hasRequiredCategorySelection() && (
              <div className="error-message" style={{ marginTop: 10 }}>
                <AlertCircle size={18} />
                Category and subcategory selection is mandatory for low-confidence extraction.
              </div>
            )}
          </div>
        )}

        {/* PRICING STEP */}
        {step === 'pricing' && (
          <div className="pricing-section">
            <h2>💰 Set SKU &amp; Selling Price</h2>
            <p className="subtitle">Review purchase costs and confirm selling prices before saving to the product library.</p>

            <div className="pricing-table-wrap">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Cost (₹)</th>
                    <th>SKU</th>
                    <th>Selling Price (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {editableItems.map((item, idx) => {
                    const resolvedCategory = resolveItemCategory(item);
                    const consumable = isConsumableItem(item, resolvedCategory);
                    const suggestedSku = getSkuSuggestion(item, idx);
                    return (
                    <tr key={idx}>
                      <td className="pricing-item-name">
                        {item.item_name || `Item ${idx + 1}`}
                        {consumable && <div className="pricing-item-hint">Consumable: inventory-only</div>}
                      </td>
                      <td className="pricing-cost">₹{Number(item.rate || 0).toFixed(2)}</td>
                      <td>
                        <input
                          type="text"
                          className="pricing-input"
                          value={item.sku || ''}
                          onChange={(e) => updateEditableItem(idx, 'sku', e.target.value)}
                          placeholder={suggestedSku}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="pricing-input pricing-sell-input"
                          value={item.sell_price || ''}
                          onChange={(e) => updateEditableItem(idx, 'sell_price', e.target.value)}
                          placeholder={consumable ? 'Inventory only' : '0.00'}
                          min="0"
                          step="0.01"
                          disabled={consumable}
                        />
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <div className="action-buttons">
              <button className="btn btn-outline" onClick={() => setStep('suggestions')}>
                ← Back
              </button>
              <button className="btn btn-primary" onClick={submitForm} disabled={loading}>
                {loading ? (
                  <><Loader2 size={18} className="spin" /> Uploading...</>
                ) : (
                  'Confirm &amp; Upload'
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
                setHierarchyOptions([]);
                setCategoryMode('single');
                setGlobalCategoryId('');
                setGlobalSubcategoryId('');
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

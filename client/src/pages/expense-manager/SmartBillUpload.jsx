import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, AlertCircle, Loader2, CheckCircle, Link2, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import auth from '../../services/auth';
import localDb from '../../services/localDb';
import './SmartBillUpload.css';

const SmartBillUpload = ({ onClose, onSuccess, onError, defaultDocumentType, defaultRelatedTab }) => {
  const [step, setStep] = useState('upload'); // upload | extracting | suggestions | pricing | linking | confirming
  const [file, setFile] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [linkedProduct, setLinkedProduct] = useState(null);
  const [, setProductSuggestions] = useState([]);
  const [editableItems, setEditableItems] = useState([]);
  const [hierarchyOptions, setHierarchyOptions] = useState([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [categoryMode, setCategoryMode] = useState('single');
  const [globalCategoryId, setGlobalCategoryId] = useState('');
  const [globalSubcategoryId, setGlobalSubcategoryId] = useState('');
  const [mlPrediction, setMlPrediction] = useState(null);
  const [categoryOverridden, setCategoryOverridden] = useState(false);
  const [ocrRawText, setOcrRawText] = useState('');
  const [branches, setBranches] = useState([]);
  const [stockBranchId, setStockBranchId] = useState('');
  const [finalForm, setFinalForm] = useState({
    document_type: defaultDocumentType || 'Invoice',
    vendor_name: '',
    vendor_contact: '',
    bill_number: '',
    bill_date: '',
    amount: '',
    description: '',
    related_tab: defaultRelatedTab || ''
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

  const buildEditableItems = (items = [], fallbackGstPct = 0) => {
    return items.map((item, index) => {
      const quantity = item.quantity ?? '';
      // Support both rate and unit_price field names from different extraction paths
      const rate = item.rate ?? item.unit_price ?? '';
      // Use per-item gst_percent if available, else use bill-level inferred rate
      const gstPercent = (item.gst_percent != null && item.gst_percent !== '')
        ? item.gst_percent
        : (fallbackGstPct > 0 ? fallbackGstPct : '');
      const taxable = item.taxable_amount ?? (quantity !== '' && rate !== '' ? Number(quantity) * Number(rate) : '');
      const gstAmount = (taxable !== '' && gstPercent !== '' && Number(gstPercent) > 0)
        ? (Number(taxable) * Number(gstPercent) / 100)
        : '';
      // Prefer bill-stated MRP from OCR; fallback to computed taxable+GST; then to total_amount/amount
      const billMrp = (item.mrp != null && item.mrp !== '' && Number(item.mrp) > 0)
        ? Number(item.mrp)
        : null;
      const computedMrp = (taxable !== '' && gstAmount !== '')
        ? Number(taxable) + Number(gstAmount)
        : null;
      const mrp = billMrp ?? computedMrp ?? item.total_amount ?? item.amount ?? taxable;

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
    setHierarchyLoading(true);
    
    // Auto-set stock branch to current user's branch
    const userBranchId = auth.getUser()?.branch_id;
    if (userBranchId && !stockBranchId) {
      setStockBranchId(String(userBranchId));
    }
    
    api.get('/branches').then(r => setBranches(r.data || [])).catch(() => {});
    try {
      console.log('[SmartBillUpload] Fetching hierarchy...');
      const startTime = performance.now();
      
      // Try to get from localDb first
      let hierarchy = await localDb.getProducts();
      console.log('[SmartBillUpload] LocalDb load time:', (performance.now() - startTime).toFixed(0), 'ms, items:', Array.isArray(hierarchy) ? hierarchy.length : 0);
      
      // Fallback to API if localDb is empty - with timeout
      if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
          
          const apiResponse = await api.get('/product-hierarchy', { signal: controller.signal });
          clearTimeout(timeoutId);
          hierarchy = apiResponse.data;
          console.log('[SmartBillUpload] API load time:', (performance.now() - startTime).toFixed(0), 'ms, items:', Array.isArray(hierarchy) ? hierarchy.length : 0);
        } catch (apiErr) {
          const isTimeout = apiErr.code === 'ECONNABORTED' || String(apiErr.message).includes('timeout');
          console.warn('[SmartBillUpload] API load failed', { timeout: isTimeout, error: apiErr.message });
          // Continue with empty array - user can still use "Auto detect"
        }
      }
      
      const categories = (Array.isArray(hierarchy) ? hierarchy : []).filter((cat) =>
        typeof cat?.id === 'number' && Array.isArray(cat?.subcategories)
      );
      console.log('[SmartBillUpload] Filtered categories:', categories.length);
      setHierarchyOptions(categories);

      const vendorLower = String(vendorName || '').toLowerCase();
      const wantsMemento = /memento|troph|award|shield|plaque|souvenir/.test(vendorLower);
      if (wantsMemento && categories.length > 0) {
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
      console.error('[SmartBillUpload] Failed to load product hierarchy:', err);
      setHierarchyOptions([]);
      // Still continue - "Auto detect" is always available
    } finally {
      setHierarchyLoading(false);
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
      const rate = Number(item.rate || 0);
      const gstPct = Number(item.gst_percent || 0);
      // Cost per unit = rate + GST (the actual purchase price inclusive of tax)
      const cost = rate * (1 + gstPct / 100);
      const resolvedCategory = resolveItemCategory(item);
      const isConsumable = isConsumableItem(item, resolvedCategory);
      const isMementoOrFrame = isMementoOrPhotoFrameItem(item, resolvedCategory);

      return {
        ...item,
        sku: item.sku || getSkuSuggestion(item, Number(item.serial_no || 0) - 1),
        // For memento/photo frame suggest 2x cost (rate+GST), rounded up to nearest 5. For consumables, keep sell price blank.
        sell_price: item.sell_price !== ''
          ? item.sell_price
          : (isConsumable ? '' : (isMementoOrFrame && cost > 0 ? (Math.ceil(cost * 2 / 5) * 5).toFixed(0) : ''))
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
      const extractedItems = response.data.extracted_data?.items || [];
      // Derive a bill-level fallback GST rate from tax_amount/subtotal
      // so per-item GST can be inferred even when the server doesn't return it per line
      const billTax = Number(response.data.extracted_data?.tax || 0);
      const billSubtotal = Number(response.data.extracted_data?.subtotal || 0);
      const fallbackGstPct = (billTax > 0 && billSubtotal > 0)
        ? Math.round((billTax / billSubtotal) * 100)
        : 0;
      setEditableItems(buildEditableItems(extractedItems, fallbackGstPct));
      setStep('suggestions');

      // Pre-fill form with extracted data
      setFinalForm(prev => ({
        ...prev,
        document_type: response.data.extracted_data.detected_type || 'Invoice',
        vendor_name: response.data.extracted_data.vendor_name || '',
        bill_number: response.data.extracted_data.bill_number || '',
        bill_date: response.data.extracted_data.bill_date || '',
        amount: response.data.extracted_data.amount || '',
        vendor_contact: response.data.extracted_data.vendor_contact || '',
        related_tab: defaultRelatedTab || response.data.category_suggestions?.[0]?.related_tab || ''
      }));

      fetchHierarchyOptions(response.data.extracted_data.vendor_name || '');

      // Build OCR text for ML categorizer from extracted data
      const rawParts = [
        response.data.extracted_data.vendor_name,
        response.data.extracted_data.raw_text,
        ...(response.data.extracted_data.items || []).map(i => i.description),
        response.data.extracted_data.amount ? `${response.data.extracted_data.amount}` : ''
      ].filter(Boolean);
      const ocrText = rawParts.join(' ').trim();
      setOcrRawText(ocrText);

      // Call ML expense categorizer
      if (ocrText) {
        try {
          const catRes = await api.post('/ai/categorize-expense', { ocr_text: ocrText });
          if (catRes.data?.predicted_category && catRes.data.confidence > 0) {
            setMlPrediction(catRes.data);
            // Auto-fill related_tab from ML prediction
            const tabMap = {
              'Vendor': 'vendors', 'Utility': 'utilities', 'Rent': 'rent',
              'Office & Admin': 'office', 'Transport & Delivery': 'transport',
              'Marketing & Sales': 'misc', 'Machine & Maintenance': 'misc',
              'Bank & Finance': 'finance', 'Miscellaneous': 'misc'
            };
            const autoTab = tabMap[catRes.data.predicted_category] || '';
            if (autoTab && !response.data.category_suggestions?.length) {
              setFinalForm(prev => ({ ...prev, related_tab: autoTab }));
            }
          }
        } catch (catErr) {
          console.warn('[SmartBillUpload] ML categorizer unavailable:', catErr.message);
        }
      }

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

  const suggestSubcategories = (categoryName = '') => {
    const catLower = String(categoryName || '').toLowerCase();
    const categoryMap = {
      'memento|trophy|award|frame|photo': [
        { name: 'Trophies & Awards', confidence: 0.95 },
        { name: 'Photo Frames', confidence: 0.9 },
        { name: 'Mementos', confidence: 0.85 }
      ],
      'consumables|ink|toner|paper': [
        { name: 'Ink & Toner', confidence: 0.95 },
        { name: 'Paper & Sheets', confidence: 0.9 },
        { name: 'Labels & Stickers', confidence: 0.85 }
      ],
      'office|admin': [
        { name: 'Office Supplies', confidence: 0.9 },
        { name: 'Furniture', confidence: 0.8 },
        { name: 'Equipment', confidence: 0.75 }
      ]
    };

    for (const [pattern, subs] of Object.entries(categoryMap)) {
      if (new RegExp(pattern, 'i').test(catLower)) {
        return subs;
      }
    }
    return [];
  };

  const fetchProductSuggestions = async (keyword) => {
    try {
      const response = await api.get('/bills-documents/suggest-products', {
        params: { keyword }
      });
      setProductSuggestions(response.data);
      
      // Auto-fill editable items with product library data
      if (response.data.length > 0) {
        setEditableItems(prev => prev.map((item) => {
          const matched = response.data.find(p => 
            String(item.item_name || '').toLowerCase().includes(String(p.name || '').toLowerCase())
            || String(p.name || '').toLowerCase().includes(String(item.item_name || '').toLowerCase())
          );
          if (matched) {
            return {
              ...item,
              sku: item.sku || matched.sku || '',
              category_id: String(matched.category_id || ''),
              category_name: matched.category_name || '',
              hsn_sac: item.hsn_sac || matched.hsn || ''
            };
          }
          return item;
        }));
      }
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
    // Auto-assign to all items in single mode
    const catMatch = hierarchyOptions.find(c => String(c.name || '').includes(category.type));
    if (catMatch) {
      setGlobalCategoryId(String(catMatch.id));
      setGlobalSubcategoryId('');
    }
    // If user picks a different category than ML predicted, save correction
    if (mlPrediction && ocrRawText && category.type !== mlPrediction.predicted_category) {
      setCategoryOverridden(true);
      api.post('/ai/categorize-expense/feedback', {
        ocr_text: ocrRawText,
        category: category.type
      }).catch(() => {});
    }
  };

  const handleSubcategorySelect = (subcategoryName) => {
    if (!globalCategoryId) return;
    const category = hierarchyOptions.find(c => String(c.id) === String(globalCategoryId));
    const matched = category?.subcategories?.find(s => String(s.name || '').includes(subcategoryName));
    if (matched) {
      setGlobalSubcategoryId(String(matched.id));
    }
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
        if (stockBranchId) {
          formData.append('stock_branch_id', stockBranchId);
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

      // Save locally first
      await localDb.createVendorBill({
        vendor_id: null,
        vendor_name: finalForm.vendor_name,
        bill_number: finalForm.bill_number,
        bill_date: finalForm.bill_date,
        total_amount: Number(finalForm.amount),
        items: payloadItems
      });

      await localDb.saveBillDocument({
        document_type: normalizeDocumentType(finalForm.document_type, finalForm.related_tab),
        related_tab: finalForm.related_tab,
        vendor_name: finalForm.vendor_name,
        bill_number: finalForm.bill_number,
        bill_date: finalForm.bill_date,
        amount: finalForm.amount,
        description: finalForm.description,
        // Store the original uploaded file blob for local viewing
        file_blob: file || undefined,
        file_name: file?.name || undefined,
        file_type: file?.type || undefined,
      });

      // Upload to server so inventory is synced
      try {
        const formData = buildUploadFormData(payloadItems);
        await api.post('/bills-documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } catch (uploadErr) {
        if (uploadErr.response?.status === 409) {
          const existingName = uploadErr.response.data?.duplicate?.file_name || 'a previous bill';
          const proceed = window.confirm(
            `A similar bill (${existingName}) was already uploaded. Upload this one anyway?`
          );
          if (!proceed) {
            setError('Upload cancelled — possible duplicate bill detected.');
            return;
          }
          const forceFormData = buildUploadFormData(payloadItems, true);
          await api.post('/bills-documents/upload', forceFormData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } else {
          throw uploadErr;
        }
      }

      setStep('confirming');
      onSuccess?.();

      // Save OCR text + chosen category to training data for future ML improvement
      if (ocrRawText && finalForm.related_tab) {
        const tabToCat = {
          'vendors': 'Vendor', 'utilities': 'Utility', 'rent': 'Rent',
          'office': 'Office & Admin', 'transport': 'Transport & Delivery',
          'finance': 'Bank & Finance', 'misc': 'Miscellaneous'
        };
        const finalCategory = tabToCat[finalForm.related_tab] || finalForm.related_tab;
        api.post('/ai/categorize-expense/feedback', {
          ocr_text: ocrRawText,
          category: finalCategory
        }).catch(() => {});
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to upload bill');
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
                <div className="data-item">
                  <label>Vendor Name</label>
                  <input
                    type="text"
                    value={finalForm.vendor_name}
                    onChange={(e) => setFinalForm(prev => ({ ...prev, vendor_name: e.target.value }))}
                    placeholder="Vendor or supplier name"
                  />
                </div>
                <div className="data-item">
                  <label>Vendor Contact</label>
                  <input
                    type="text"
                    value={finalForm.vendor_contact}
                    onChange={(e) => setFinalForm(prev => ({ ...prev, vendor_contact: e.target.value }))}
                    placeholder="Phone / mobile"
                  />
                </div>
                {editableItems.length > 0 && (
                  <div className="data-item">
                    <label>Stock goes to Branch</label>
                    <select
                      value={stockBranchId}
                      onChange={(e) => setStockBranchId(e.target.value)}
                    >
                      <option value={auth.getUser()?.branch_id || ''}>{branches.find(b => b.id === auth.getUser()?.branch_id)?.name || 'Your Branch'} (Default)</option>
                      {branches.filter(b => b.id !== auth.getUser()?.branch_id).map(b => (
                        <option key={b.id} value={b.id}>{b.name}{b.short_name ? ` (${b.short_name})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                <h3>📁 Suggested Category</h3>
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

                {/* Subcategory Suggestions */}
                {selectedCategory && suggestSubcategories(selectedCategory.type).length > 0 && (
                  <div className="subcategory-suggestions" style={{ marginTop: 8 }}>
                    <p style={{ margin: '0 0 6px 0', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>📂 Suggested Subcategory:</p>
                    <div className="suggestion-chips" style={{ marginTop: 4 }}>
                      {suggestSubcategories(selectedCategory.type).map((sub, idx) => (
                        <button
                          key={idx}
                          className={`chip chip-sub`}
                          onClick={() => handleSubcategorySelect(sub.name)}
                        >
                          {sub.name}
                          <small>{Math.round(sub.confidence * 100)}%</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ML Auto-detected Category */}
            {mlPrediction && mlPrediction.predicted_category && (
              <div className="suggestions-section">
                <h3>🤖 AI Category Prediction</h3>
                <div className="ml-prediction-badge">
                  <span className="ml-predicted-label">
                    Auto-detected: <strong>{mlPrediction.predicted_category}</strong>
                  </span>
                  <span className={`ml-confidence-badge ${mlPrediction.confidence >= 0.8 ? 'high' : mlPrediction.confidence >= 0.5 ? 'medium' : 'low'}`}>
                    {Math.round(mlPrediction.confidence * 100)}%
                  </span>
                  {categoryOverridden && <span className="ml-overridden-tag">Overridden</span>}
                </div>
                {mlPrediction.alternatives?.length > 0 && (
                  <div className="ml-alternatives">
                    {mlPrediction.alternatives.map((alt, idx) => (
                      <button
                        key={idx}
                        className="chip chip-alt"
                        onClick={() => {
                          const tabMap = {
                            'Vendor': 'vendors', 'Utility': 'utilities', 'Rent': 'rent',
                            'Office & Admin': 'office', 'Transport & Delivery': 'transport',
                            'Marketing & Sales': 'misc', 'Machine & Maintenance': 'misc',
                            'Bank & Finance': 'finance', 'Miscellaneous': 'misc'
                          };
                          setFinalForm(prev => ({ ...prev, related_tab: tabMap[alt.category] || '' }));
                          setCategoryOverridden(true);
                          api.post('/ai/categorize-expense/feedback', {
                            ocr_text: ocrRawText,
                            category: alt.category
                          }).catch(() => {});
                        }}
                      >
                        {alt.category}
                        <small>{Math.round(alt.confidence * 100)}%</small>
                      </button>
                    ))}
                  </div>
                )}
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
                {/* Mode Toggle */}
                <div className="category-assignment-section-inline">
                  <h3>📚 Product Library Classification</h3>
                  <div className="category-mode-toggle">
                    <button
                      type="button"
                      className={`mode-toggle-btn${categoryMode === 'single' ? ' active' : ''}`}
                      onClick={() => setCategoryMode('single')}
                    >
                      All items → Same category
                    </button>
                    <button
                      type="button"
                      className={`mode-toggle-btn${categoryMode === 'per-item' ? ' active' : ''}`}
                      onClick={() => setCategoryMode('per-item')}
                    >
                      Classify each item
                    </button>
                  </div>

                  {/* Loading Indicator */}
                  {hierarchyLoading && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      margin: '8px 0',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: 'var(--text-secondary, #666)',
                      backgroundColor: 'var(--surface-hover, #f5f5f5)',
                      borderRadius: '4px'
                    }}>
                      <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                      Loading categories...
                    </div>
                  )}

                  {/* Single Mode Category Selects - Always show */}
                  {categoryMode === 'single' && (
                    <div className="category-single-selects">
                      <div className="category-select-group">
                        <label className="category-select-label">📁 Category</label>
                        <select
                          className="category-select"
                          value={globalCategoryId}
                          onChange={(e) => {
                            const nextCategoryId = e.target.value;
                            setGlobalCategoryId(nextCategoryId);
                            setGlobalSubcategoryId('');
                          }}
                        >
                          <option value="">— Auto detect —</option>
                          {hierarchyOptions.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                          {hierarchyOptions.length === 0 && (
                            <option disabled style={{ color: 'var(--text-disabled)', fontStyle: 'italic' }}>
                              Loading categories...
                            </option>
                          )}
                        </select>
                      </div>
                      <div className="category-select-group">
                        <label className="category-select-label">📂 Subcategory</label>
                        <select
                          className="category-select"
                          value={globalSubcategoryId}
                          onChange={(e) => setGlobalSubcategoryId(e.target.value)}
                          disabled={!globalCategoryId}
                        >
                          <option value="">— Auto detect —</option>
                          {(hierarchyOptions.find((cat) => String(cat.id) === String(globalCategoryId))?.subcategories || []).map((sub) => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <h3 style={{ marginTop: 14, marginBottom: 10, color: 'var(--text, #333)' }}>Items from Bill (Editable)</h3>
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
                        <th></th>
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
                          <td className="td-del">
                            <button
                              className="btn-delete-row"
                              title="Remove row"
                              onClick={() => setEditableItems(prev => prev.filter((_, i) => i !== idx))}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="btn-add-row"
                  onClick={() => setEditableItems(prev => [
                    ...prev,
                    {
                      serial_no: prev.length + 1,
                      item_name: '',
                      hsn_sac: '',
                      quantity: '',
                      rate: '',
                      gst_percent: 18,
                      mrp: '',
                      sell_price: '',
                      sku: '',
                      category_id: '',
                      subcategory_id: '',
                      category_name: '',
                      subcategory_name: ''
                    }
                  ])}
                >
                  <Plus size={13} /> Add Row
                </button>
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
                      <td className="pricing-cost">₹{(Number(item.rate || 0) * (1 + Number(item.gst_percent || 0) / 100)).toFixed(2)}</td>
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
                setMlPrediction(null);
                setCategoryOverridden(false);
                setOcrRawText('');
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

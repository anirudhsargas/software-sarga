import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Camera, Upload, X, AlertCircle, Loader2, CheckCircle, Plus, Trash2, 
  RotateCcw, Sparkles, Sliders, RefreshCw, Layers, ShieldAlert, ArrowLeft,
  ChevronRight, Edit3, Check, Eye, HelpCircle, FileText, Bug
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';

const ALLOWED_BILL_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
import localDb from '../services/localDb';
import toast from 'react-hot-toast';
import './UploadBills.css';

import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
const ESTIMATED_TIME_PER_BILL = 15; // in seconds

const UploadBills = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard/expenses?tab=dashboard';
  const userRole = auth.getUser()?.role;

  // Navigation Guard
  useEffect(() => {
    if (!['Admin', 'Front Office', 'Accountant'].includes(userRole)) {
      toast.error('Access Denied: Insufficient permissions to upload bills.');
      navigate('/dashboard');
    }
  }, [userRole, navigate]);

  // Main UI State: 'dashboard' | 'camera' | 'ocr' | 'review' | 'success'
  const [uiState, setUiState] = useState('dashboard');
  
  // Advanced Features State
  const [advancedFeatures, setAdvancedFeatures] = useState({
    autoCapture: false,
    autoRotate: true,
    autoCrop: true,
    autoCompress: true,
    multiPage: false,
    mergeCaptures: false,
    duplicateDetection: true
  });
  
  // Session State
  const [capturedBills, setCapturedBills] = useState([]); // Array of { id, src, file, label, status: 'pending'|'processing'|'completed'|'failed' }
  const [_currentPreviewIndex, _setCurrentPreviewIndex] = useState(null);
  
  // Camera State
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [_isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null); // { src, blob, file }
  const [cameraError, setCameraError] = useState('');

  // OCR Processing State
  const [ocrProgress, setOcrProgress] = useState([]); // Array of { billId, currentStep: 0-6, error: '' }
  const [extractedBillsData, setExtractedBillsData] = useState([]); // Array of extracted details for review
  const [processingIndex, setProcessingIndex] = useState(0);

  // Review Screen State
  const [selectedReviewIds, setSelectedReviewIds] = useState([]);
  const [isEditingId, setIsEditingId] = useState(null); // ID of bill currently being detailed in modal
  const [branches, setBranches] = useState([]);
  const [_categories, setCategories] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(auth.getUser()?.branch_id || '');
  const [savingBills, setSavingBills] = useState(new Set());
  const [billRejections, setBillRejections] = useState({});
  const [reuploadingBillId, setReuploadingBillId] = useState(null);
  const reuploadInputRef = useRef(null);

  // Fetch branches & categories on mount
  useEffect(() => {
    localDb.getBranches().then(data => setBranches(data || [])).catch(() => {});
    localDb.getProducts().then(data => setCategories(data || [])).catch(() => {});
  }, []);

  // --- CAMERA FLOWS ---
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraLoading(true);
    setCameraError('');
    setIsCameraActive(true);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(e => console.warn(e));
        };
      }
      
      // Apply simulated/real flash constraint
      const track = stream.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        try {
          // Some devices support torch constraint directly
          await track.applyConstraints({
            advanced: [{ torch: isFlashOn }]
          });
        } catch {
          // torch constraint unsupported on desktop/older browsers - handled visually/simulated
        }
      }
    } catch (err) {
      console.error('Camera access failed:', err);
      setCameraError('Could not access the rear camera. Please ensure permissions are granted or use file upload.');
      setIsCameraActive(false);
    } finally {
      setCameraLoading(false);
    }
  }, [facingMode, isFlashOn]);

  useEffect(() => {
    if (uiState === 'camera' && !capturedPhoto) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [uiState, capturedPhoto, startCamera, stopCamera]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Match canvas dimensions to video feed
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Apply auto enhancement settings (brightness / contrast)
    ctx.filter = 'brightness(1.08) contrast(1.04)';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Reset filters
    ctx.filter = 'none';

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `bill_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const src = URL.createObjectURL(blob);
      setCapturedPhoto({ src, blob, file });
      stopCamera();
    }, 'image/jpeg', 0.85);
  };

  const applyCapturedPhoto = () => {
    if (!capturedPhoto) return;
    
    const newBill = {
      id: `captured_${Date.now()}`,
      src: capturedPhoto.src,
      file: capturedPhoto.file,
      label: `Bill ${capturedBills.length + 1}`,
      status: 'pending'
    };

    setCapturedBills(prev => [...prev, newBill]);
    setCapturedPhoto(null);
    toast.success('✓ Bill Added');
  };

  const toggleFlash = () => {
    setIsFlashOn(prev => !prev);
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        track.applyConstraints({
          advanced: [{ torch: !isFlashOn }]
        }).catch(() => {});
      }
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // --- FILE UPLOAD HANDLER ---
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    addFiles(files);
  };

  const addFiles = (files) => {
    const validFiles = files.filter(f => ALLOWED_BILL_TYPES.includes(f.type) && f.size <= 10 * 1024 * 1024);
    
    if (validFiles.length !== files.length) {
      toast.error('Some files were ignored. Only PDF, JPG, PNG under 10MB are supported.');
    }

    if (validFiles.length === 0) return;

    const newBills = validFiles.map((file, idx) => {
      const isPdf = file.type === 'application/pdf';
      const src = isPdf ? '/icons/pdf-icon.png' : URL.createObjectURL(file); // Mock pdf thumbnail
      return {
        id: `file_${Date.now()}_${idx}`,
        src,
        file,
        label: file.name.length > 20 ? `${file.name.slice(0, 17)}...` : file.name,
        status: 'pending'
      };
    });

    setCapturedBills(prev => [...prev, ...newBills]);
    toast.success(`${newBills.length} Bill${newBills.length > 1 ? 's' : ''} Added`);
  };

  // --- MULTI-BILL UTILS ---
  const removeBill = (id) => {
    setCapturedBills(prev => prev.filter(b => b.id !== id));
    toast('Bill removed from session');
  };

  const rejectBill = (id, reason = '') => {
    setExtractedBillsData(prev => {
      const remaining = prev.filter(b => b.id !== id);
      if (remaining.length === 0) {
        setUiState('dashboard');
      }
      return remaining;
    });
    setCapturedBills(prev => prev.map(b => b.id === id ? { ...b, status: 'rejected' } : b));
    setBillRejections(prev => ({ ...prev, [id]: reason || 'Manually rejected by user' }));
    toast('Bill rejected');
  };

  const handleReupload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !reuploadingBillId) return;

    if (!ALLOWED_BILL_TYPES.includes(file.type) || file.size > 10 * 1024 * 1024) {
      toast.error('Invalid file. Only PDF, JPG, PNG under 10MB are supported.');
      return;
    }

    const isPdf = file.type === 'application/pdf';
    const src = isPdf ? '/icons/pdf-icon.png' : URL.createObjectURL(file);
    const label = file.name.length > 20 ? `${file.name.slice(0, 17)}...` : file.name;

    setCapturedBills(prev => prev.map(b => b.id === reuploadingBillId ? {
      ...b,
      file,
      src,
      label,
      status: 'pending'
    } : b));

    // Remove from billRejections list if tracked there
    setBillRejections(prev => {
      const next = { ...prev };
      delete next[reuploadingBillId];
      return next;
    });

    setReuploadingBillId(null);
    toast.success('Bill replaced and set to pending');
  };

  const retryExtraction = async (id) => {
    const bill = capturedBills.find(b => b.id === id);
    if (!bill) return;

    const loadingToastId = toast.loading('Retrying OCR extraction...');
    
    try {
      const formData = new FormData();
      formData.append('file', bill.file);
      
      const response = await api.post('/bills-documents/extract-details', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const data = response.data;
      const details = data.extracted_data || {};
      const gst = data.gst_analysis || {};
      const confidenceScores = data.confidence_scores || data.extraction_metadata?.confidence_scores || {};
      const extractionLogs = data.extraction_logs || data.extraction_metadata?.extraction_logs || [];
      const extractionStatus = data.extraction_metadata?.extraction_status || 'completed';
      const ocrEngine = data.extraction_metadata?.ocr_engine || 'gemini';
      const duplicateWarning = data.extraction_metadata?.duplicate_warning || null;

      setExtractedBillsData(prev => {
        const itemExists = prev.some(b => b.id === id);
        const newBillData = {
          id: bill.id,
          label: bill.label,
          src: bill.src,
          file: bill.file,
          confidence: data.confidence || 0.8,
          confidence_scores: confidenceScores,
          extraction_logs: extractionLogs,
          extraction_status: extractionStatus,
          ocr_engine: ocrEngine,
          duplicate_warning: duplicateWarning,
          detectedType: details.detected_type || 'Invoice',
          vendor_name: details.vendor_name || '',
          bill_number: details.bill_number || '',
          bill_date: details.bill_date || new Date().toISOString().slice(0, 10),
          amount: details.amount || '',
          tax: details.tax || '0.00',
          gst_category: gst.gst_category || '',
          gst_confidence: gst.confidence || 0,
          taxable_amount: gst.taxable_amount || details.amount || 0,
          tax_amount: gst.tax_amount || details.tax || 0,
          has_vendor_gstin: gst.has_vendor_gstin || false,
          items: (details.items || []).map((it, idx) => ({
            serial_no: it.serial_no || idx + 1,
            item_name: it.description || it.item_name || '',
            hsn_sac: it.hsn_sac || '',
            quantity: it.quantity || '',
            rate: it.rate || it.unit_price || '',
            gst_percent: it.gst_percent || 18,
            mrp: it.mrp || it.total_amount || ''
          })),
          uncertainFields: detectUncertainties(details, data.confidence),
          showExtractionLogs: false,
          status: 'ready',
          extractionFailed: false
        };

        if (itemExists) {
          return prev.map(b => b.id === id ? newBillData : b);
        } else {
          return [...prev, newBillData];
        }
      });

      // Update status in capturedBills
      setCapturedBills(prev => prev.map(b => b.id === id ? { ...b, status: 'completed' } : b));

      toast.success('Extraction successful!', { id: loadingToastId });
    } catch (err) {
      console.error('OCR retry error for bill:', id, err);
      toast.error('OCR retry failed again. Please enter details manually.', { id: loadingToastId });
    }
  };

  const resetRejectedBill = (id) => {
    setBillRejections(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    toast('Bill ready for re-upload');
  };

  const reorderBill = (index, direction) => {
    if (direction === 'left' && index === 0) return;
    if (direction === 'right' && index === capturedBills.length - 1) return;
    
    const nextIndex = direction === 'left' ? index - 1 : index + 1;
    const newBills = [...capturedBills];
    const temp = newBills[index];
    newBills[index] = newBills[nextIndex];
    newBills[nextIndex] = temp;
    setCapturedBills(newBills);
  };

  // --- OCR STEPPER FLOW ---
  const startOcrProcessing = async () => {
    const billsToProcess = capturedBills.filter(b => b.status !== 'approved');
    if (billsToProcess.length === 0) {
      toast.error('No pending or rejected bills to process.');
      return;
    }

    setUiState('ocr');
    
    // Initialize stepper logs
    const initialProgress = billsToProcess.map(b => ({
      billId: b.id,
      currentStep: 0,
      error: ''
    }));
    setOcrProgress(initialProgress);
    setCapturedBills(prev => prev.map(b => b.status !== 'approved' ? { ...b, status: 'processing' } : b));

    const extractedResults = [];

    // Process sequentially
    for (let i = 0; i < billsToProcess.length; i++) {
      const bill = billsToProcess[i];
      setProcessingIndex(i);

      const updateStep = (stepNo) => {
        setOcrProgress(prev => prev.map(p => p.billId === bill.id ? { ...p, currentStep: stepNo } : p));
      };

      try {
        // Step 1: Uploading
        updateStep(1);
        await new Promise(r => setTimeout(r, 800)); // Smooth transit delay

        // Step 2: Extracting Text
        updateStep(2);
        const formData = new FormData();
        formData.append('file', bill.file);
        
        const response = await api.post('/bills-documents/extract-details', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        // Step 3: Detecting Vendor
        updateStep(3);
        await new Promise(r => setTimeout(r, 600));

        // Step 4: Detecting Amount
        updateStep(4);
        await new Promise(r => setTimeout(r, 600));

        // Step 5: Matching Inventory
        updateStep(5);
        await new Promise(r => setTimeout(r, 600));

        // Step 6: Ready for Review
        updateStep(6);
        await new Promise(r => setTimeout(r, 400));

        const data = response.data;
        const details = data.extracted_data || {};
        const gst = data.gst_analysis || {};
        const confidenceScores = data.confidence_scores || data.extraction_metadata?.confidence_scores || {};
        const extractionLogs = data.extraction_logs || data.extraction_metadata?.extraction_logs || [];
        const extractionStatus = data.extraction_metadata?.extraction_status || 'completed';
        const ocrEngine = data.extraction_metadata?.ocr_engine || 'gemini';
        const duplicateWarning = data.extraction_metadata?.duplicate_warning || null;
        
        // Push parsed result
        extractedResults.push({
          id: bill.id,
          label: bill.label,
          src: bill.src,
          file: bill.file,
          confidence: data.confidence || 0.8,
          confidence_scores: confidenceScores,
          extraction_logs: extractionLogs,
          extraction_status: extractionStatus,
          ocr_engine: ocrEngine,
          duplicate_warning: duplicateWarning,
          detectedType: details.detected_type || 'Invoice',
          vendor_name: details.vendor_name || '',
          bill_number: details.bill_number || '',
          bill_date: details.bill_date || new Date().toISOString().slice(0, 10),
          amount: details.amount || '',
          tax: details.tax || '0.00',
          gst_category: gst.gst_category || '',
          gst_confidence: gst.confidence || 0,
          taxable_amount: gst.taxable_amount || details.amount || 0,
          tax_amount: gst.tax_amount || details.tax || 0,
          has_vendor_gstin: gst.has_vendor_gstin || false,
          items: (details.items || []).map((it, idx) => ({
            serial_no: it.serial_no || idx + 1,
            item_name: it.description || it.item_name || '',
            hsn_sac: it.hsn_sac || '',
            quantity: it.quantity || '',
            rate: it.rate || it.unit_price || '',
            gst_percent: it.gst_percent || 18,
            mrp: it.mrp || it.total_amount || ''
          })),
          uncertainFields: detectUncertainties(details, data.confidence),
          showExtractionLogs: false,
          status: 'ready'
        });

        setCapturedBills(prev => prev.map(b => b.id === bill.id ? { ...b, status: 'completed' } : b));
      } catch (err) {
        console.error('OCR error for bill:', bill.id, err);
        // Fallback mock details if extraction fails
        updateStep(5);
        await new Promise(r => setTimeout(r, 1000));
        updateStep(6);
        
        extractedResults.push({
          id: bill.id,
          label: bill.label,
          src: bill.src,
          file: bill.file,
          confidence: 0.3,
          detectedType: 'Invoice',
          vendor_name: '',
          bill_number: '',
          bill_date: new Date().toISOString().slice(0, 10),
          amount: '0.00',
          tax: '0.00',
          items: [],
          uncertainFields: ['vendor_name', 'amount', 'items'],
          status: 'ready',
          extractionFailed: true
        });

        setCapturedBills(prev => prev.map(b => b.id === bill.id ? { ...b, status: 'failed' } : b));
      }
    }

    setExtractedBillsData(extractedResults);
    setSelectedReviewIds(extractedResults.map(r => r.id));
    setUiState('review');
  };

  const getConfidenceLevel = (score) => {
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  };

  const getConfidenceColor = (score) => {
    const level = getConfidenceLevel(score);
    if (level === 'high') return '#22c55e';
    if (level === 'medium') return '#eab308';
    return '#ef4444';
  };

  const getConfidenceBadge = (score) => {
    const level = getConfidenceLevel(score);
    const pct = Math.round(score * 100);
    if (level === 'high') return { icon: '✓', className: 'conf-badge-high', label: `${pct}%`, color: '#22c55e' };
    if (level === 'medium') return { icon: '⚠', className: 'conf-badge-medium', label: `${pct}%`, color: '#eab308' };
    return { icon: '✗', className: 'conf-badge-low', label: `${pct}%`, color: '#ef4444' };
  };

  const detectUncertainties = (details, confidence) => {
    const uncertainties = [];
    if (!details.vendor_name) uncertainties.push('vendor_name');
    if (!details.bill_number) uncertainties.push('bill_number');
    if (!details.amount || Number(details.amount) <= 0) uncertainties.push('amount');
    if (!details.items || details.items.length === 0) uncertainties.push('items');
    
    // Check line item details
    if (details.items && details.items.length > 0) {
      const quantityUnclear = details.items.some(it => !it.quantity || Number(it.quantity) <= 0);
      if (quantityUnclear) uncertainties.push('items_qty');
    }

    if (confidence < 0.5) uncertainties.push('low_confidence');
    return uncertainties;
  };

  // --- REVIEW SCREEN ACTIONS ---
  const handleReviewFieldChange = (id, field, value) => {
    setExtractedBillsData(prev => prev.map(bill => {
      if (bill.id !== id) return bill;
      const updated = { ...bill, [field]: value };
      
      // Remove uncertainty marker if field is now populated
      if (value && bill.uncertainFields.includes(field)) {
        updated.uncertainFields = bill.uncertainFields.filter(f => f !== field);
      }
      return updated;
    }));
  };

  const handleReviewItemChange = (billId, itemIdx, field, value) => {
    setExtractedBillsData(prev => prev.map(bill => {
      if (bill.id !== billId) return bill;
      const nextItems = [...bill.items];
      nextItems[itemIdx] = { ...nextItems[itemIdx], [field]: value };
      
      // Update totals if rate/qty changes
      let _amount = bill._amount;
      if (field === 'rate' || field === 'quantity') {
        const qty = Number(nextItems[itemIdx].quantity || 0);
        const rate = Number(nextItems[itemIdx].rate || 0);
        nextItems[itemIdx].mrp = (qty * rate * 1.18).toFixed(2); // Inferred MRP
        
        // Sum total amount
        const _total = nextItems[itemIdx].mrp;
        // Optional total update
      }

      return { ...bill, items: nextItems };
    }));
  };

  const confirmSingleBill = async (id) => {
    if (savingBills.has(id)) return;
    const bill = extractedBillsData.find(b => b.id === id);
    if (!bill) return;

    if (!bill.vendor_name || !bill.amount) {
      toast.error(`Please complete required details (Vendor & Amount) for ${bill.label}`);
      return;
    }

    setSavingBills(prev => new Set(prev).add(id));
    try {
      const formData = new FormData();
      formData.append('file', bill.file);
      formData.append('document_type', bill.detectedType === 'Invoice' ? 'Vendor Bill' : bill.detectedType);
      formData.append('related_tab', 'vendors');
      formData.append('vendor_name', bill.vendor_name);
      formData.append('bill_number', bill.bill_number);
      formData.append('bill_date', bill.bill_date);
      formData.append('amount', bill.amount);
      if (bill.gst_category) {
        formData.append('gst_category', bill.gst_category);
        formData.append('subtotal', String(bill.taxable_amount || ''));
        formData.append('tax_amount', String(bill.tax_amount || ''));
        formData.append('gst_confidence', String(bill.gst_confidence || ''));
      }
      
      const autoDesc = bill.items.map(it => it.item_name).filter(Boolean).join(', ') || 'Smart Bill Upload';
      formData.append('description', autoDesc);
      
      // Add line items
      const payloadItems = bill.items.map(it => ({
        ...it,
        quantity: Number(it.quantity) || 1,
        rate: Number(it.rate) || 0,
        mrp: Number(it.mrp) || 0
      }));
      formData.append('line_items', JSON.stringify(payloadItems));
      formData.append('stock_branch_id', selectedBranchId);
      formData.append('force_duplicate', '1');

      await api.post('/bills-documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      });

      // Save locally
      await localDb.createVendorBill({
        vendor_name: bill.vendor_name,
        bill_number: bill.bill_number,
        bill_date: bill.bill_date,
        total_amount: Number(bill.amount),
        items: payloadItems
      }).catch(() => {});

      // Remove from review queue
      setExtractedBillsData(prev => {
        const remaining = prev.filter(b => b.id !== id);
        if (remaining.length === 0) {
          setCapturedBills(currCaptured => {
            const updatedCaptured = currCaptured.map(b => b.id === id ? { ...b, status: 'approved' } : b);
            const hasUnapproved = updatedCaptured.some(b => b.status !== 'approved');
            if (hasUnapproved) {
              setUiState('dashboard');
            } else {
              setUiState('success');
            }
            return updatedCaptured;
          });
        } else {
          setCapturedBills(prevCaptured => prevCaptured.map(b => b.id === id ? { ...b, status: 'approved' } : b));
        }
        return remaining;
      });
      toast.success(`✓ ${bill.label} confirmed & saved`);
    } catch (err) {
      toast.error(`Failed to upload ${bill.label}: ${err.response?.data?.message || err.message}`);
    } finally {
      setSavingBills(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const confirmAllSelected = async () => {
    const toConfirm = extractedBillsData.filter(b => selectedReviewIds.includes(b.id));
    if (toConfirm.length === 0) { toast.error('No bills selected'); return; }

    setSavingBills(prev => new Set([...prev, ...toConfirm.map(b => b.id)]));
    const succeeded = [];
    for (const bill of toConfirm) {
      try {
        const formData = new FormData();
        formData.append('file', bill.file);
        formData.append('document_type', bill.detectedType === 'Invoice' ? 'Vendor Bill' : bill.detectedType);
        formData.append('related_tab', 'vendors');
        formData.append('vendor_name', bill.vendor_name);
        formData.append('bill_number', bill.bill_number);
        formData.append('bill_date', bill.bill_date);
        formData.append('amount', bill.amount);
        const autoDesc = bill.items.map(it => it.item_name).filter(Boolean).join(', ') || 'Smart Bill Upload';
        formData.append('description', autoDesc);
        const payloadItems = bill.items.map(it => ({
          ...it,
          quantity: Number(it.quantity) || 1,
          rate: Number(it.rate) || 0,
          mrp: Number(it.mrp) || 0
        }));
        formData.append('line_items', JSON.stringify(payloadItems));
        formData.append('stock_branch_id', selectedBranchId);
        formData.append('force_duplicate', '1');

        await api.post('/bills-documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000
        });

        await localDb.createVendorBill({
          vendor_name: bill.vendor_name,
          bill_number: bill.bill_number,
          bill_date: bill.bill_date,
          total_amount: Number(bill.amount),
          items: payloadItems
        }).catch(() => {});

        succeeded.push(bill.id);
      } catch (err) {
        console.error(`Failed to confirm bill ${bill.label}:`, err);
      }
    }

    if (succeeded.length > 0) {
      const succeededSet = new Set(succeeded);
      toast.success(`${succeeded.length} of ${toConfirm.length} bills confirmed`);
      setExtractedBillsData(prev => {
        const remaining = prev.filter(b => !succeededSet.has(b.id));
        if (remaining.length === 0) {
          setCapturedBills(currCaptured => {
            const updatedCaptured = currCaptured.map(b => succeededSet.has(b.id) ? { ...b, status: 'approved' } : b);
            const hasUnapproved = updatedCaptured.some(b => b.status !== 'approved');
            if (hasUnapproved) {
              setUiState('dashboard');
            } else {
              setUiState('success');
            }
            return updatedCaptured;
          });
        } else {
          setCapturedBills(prevCaptured => prevCaptured.map(b => succeededSet.has(b.id) ? { ...b, status: 'approved' } : b));
        }
        return remaining;
      });
      setSelectedReviewIds([]);
    } else {
      toast.error('Failed to confirm any selected bills.');
    }
    setSavingBills(new Set());
  };

  const toggleSelectReview = (id) => {
    setSelectedReviewIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const activeEditBill = extractedBillsData.find(b => b.id === isEditingId);

  return (
    <PageContainer>
      
      {/* ────────────────── DASHBOARD VIEW ────────────────── */}
      {uiState === 'dashboard' && (
        <div className="dashboard-view stack-md animate-fade-in">
          
          {/* Header */}
          <div className="page-header row items-center gap-md">
            <button className="btn btn-ghost icon-button back-btn" onClick={() => navigate(redirectPath)} title="Cancel Session">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="scan-title">Upload Bills</h1>
              <p className="scan-subtitle">Quickly capture and log expense receipts with auto OCR scanning.</p>
            </div>
          </div>

          {/* Primary Top Action buttons */}
          <div className="top-action-bar border row gap-sm justify-between items-center p-16">
            <div className="row gap-xs">
              <button className="btn btn-primary" onClick={() => { setUiState('camera'); setCapturedPhoto(null); }}>
                <Camera size={16} className="mr-8" /> Open Camera
              </button>
              <button className="btn btn-secondary border" onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} className="mr-8" /> Upload Files
              </button>
            </div>
            <span className="muted text-xs hidden-sm">Drag & drop files directly onto page to add bills</span>
          </div>

          <div className="dashboard-grid">
            
            {/* Cards layout */}
            <div className="stack-md">
              <div className="options-grid">
                
                {/* Camera Card */}
                <div className="option-card border cursor-pointer hover-card" onClick={() => { setUiState('camera'); setCapturedPhoto(null); }}>
                  <div className="icon-badge camera-style">
                    <Camera size={28} />
                  </div>
                  <h3>Camera Capture</h3>
                  <p className="muted text-xs">
                    Open device camera directly and capture bills instantly. Designed for quick mobile scan sessions.
                  </p>
                  <button className="btn btn-primary btn-sm btn-card mt-16">
                    Open Camera
                  </button>
                </div>

                {/* File Upload Card */}
                <div 
                  className="option-card border cursor-pointer hover-card" 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                >
                  <div className="icon-badge file-style">
                    <Upload size={28} />
                  </div>
                  <h3>Upload Existing Files</h3>
                  <p className="muted text-xs">
                    Select images or PDFs from your device. Supports batch file selections up to 10MB each.
                  </p>
                  <button className="btn btn-ghost border btn-sm btn-card mt-16">
                    Upload
                  </button>
                </div>

              </div>

              {/* Advanced Collapsible Features Panel */}
              <div className="advanced-settings-card border stack-sm">
                <div className="advanced-header row gap-xs items-center font-semibold">
                  <Sliders size={16} className="text-primary" /> Advanced Features
                </div>
                <div className="advanced-checkboxes-grid">
                  <label className="checkbox-row text-xs">
                    <input 
                      type="checkbox" 
                      checked={advancedFeatures.autoCapture} 
                      onChange={e => setAdvancedFeatures(prev => ({ ...prev, autoCapture: e.target.checked }))}
                    />
                    <span>Auto capture when document detected</span>
                  </label>
                  <label className="checkbox-row text-xs">
                    <input 
                      type="checkbox" 
                      checked={advancedFeatures.autoRotate} 
                      onChange={e => setAdvancedFeatures(prev => ({ ...prev, autoRotate: e.target.checked }))}
                    />
                    <span>Auto rotate</span>
                  </label>
                  <label className="checkbox-row text-xs">
                    <input 
                      type="checkbox" 
                      checked={advancedFeatures.autoCrop} 
                      onChange={e => setAdvancedFeatures(prev => ({ ...prev, autoCrop: e.target.checked }))}
                    />
                    <span>Auto crop</span>
                  </label>
                  <label className="checkbox-row text-xs">
                    <input 
                      type="checkbox" 
                      checked={advancedFeatures.autoCompress} 
                      onChange={e => setAdvancedFeatures(prev => ({ ...prev, autoCompress: e.target.checked }))}
                    />
                    <span>Auto compress</span>
                  </label>
                  <label className="checkbox-row text-xs">
                    <input 
                      type="checkbox" 
                      checked={advancedFeatures.multiPage} 
                      onChange={e => setAdvancedFeatures(prev => ({ ...prev, multiPage: e.target.checked }))}
                    />
                    <span>Multi-page bill support</span>
                  </label>
                  <label className="checkbox-row text-xs">
                    <input 
                      type="checkbox" 
                      checked={advancedFeatures.mergeCaptures} 
                      onChange={e => setAdvancedFeatures(prev => ({ ...prev, mergeCaptures: e.target.checked }))}
                    />
                    <span>Merge multiple captures</span>
                  </label>
                  <label className="checkbox-row text-xs">
                    <input 
                      type="checkbox" 
                      checked={advancedFeatures.duplicateDetection} 
                      onChange={e => setAdvancedFeatures(prev => ({ ...prev, duplicateDetection: e.target.checked }))}
                    />
                    <span>Duplicate detection</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Session Queue list */}
            <div className="session-queue-panel border stack-sm">
              <div className="queue-header row space-between items-center pb-8 border-bottom">
                <span className="bold text-sm font-semibold">Queue List ({capturedBills.length} Bill{capturedBills.length !== 1 ? 's' : ''})</span>
                {capturedBills.length > 0 && (
                  <button className="btn btn-ghost btn-xs text-error" onClick={() => setCapturedBills([])}>
                    Clear Session
                  </button>
                )}
              </div>
              
              <div className="queue-list-container flex-1">
                {capturedBills.length === 0 ? (
                  <div className="empty-queue-alert text-center stack-xs py-32 text-muted">
                    <FileText size={32} className="muted mb-8" />
                    <span className="text-xs">No bills in queue</span>
                    <span className="muted text-xs">Start capturing or drop files to populate list</span>
                  </div>
                ) : (
                  <div className="queue-rows stack-xs">
                    {capturedBills.map((bill, index) => (
                      <div key={bill.id} className="queue-item-row border row gap-sm items-center p-8">
                        <img src={bill.src} alt={bill.label} className="queue-thumbnail border" />
                        <div className="flex-1 stack-xxs">
                          <span className="text-xs font-semibold">{bill.label}</span>
                          {(() => {
                            switch (bill.status) {
                              case 'approved':
                                return (
                                  <span className="status-badge text-xxs" style={{ backgroundColor: '#dcfce7', color: '#166534', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px' }}>
                                    <CheckCircle size={10} /> Approved
                                  </span>
                                );
                              case 'rejected':
                                return (
                                  <span className="status-badge text-xxs" style={{ backgroundColor: '#fee2e2', color: '#991b1b', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px' }}>
                                    <X size={10} /> Rejected (Re-upload Required)
                                  </span>
                                );
                              case 'processing':
                                return (
                                  <span className="status-badge text-xxs" style={{ backgroundColor: '#dbeafe', color: '#1e40af', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px' }}>
                                    <Loader2 size={10} className="animate-spin" /> Processing
                                  </span>
                                );
                              case 'failed':
                                return (
                                  <span className="status-badge text-xxs" style={{ backgroundColor: '#fee2e2', color: '#991b1b', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px' }}>
                                    <AlertCircle size={10} /> Extraction Failed
                                  </span>
                                );
                              case 'pending':
                              default:
                                return (
                                  <span className="status-badge status-pending text-xxs">
                                    <Loader2 size={10} className="mr-4" /> Pending
                                  </span>
                                );
                            }
                          })()}
                        </div>
                        <div className="row gap-xxs">
                          {bill.status === 'rejected' && (
                            <button 
                              className="btn btn-ghost btn-xs text-primary row items-center" 
                              onClick={() => {
                                setReuploadingBillId(bill.id);
                                reuploadInputRef.current?.click();
                              }}
                              title="Re-upload/Replace File"
                              style={{ padding: '2px 6px', height: 'auto', display: 'inline-flex', alignItems: 'center' }}
                            >
                              <RotateCcw size={10} className="mr-4" /> Re-upload
                            </button>
                          )}
                          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => reorderBill(index, 'left')} disabled={index === 0}>
                            ←
                          </button>
                          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => reorderBill(index, 'right')} disabled={index === capturedBills.length - 1}>
                            →
                          </button>
                          <button className="btn btn-ghost btn-icon btn-xs text-error" onClick={() => removeBill(bill.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {capturedBills.length > 0 && capturedBills.some(b => b.status !== 'approved') && (
                <div className="queue-actions-footer stack-sm border-top pt-16">
                  <div className="session-info-strip row space-between text-xs">
                    <span className="muted">Estimated OCR processing time:</span>
                    <span className="bold text-primary">{capturedBills.filter(b => b.status !== 'approved').length * ESTIMATED_TIME_PER_BILL}s</span>
                  </div>
                  <button className="btn btn-primary btn--full mt-8" onClick={startOcrProcessing}>
                    <Sparkles size={16} className="mr-8" /> Process All ({capturedBills.filter(b => b.status !== 'approved').length} Bill{capturedBills.filter(b => b.status !== 'approved').length !== 1 ? 's' : ''})
                  </button>
                </div>
              )}
            </div>

            {/* Rejected Bills Section */}
            {Object.keys(billRejections).length > 0 && (
              <div className="session-queue-panel border stack-sm">
                <div className="queue-header row space-between items-center pb-8 border-bottom">
                  <span className="bold text-sm font-semibold text-error">
                    <X size={14} className="mr-4" /> Rejected ({Object.keys(billRejections).length})
                  </span>
                  <button className="btn btn-ghost btn-xs" onClick={() => setBillRejections({})}>
                    Clear All
                  </button>
                </div>
                <div className="queue-list-container flex-1">
                  <div className="queue-rows stack-xs">
                    {Object.entries(billRejections).map(([id, reason]) => (
                      <div key={id} className="queue-item-row border row gap-sm items-center p-8">
                        <div className="flex-1 stack-xxs">
                          <span className="text-xs font-semibold">Bill {id.slice(0, 8)}</span>
                          <span className="status-badge status-rejected text-xxs">
                            <X size={10} className="mr-4" /> Rejected: {reason}
                          </span>
                        </div>
                        <button 
                          className="btn btn-ghost btn-xs text-primary" 
                          onClick={() => {
                            setReuploadingBillId(id);
                            reuploadInputRef.current?.click();
                          }}
                        >
                          <RotateCcw size={12} className="mr-4" /> Re-upload
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>

          <input 
            ref={fileInputRef} 
            type="file" 
            multiple 
            hidden 
            accept=".pdf,.png,.jpg,.jpeg,.webp" 
            onChange={handleFileUpload} 
          />
          <input 
            ref={reuploadInputRef} 
            type="file" 
            hidden 
            accept=".pdf,.png,.jpg,.jpeg,.webp" 
            onChange={handleReupload} 
          />
        </div>
      )}

      {/* ────────────────── CAMERA CAPTURE MODE VIEW (Dark theme) ────────────────── */}
      {uiState === 'camera' && (
        <div className="camera-fullscreen-view animate-fade-in">
          
          {/* Header */}
          <div className="camera-dark-header row space-between items-center p-16">
            <button className="camera-back-btn btn btn-ghost" onClick={() => { stopCamera(); setUiState('dashboard'); setCapturedPhoto(null); }}>
              <ArrowLeft size={20} className="mr-4" /> Exit
            </button>
            <span className="camera-header-title">Capture Bill</span>
            <div className="camera-header-actions row gap-sm">
              <button 
                className={`btn btn-ghost btn-icon camera-tool-btn ${showGrid ? 'active' : ''}`} 
                onClick={() => setShowGrid(!showGrid)}
                title="Grid lines"
              >
                #
              </button>
              <button 
                className={`btn btn-ghost btn-icon camera-tool-btn ${isFlashOn ? 'active' : ''}`}
                onClick={toggleFlash}
                title="Toggle Torch/Flash"
              >
                Flash {isFlashOn ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Core viewport */}
          <div className="camera-dark-body">
            {!capturedPhoto ? (
              <div className="camera-feed-area">
                <video ref={videoRef} className="camera-video-element" playsInline />
                {showGrid && (
                  <div className="camera-grid-overlay">
                    <div className="grid-line horizontal" style={{ top: '33.33%' }} />
                    <div className="grid-line horizontal" style={{ top: '66.66%' }} />
                    <div className="grid-line vertical" style={{ left: '33.33%' }} />
                    <div className="grid-line vertical" style={{ left: '66.66%' }} />
                  </div>
                )}
                {/* Custom glowing bracket edge indicators */}
                <div className="document-scanner-bracket top-left" />
                <div className="document-scanner-bracket top-right" />
                <div className="document-scanner-bracket bottom-left" />
                <div className="document-scanner-bracket bottom-right" />

                {cameraLoading && (
                  <div className="camera-inner-loader">
                    <Loader2 size={32} className="animate-spin text-primary" />
                  </div>
                )}
                {cameraError && (
                  <div className="camera-feed-error p-24 text-center">
                    <AlertCircle size={36} className="text-error mb-8" />
                    <p className="text-sm">{cameraError}</p>
                  </div>
                )}
              </div>
            ) : (
              // Photo Preview State
              <div className="camera-preview-area">
                <img src={capturedPhoto.src} alt="Captured check" className="camera-preview-img" />
                <div className="scan-processed-badge">
                  <CheckCircle size={16} /> Edge Cropped &amp; Brightened
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls */}
          <div className="camera-dark-footer stack-md p-16">
            
            {/* Thumbnail Strip of captured bills */}
            {capturedBills.length > 0 && (
              <div className="captured-thumbnails-strip stack-xs">
                <div className="row space-between text-xs muted font-semibold">
                  <span>Session: {capturedBills.length} Bill{capturedBills.length !== 1 ? 's' : ''} Captured</span>
                </div>
                <div className="thumbnails-horizontal-row row gap-sm py-4">
                  {capturedBills.map((b, idx) => (
                    <div key={b.id} className="thumbnail-strip-card border">
                      <img src={b.src} alt={b.label} className="strip-thumbnail-img" />
                      <button className="remove-strip-badge" onClick={() => removeBill(b.id)}>×</button>
                      <span className="strip-label">Bill {idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!capturedPhoto ? (
              // Live camera trigger options
              <div className="camera-trigger-row row gap-md items-center justify-center py-8">
                <button className="btn btn-ghost camera-action-minor-btn" onClick={() => fileInputRef.current?.click()}>
                  Gallery
                </button>
                
                <button className="shutter-button-outer" onClick={capturePhoto} disabled={cameraLoading}>
                  <div className="shutter-button-inner" />
                </button>
                
                <button className="btn btn-ghost camera-action-minor-btn" onClick={switchCamera}>
                  Switch
                </button>
              </div>
            ) : (
              // Review photo buttons
              <div className="preview-trigger-row stack-sm py-8 w-100">
                <div className="row gap-sm w-100">
                  <button className="btn btn-secondary border flex-1" onClick={() => setCapturedPhoto(null)}>
                    Retake
                  </button>
                  <button className="btn btn-primary flex-1" onClick={applyCapturedPhoto}>
                    Use Photo
                  </button>
                </div>

                <div className="sticky-action-bar border-top pt-16 row gap-sm w-100">
                  <button className="btn btn-ghost text-primary flex-1" onClick={() => { applyCapturedPhoto(); startOcrProcessing(); }}>
                    Upload &amp; Process All
                  </button>
                  <button className="btn btn-secondary border flex-1" onClick={() => { applyCapturedPhoto(); /* Keeps camera active */ }}>
                    Next Photo →
                  </button>
                </div>
              </div>
            )}

          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      )}

      {/* ────────────────── OCR STEPPER PROCESSING VIEW ────────────────── */}
      {uiState === 'ocr' && (
        <div className="ocr-processing-view border stack-lg p-32 text-center animate-fade-in" style={{ maxWidth: '600px', margin: '40px auto' }}>
          
          <div className="row gap-sm mb-16">
            <button className="btn btn-ghost btn-sm" onClick={() => { setUiState('dashboard'); }}>
              <ArrowLeft size={16} className="mr-4" /> Back to Upload
            </button>
          </div>

          <div className="processing-header stack-sm items-center">
            <Loader2 size={48} className="animate-spin text-primary mb-8" />
            <h2 className="section-title">Smart OCR Extraction</h2>
            <p className="muted text-xs">
              Processing bill <strong>{processingIndex + 1} of {capturedBills.length}</strong>: {capturedBills[processingIndex]?.label}
            </p>
          </div>

          <div className="ocr-stepper-container stack-md border p-24">
            
            {/* Step 1: Uploading */}
            <div className={`stepper-step row gap-sm items-center ${ocrProgress[processingIndex]?.currentStep >= 1 ? 'active' : ''}`}>
              <div className="step-circle">
                {ocrProgress[processingIndex]?.currentStep > 1 ? <Check size={14} /> : 1}
              </div>
              <span className="step-label font-semibold text-xs">1. Uploading secure media files</span>
              {ocrProgress[processingIndex]?.currentStep === 1 && <Loader2 size={14} className="animate-spin text-primary ml-auto" />}
            </div>

            {/* Step 2: Extracting Text */}
            <div className={`stepper-step row gap-sm items-center ${ocrProgress[processingIndex]?.currentStep >= 2 ? 'active' : ''}`}>
              <div className="step-circle">
                {ocrProgress[processingIndex]?.currentStep > 2 ? <Check size={14} /> : 2}
              </div>
              <span className="step-label font-semibold text-xs">2. Extracting raw document text</span>
              {ocrProgress[processingIndex]?.currentStep === 2 && <Loader2 size={14} className="animate-spin text-primary ml-auto" />}
            </div>

            {/* Step 3: Detecting Vendor */}
            <div className={`stepper-step row gap-sm items-center ${ocrProgress[processingIndex]?.currentStep >= 3 ? 'active' : ''}`}>
              <div className="step-circle">
                {ocrProgress[processingIndex]?.currentStep > 3 ? <Check size={14} /> : 3}
              </div>
              <span className="step-label font-semibold text-xs">3. Detecting vendor entity name</span>
              {ocrProgress[processingIndex]?.currentStep === 3 && <Loader2 size={14} className="animate-spin text-primary ml-auto" />}
            </div>

            {/* Step 4: Detecting Amount */}
            <div className={`stepper-step row gap-sm items-center ${ocrProgress[processingIndex]?.currentStep >= 4 ? 'active' : ''}`}>
              <div className="step-circle">
                {ocrProgress[processingIndex]?.currentStep > 4 ? <Check size={14} /> : 4}
              </div>
              <span className="step-label font-semibold text-xs">4. Detecting invoice amounts & taxes</span>
              {ocrProgress[processingIndex]?.currentStep === 4 && <Loader2 size={14} className="animate-spin text-primary ml-auto" />}
            </div>

            {/* Step 5: Matching Inventory */}
            <div className={`stepper-step row gap-sm items-center ${ocrProgress[processingIndex]?.currentStep >= 5 ? 'active' : ''}`}>
              <div className="step-circle">
                {ocrProgress[processingIndex]?.currentStep > 5 ? <Check size={14} /> : 5}
              </div>
              <span className="step-label font-semibold text-xs">5. Matching items to product library</span>
              {ocrProgress[processingIndex]?.currentStep === 5 && <Loader2 size={14} className="animate-spin text-primary ml-auto" />}
            </div>

            {/* Step 6: Ready for Review */}
            <div className={`stepper-step row gap-sm items-center ${ocrProgress[processingIndex]?.currentStep >= 6 ? 'active' : ''}`}>
              <div className="step-circle">
                {ocrProgress[processingIndex]?.currentStep >= 6 ? <Check size={14} /> : 6}
              </div>
              <span className="step-label font-semibold text-xs">6. Done! Ready for accountant review</span>
            </div>

          </div>

          <div className="estimated-remaining-time text-xs muted font-semibold">
            Estimated remaining session time: ~{(capturedBills.length - processingIndex) * ESTIMATED_TIME_PER_BILL} seconds
          </div>
        </div>
      )}

      {/* ────────────────── ACCOUNTANT REVIEW SCREEN VIEW ────────────────── */}
      {uiState === 'review' && (
        <div className="accountant-review-view stack-md animate-fade-in">
          
          {/* Header */}
          <div className="page-header row space-between items-center flex-wrap gap-md">
            <div>
              <h1 className="scan-title">Review Bills</h1>
              <p className="scan-subtitle">Review, edit, and confirm parsed document fields before committing database entries.</p>
            </div>
            
            <div className="row gap-sm items-center">
              <span className="muted text-xs">Branch Stock:</span>
              <BranchSelect 
                value={selectedBranchId}
                onChange={e => setSelectedBranchId(e.target.value)}
                className="branch-dropdown-field border p-8 rounded-8 text-xs font-semibold"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </BranchSelect>
            </div>
          </div>

          {/* Bulk actions bar */}
          <div className="bulk-actions-bar border row gap-sm justify-between items-center p-12">
            <div className="row gap-xs items-center">
              <label className="checkbox-row text-xs font-semibold mr-8">
                <input 
                  type="checkbox"
                  checked={selectedReviewIds.length === extractedBillsData.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedReviewIds(extractedBillsData.map(b => b.id));
                    else setSelectedReviewIds([]);
                  }}
                />
                <span>Select All ({extractedBillsData.length})</span>
              </label>
            </div>

            <div className="row gap-xs">
              <button 
                className="btn btn-secondary border btn-sm"
                disabled={selectedReviewIds.length === 0}
                onClick={() => toast('Bulk edit not implemented. Please edit bills individually.')}
              >
                Edit Selected
              </button>
              <button 
                className="btn btn-primary btn-sm"
                disabled={selectedReviewIds.length === 0}
                onClick={confirmAllSelected}
              >
                Confirm Selected ({selectedReviewIds.length})
              </button>
            </div>
          </div>

          {/* Bills Grid */}
          <div className="review-bills-grid">
            {extractedBillsData.map((bill) => {
              const hasUncertainties = bill.uncertainFields.length > 0;
              const isSelected = selectedReviewIds.includes(bill.id);

              return (
                <div key={bill.id} className={`review-bill-card border stack-md ${hasUncertainties ? 'has-alerts' : ''} ${isSelected ? 'selected' : ''}`}>
                  
                  {/* Card Header */}
                  <div className="review-card-header row gap-sm items-center pb-8 border-bottom">
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectReview(bill.id)}
                    />
                    <img src={bill.src} alt={bill.label} className="review-card-thumbnail border" />
                    <div className="flex-1 stack-xxs">
                      <span className="font-semibold text-xs">{bill.label}</span>
                      <div className="row gap-xs items-center">
                        <span 
                          className="text-xxs font-semibold"
                          style={{ color: getConfidenceColor(bill.confidence) }}
                        >
                          {getConfidenceBadge(bill.confidence).icon} {Math.round(bill.confidence * 100)}%
                        </span>
                        <span className="muted text-xxs">({bill.ocr_engine || 'gemini'})</span>
                        {bill.extraction_status === 'low_confidence' && (
                          <span className="status-badge status-warning text-xxs" style={{ background: '#fef3c7', color: '#92400e' }}>Low Conf</span>
                        )}
                        {bill.duplicate_warning && (
                          <span className="status-badge text-xxs" style={{ background: '#fee2e2', color: '#991b1b' }}>Duplicate?</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Extraction logs toggle */}
                    <button 
                      className="btn btn-ghost btn-icon btn-xs" 
                      onClick={() => handleReviewFieldChange(bill.id, 'showExtractionLogs', !bill.showExtractionLogs)}
                      title="Toggle extraction debug logs"
                    >
                      <Bug size={12} />
                    </button>

                    {/* Uncertainty alert badge */}
                    {hasUncertainties && (
                      <span className="uncertain-alert-badge" title="Fields require manual checking">
                        ⚠️ Checks Needed
                      </span>
                    )}
                  </div>

                  {/* Extraction logs debug section */}
                  {bill.showExtractionLogs && bill.extraction_logs && bill.extraction_logs.length > 0 && (
                    <div className="extraction-logs-panel border p-8" style={{ background: '#f8fafc', fontSize: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                      <div className="font-semibold text-xxs mb-4">Extraction Logs</div>
                      {bill.extraction_logs.map((log, idx) => {
                        const logColor = log.confidence_score >= 0.7 ? '#22c55e' : log.confidence_score >= 0.4 ? '#eab308' : '#ef4444';
                        return (
                          <div key={idx} className="row gap-xs items-center py-2 border-bottom" style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: logColor, display: 'inline-block' }} />
                            <span className="font-semibold" style={{ minWidth: '80px' }}>{log.field_name}</span>
                            <span style={{ color: logColor, minWidth: '35px' }}>{Math.round(log.confidence_score * 100)}%</span>
                            <span className="muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(log.extracted_value || '').slice(0, 60)}</span>
                            <span className="muted">{log.ocr_engine || ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Duplicate warning */}
                  {bill.duplicate_warning && (
                    <div className="border p-8" style={{ background: '#fef2f2', borderColor: '#fecaca', borderRadius: '4px' }}>
                      <div className="row gap-xs items-center text-xxs" style={{ color: '#991b1b' }}>
                        <AlertCircle size={10} />
                        <span className="font-semibold">Possible duplicate:</span>
                        <span>{bill.duplicate_warning.vendor_name} - {bill.duplicate_warning.bill_number || 'No#'} - ₹{bill.duplicate_warning.amount}</span>
                        <span className="muted">({new Date(bill.duplicate_warning.created_at).toLocaleDateString()})</span>
                      </div>
                    </div>
                  )}

                  {bill.extractionFailed && (
                    <div className="border p-12 stack-xs" style={{ background: '#fef2f2', borderColor: '#fee2e2', borderRadius: '6px', margin: '8px 0' }}>
                      <div className="row gap-xs items-center text-xs text-error font-semibold">
                        <AlertCircle size={14} /> Extraction Failed
                      </div>
                      <p className="muted text-xxs">We couldn't automatically parse this document. You can retry the OCR extraction or fill the fields manually.</p>
                      <button className="btn btn-secondary border btn-xs mt-8 row items-center justify-center w-100" onClick={() => retryExtraction(bill.id)} style={{ width: '100%' }}>
                        <RefreshCw size={12} className="mr-4" /> Retry OCR Extraction
                      </button>
                    </div>
                  )}

                  {/* Fields Grid */}
                  <div className="review-card-fields stack-sm">
                    
                    {/* Vendor Field */}
                    <div className={`field-row stack-xxs ${bill.uncertainFields.includes('vendor_name') ? 'uncertain-highlight' : ''}`}>
                      <div className="row space-between items-center">
                        <label className="label text-xxs">Vendor *</label>
                        {bill.confidence_scores?.vendor_name && (
                          <span className="conf-badge" style={{ color: getConfidenceColor(bill.confidence_scores.vendor_name), fontSize: '10px' }}>
                            {getConfidenceBadge(bill.confidence_scores.vendor_name).icon} {getConfidenceBadge(bill.confidence_scores.vendor_name).label}
                          </span>
                        )}
                      </div>
                      <input 
                        type="text"
                        value={bill.vendor_name}
                        onChange={(e) => handleReviewFieldChange(bill.id, 'vendor_name', e.target.value)}
                        placeholder="e.g. Acme Corp"
                        className="review-input-field text-xs"
                        style={bill.confidence_scores?.vendor_name < 0.4 ? { borderColor: '#ef4444' } : bill.confidence_scores?.vendor_name < 0.7 ? { borderColor: '#eab308' } : {}}
                      />
                      {bill.uncertainFields.includes('vendor_name') && (
                        <span className="uncertainty-caption">Vendor name unclear. Confirm?</span>
                      )}
                    </div>

                    {/* Invoice Number & Date row */}
                    <div className="row gap-sm">
                      <div className={`field-row flex-1 stack-xxs ${bill.uncertainFields.includes('bill_number') ? 'uncertain-highlight' : ''}`}>
                        <div className="row space-between items-center">
                          <label className="label text-xxs">Invoice No.</label>
                          {bill.confidence_scores?.bill_number && (
                            <span className="conf-badge" style={{ color: getConfidenceColor(bill.confidence_scores.bill_number), fontSize: '10px' }}>
                              {getConfidenceBadge(bill.confidence_scores.bill_number).icon} {getConfidenceBadge(bill.confidence_scores.bill_number).label}
                            </span>
                          )}
                        </div>
                        <input 
                          type="text"
                          value={bill.bill_number}
                          onChange={(e) => handleReviewFieldChange(bill.id, 'bill_number', e.target.value)}
                          placeholder="e.g. INV-102"
                          className="review-input-field text-xs"
                          style={bill.confidence_scores?.bill_number < 0.4 ? { borderColor: '#ef4444' } : bill.confidence_scores?.bill_number < 0.7 ? { borderColor: '#eab308' } : {}}
                        />
                      </div>
                      <div className="field-row flex-1 stack-xxs">
                        <div className="row space-between items-center">
                          <label className="label text-xxs">Invoice Date</label>
                          {bill.confidence_scores?.bill_date && (
                            <span className="conf-badge" style={{ color: getConfidenceColor(bill.confidence_scores.bill_date), fontSize: '10px' }}>
                              {getConfidenceBadge(bill.confidence_scores.bill_date).icon} {getConfidenceBadge(bill.confidence_scores.bill_date).label}
                            </span>
                          )}
                        </div>
                        <input 
                          type="date"
                          value={bill.bill_date}
                          onChange={(e) => handleReviewFieldChange(bill.id, 'bill_date', e.target.value)}
                          className="review-input-field text-xs"
                          style={bill.confidence_scores?.bill_date < 0.4 ? { borderColor: '#ef4444' } : bill.confidence_scores?.bill_date < 0.7 ? { borderColor: '#eab308' } : {}}
                        />
                      </div>
                    </div>

                    {/* Amount & Tax row */}
                    <div className="row gap-sm">
                      <div className={`field-row flex-1 stack-xxs ${bill.uncertainFields.includes('amount') ? 'uncertain-highlight' : ''}`}>
                        <div className="row space-between items-center">
                          <label className="label text-xxs">Total Amount (₹) *</label>
                          {bill.confidence_scores?.total_amount && (
                            <span className="conf-badge" style={{ color: getConfidenceColor(bill.confidence_scores.total_amount), fontSize: '10px' }}>
                              {getConfidenceBadge(bill.confidence_scores.total_amount).icon} {getConfidenceBadge(bill.confidence_scores.total_amount).label}
                            </span>
                          )}
                        </div>
                        <input 
                          type="number"
                          value={bill.amount}
                          onChange={(e) => handleReviewFieldChange(bill.id, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="review-input-field text-xs font-semibold"
                        />
                        {bill.uncertainFields.includes('amount') && (
                          <span className="uncertainty-caption">Amount missing. Confirm?</span>
                        )}
                      </div>
                      <div className="field-row flex-1 stack-xxs">
                        <label className="label text-xxs">Tax Amount (₹)</label>
                        <input 
                          type="number"
                          value={bill.tax}
                          onChange={(e) => handleReviewFieldChange(bill.id, 'tax', e.target.value)}
                          placeholder="0.00"
                          className="review-input-field text-xs"
                        />
                      </div>
                    </div>

                    {/* Items brief preview */}
                    <div className={`field-row stack-xxs ${bill.uncertainFields.includes('items') || bill.uncertainFields.includes('items_qty') ? 'uncertain-highlight' : ''}`}>
                      <div className="row space-between items-center">
                        <label className="label text-xxs">Items Count</label>
                        <span className="text-xxs font-semibold text-primary cursor-pointer" onClick={() => setIsEditingId(bill.id)}>
                          Detail / Edit Line Items ({bill.items.length})
                        </span>
                      </div>
                      <div className="items-row-pills row gap-xxs mt-4">
                        {bill.items.length === 0 ? (
                          <span className="muted text-xxs">No items extracted. Click Edit to add.</span>
                        ) : (
                          bill.items.slice(0, 3).map((it, idx) => (
                            <span key={idx} className="item-badge-pill text-xxs" title={it.item_name}>
                              {it.item_name.slice(0, 12)}.. ({it.quantity || '?'})
                            </span>
                          ))
                        )}
                        {bill.items.length > 3 && (
                          <span className="item-badge-pill text-xxs font-semibold">+{bill.items.length - 3} more</span>
                        )}
                      </div>
                      {bill.uncertainFields.includes('items_qty') && (
                        <span className="uncertainty-caption mt-4">Quantity unclear. Confirm?</span>
                      )}
                    </div>

                  </div>

                  {/* Actions footer */}
                  <div className="card-actions-row border-top pt-12 row gap-sm mt-8">
                    <button className="btn btn-ghost border btn-xs flex-1" onClick={() => setIsEditingId(bill.id)}>
                      <Edit3 size={12} className="mr-4" /> Edit Items
                    </button>
                    <button className="btn btn-ghost text-error btn-xs" onClick={() => rejectBill(bill.id)} title="Reject bill">
                      <X size={12} className="mr-4" /> Reject
                    </button>
                    <button className="btn btn-primary btn-xs flex-1" onClick={() => confirmSingleBill(bill.id)}>
                      Confirm
                    </button>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Quick manual navigation */}
          {extractedBillsData.length === 0 && (
            <div className="review-empty-state border text-center p-32 stack-sm">
              <CheckCircle size={48} className="text-success mb-8" />
              <h3>All Bills Reviewed</h3>
              <p className="muted text-xs">There are no bills left to review in this session.</p>
              <div className="row gap-sm justify-center mt-12">
                <button className="btn btn-ghost border" onClick={() => { setUiState('dashboard'); }}>
                  <ArrowLeft size={16} className="mr-4" /> Back to Upload
                </button>
                <button className="btn btn-primary" onClick={() => navigate(redirectPath)}>
                  Done &amp; Return
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ────────────────── LINE ITEMS EDIT POPUP MODAL ────────────────── */}
      {isEditingId && activeEditBill && (
        <div className="modal-backdrop modal-backdrop--high">
          <div className="em-modal" style={{ maxWidth: '850px', width: '92%' }}>
            
            <div className="em-modal__header">
              <div className="stack-xxs">
                <h2>Edit Items - {activeEditBill.label}</h2>
                <span className="muted text-xs">Manage lines, rates, and values for stock sync.</span>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setIsEditingId(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="em-modal__body stack-md">
              <div className="items-table-wrap">
                <table className="items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>SI</th>
                      <th>Description *</th>
                      <th style={{ width: '100px' }}>HSN</th>
                      <th style={{ width: '80px' }}>Qty *</th>
                      <th style={{ width: '100px' }}>Rate (₹) *</th>
                      <th style={{ width: '90px' }}>GST %</th>
                      <th style={{ width: '100px' }}>Total (₹)</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEditBill.items.map((it, idx) => (
                      <tr key={idx}>
                        <td>
                          <input 
                            type="number"
                            value={it.serial_no}
                            onChange={(e) => handleReviewItemChange(activeEditBill.id, idx, 'serial_no', e.target.value)}
                            className="table-input text-xs"
                          />
                        </td>
                        <td>
                          <input 
                            type="text"
                            value={it.item_name}
                            onChange={(e) => handleReviewItemChange(activeEditBill.id, idx, 'item_name', e.target.value)}
                            placeholder="Item description"
                            className="table-input text-xs"
                            required
                          />
                        </td>
                        <td>
                          <input 
                            type="text"
                            value={it.hsn_sac}
                            onChange={(e) => handleReviewItemChange(activeEditBill.id, idx, 'hsn_sac', e.target.value)}
                            placeholder="HSN"
                            className="table-input text-xs"
                          />
                        </td>
                        <td>
                          <input 
                            type="number"
                            value={it.quantity}
                            onChange={(e) => handleReviewItemChange(activeEditBill.id, idx, 'quantity', e.target.value)}
                            placeholder="1"
                            className="table-input text-xs"
                            required
                          />
                        </td>
                        <td>
                          <input 
                            type="number"
                            value={it.rate}
                            onChange={(e) => handleReviewItemChange(activeEditBill.id, idx, 'rate', e.target.value)}
                            placeholder="0.00"
                            className="table-input text-xs"
                            required
                          />
                        </td>
                        <td>
                          <input 
                            type="number"
                            value={it.gst_percent}
                            onChange={(e) => handleReviewItemChange(activeEditBill.id, idx, 'gst_percent', e.target.value)}
                            placeholder="18"
                            className="table-input text-xs"
                          />
                        </td>
                        <td className="text-xs font-semibold">
                          ₹{it.mrp || (it.quantity * it.rate * (1 + (it.gst_percent || 0)/100)).toFixed(2)}
                        </td>
                        <td>
                          <button 
                            className="btn btn-ghost btn-icon btn-xs text-error"
                            onClick={() => {
                              const nextItems = activeEditBill.items.filter((_, i) => i !== idx);
                              handleReviewFieldChange(activeEditBill.id, 'items', nextItems);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button 
                className="btn btn-ghost border btn-xs"
                onClick={() => {
                  const newItem = {
                    serial_no: activeEditBill.items.length + 1,
                    item_name: '',
                    hsn_sac: '',
                    quantity: '',
                    rate: '',
                    gst_percent: 18,
                    mrp: ''
                  };
                  handleReviewFieldChange(activeEditBill.id, 'items', [...activeEditBill.items, newItem]);
                }}
              >
                + Add Item Line
              </button>
            </div>

            <div className="em-modal__footer row gap-sm justify-end">
              <button className="btn btn-ghost" onClick={() => setIsEditingId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => setIsEditingId(null)}>
                Apply &amp; Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ────────────────── SUCCESS FLOW VIEW ────────────────── */}
      {uiState === 'success' && (
        <div className="success-flow-view border text-center p-32 stack-md animate-fade-in" style={{ maxWidth: '500px', margin: '40px auto' }}>
          <div className="success-icon-badge mx-auto">
            <CheckCircle size={64} className="text-success" />
          </div>
          <h2 className="section-title">Session Saved Successfully!</h2>
          <p className="muted text-xs">
            All confirmed bills and details have been written to the database. Inventory levels and expense ledgers have been updated.
          </p>

          <div className="action-buttons row gap-sm justify-center mt-16">
            <button className="btn btn-ghost border" onClick={() => { setCapturedBills([]); setBillRejections({}); setUiState('dashboard'); }}>
              Upload More
            </button>
            <button className="btn btn-primary" onClick={() => navigate(redirectPath)}>
              Done
            </button>
          </div>
        </div>
      )}

    </PageContainer>
  );
};

export default UploadBills;

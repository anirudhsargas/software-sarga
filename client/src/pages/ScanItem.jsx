import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Search, Upload, Plus, Minus, Loader2, IndianRupee, Tag, ShieldAlert, Package, Check, X, ArrowLeft, RefreshCw } from 'lucide-react';
import jsQR from 'jsqr';
import api from '../services/api';
import auth from '../services/auth';
import SecureImage from '../components/SecureImage';
import CameraPermissionModal from '../components/CameraPermissionModal';
import toast from 'react-hot-toast';
import './ScanItem.css';

let html5QrcodeModule = null;
let html5QrcodePromise = null;

const getHtml5QrcodeModule = () => {
    if (html5QrcodePromise) return html5QrcodePromise;
    html5QrcodePromise = import('html5-qrcode').then(mod => {
        html5QrcodeModule = mod;
        return mod;
    });
    return html5QrcodePromise;
};

const ScanItem = () => {
    const navigate = useNavigate();
    const userRole = auth.getUser()?.role;
    const isAdminOrAccountant = ['Admin', 'Accountant'].includes(userRole);
    const isFrontOffice = userRole === 'Front Office';

    // Scanner state
    const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'file' | 'manual'
    const [manualCode, setManualCode] = useState('');
    const [isCamActive, setIsCamActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [scanningFile, setScanningFile] = useState(false);
    const [cameras, setCameras] = useState([]);
    const [selectedCamId, setSelectedCamId] = useState('');
    const [showPermissionModal, setShowPermissionModal] = useState(false);

    // Lookup / Result state
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupResult, setLookupResult] = useState(null);
    const [lookupError, setLookupError] = useState('');

    // Inline forms state
    const [showRestock, setShowRestock] = useState(false);
    const [showConsume, setShowConsume] = useState(false);
    const [restockQty, setRestockQty] = useState('');
    const [restockCost, setRestockCost] = useState('');
    const [restockNotes, setRestockNotes] = useState('');
    const [consumeQty, setConsumeQty] = useState('');
    const [consumeNotes, setConsumeNotes] = useState('');
    const [submittingAction, setSubmittingAction] = useState(false);

    // Scanner Refs
    const scannerRef = useRef(null);
    const isStartedRef = useRef(false);
    const isStoppingRef = useRef(false);
    const mountedRef = useRef(true);
    const fileInputRef = useRef(null);
    const camDivId = useRef(`qr-cam-page-${Math.random().toString(36).slice(2)}`);

    const normalizeCode = (val) => String(val || '').replace(/\s+/g, '').toUpperCase();

    // Request camera permission directly with a fresh user gesture
    const requestCameraPermission = useCallback(async () => {
        try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
            tempStream.getTracks().forEach(track => track.stop());
            return true;
        } catch (err) {
            if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
                setCameraError('Camera permission denied. Please allow camera access in your browser settings, then try again.');
                setShowPermissionModal(true);
            } else {
                setCameraError('Unable to access camera. Please check your camera device or switch to file upload.');
                return false;
            }
            return false;
        }
    }, []);

    const handleRetryPermission = async () => {
        setShowPermissionModal(false);
        setCameraError('');
        const ok = await requestCameraPermission();
        if (ok) {
            setIsCamActive(true);
            setLookupResult(null);
        }
    };

    // Check permissions
    useEffect(() => {
        if (!['Admin', 'Front Office', 'Accountant'].includes(userRole)) {
            toast.error('Access Denied: You do not have permissions to scan inventory items.');
            navigate('/dashboard');
        }
    }, [userRole, navigate]);

    useEffect(() => {
        mountedRef.current = true;
        // Start pre-loading html5-qrcode module eagerly
        getHtml5QrcodeModule();
        if ('permissions' in navigator) {
            navigator.permissions.query({ name: 'camera' }).then((status) => {
                if (status.state === 'denied') {
                    setCameraError('Camera access is blocked in your browser settings. Please allow camera access for this site, then refresh the page.');
                }
                status.addEventListener('change', () => {
                    if (status.state === 'granted' && mountedRef.current) {
                        setCameraError('');
                    }
                });
            }).catch(() => {});
        }
        return () => {
            mountedRef.current = false;
            safeStop();
        };
    }, []);

    // Load html5-qrcode (pre-loaded via module-level promise)
    const loadHtml5Qrcode = useCallback(async () => {
        return getHtml5QrcodeModule();
    }, []);

    // Stop camera safely
    const safeStop = useCallback(async () => {
        const qr = scannerRef.current;
        if (!qr || !isStartedRef.current || isStoppingRef.current) return;
        isStoppingRef.current = true;
        try {
            await qr.stop();
        } catch (err) {
            console.warn('Failed to stop camera stream:', err);
        } finally {
            isStartedRef.current = false;
            isStoppingRef.current = false;
            scannerRef.current = null;
        }
    }, []);

    // Lookup Item from server
    const handleLookup = useCallback(async (code) => {
        const normalized = normalizeCode(code);
        if (!normalized) return;

        setLookupLoading(true);
        setLookupError('');
        try {
            const { data } = await api.get(`/inventory/by-sku/${encodeURIComponent(normalized)}`);
            setLookupResult(data);
            // Pre-fill restock cost price if available
            setRestockCost(data.cost_price || '');
            // Close inline forms if open
            setShowRestock(false);
            setShowConsume(false);
            toast.success(`Loaded: ${data.name}`);
        } catch (err) {
            setLookupResult(null);
            setLookupError(err.response?.data?.message || `No inventory item matches code: ${code}`);
            toast.error(err.response?.data?.message || 'Item lookup failed.');
        } finally {
            setLookupLoading(false);
        }
    }, []);

    // Start live camera
    const startCamera = useCallback(async () => {
        if (!mountedRef.current || activeTab !== 'camera' || !isCamActive) return;
        
        await safeStop();
        setCameraError('');

        try {
            const mod = await loadHtml5Qrcode();
            if (!mod || !mountedRef.current) return;
            const { Html5Qrcode } = mod;

            const qr = new Html5Qrcode(camDivId.current, { verbose: false });
            scannerRef.current = qr;

            // Get available cameras if not loaded
            if (cameras.length === 0) {
                const devices = await Html5Qrcode.getCameras().catch(() => []);
                if (mountedRef.current) {
                    setCameras(devices);
                    if (devices.length > 0) {
                        setSelectedCamId(devices[0].id);
                    }
                }
            }

            const config = { fps: 12, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 };
            
            const onScanSuccess = (text) => {
                const normalized = normalizeCode(text);
                if (normalized) {
                    handleLookup(normalized);
                    // Pause camera briefly on successful scan to avoid duplicate scans
                    setIsCamActive(false);
                }
            };

            const cameraId = selectedCamId || { facingMode: 'environment' };

            await qr.start(
                cameraId,
                config,
                onScanSuccess,
                () => { /* frame mismatch - ignore */ }
            );
            isStartedRef.current = true;
        } catch (err) {
            console.warn('Live camera start error:', err);
            if (mountedRef.current) {
                const isPermissionDenied = err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied');
                setCameraError(isPermissionDenied
                    ? 'Camera permission denied. Please allow camera access in your browser settings, then try again.'
                    : 'Unable to start live camera feed. Please check permissions or switch to file upload.');
                if (isPermissionDenied) {
                    setShowPermissionModal(true);
                }
                setIsCamActive(false);
                isStartedRef.current = false;
                scannerRef.current = null;
            }
        }
    }, [activeTab, isCamActive, selectedCamId, cameras.length, loadHtml5Qrcode, safeStop, handleLookup]);

    // Handle active camera start/stop
    useEffect(() => {
        if (activeTab === 'camera' && isCamActive) {
            startCamera();
        } else {
            safeStop();
        }
    }, [activeTab, isCamActive, selectedCamId, startCamera, safeStop]);

    // Cleanup camera when switching tabs
    useEffect(() => {
        if (activeTab !== 'camera') {
            safeStop();
        }
    }, [activeTab, safeStop]);

    // Upload Photo: jsQR Scan
    const scanFileWithJsQR = (file) => new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const attempts = [1, 2, 3];
            for (const scale of attempts) {
                const canvas = document.createElement('canvas');
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'attemptBoth',
                });
                if (code) { resolve(code.data); return; }
            }
            resolve(null);
        };
        img.onerror = reject;
        img.src = url;
    });

    // Native Barcode Detector
    const tryBarcodeDetector = async (file) => {
        if (!('BarcodeDetector' in window)) return null;
        try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e'] });
            const bitmap = await createImageBitmap(file);
            const codes = await detector.detect(bitmap);
            return codes.length > 0 ? codes[0].rawValue : null;
        } catch { return null; }
    };

    // html5-qrcode file fallback
    const tryHtml5Qrcode = async (file) => {
        const mod = await loadHtml5Qrcode();
        if (!mod) return null;
        const tmpId = `qr-tmp-page-${Date.now()}`;
        const tmpDiv = document.createElement('div');
        tmpDiv.id = tmpId;
        tmpDiv.style.position = 'fixed';
        tmpDiv.style.left = '-9999px';
        tmpDiv.style.top = '0';
        tmpDiv.style.width = '300px';
        tmpDiv.style.height = '300px';
        document.body.appendChild(tmpDiv);
        try {
            const { Html5Qrcode } = mod;
            const qr = new Html5Qrcode(tmpId, { verbose: false });
            const result = await qr.scanFile(file, true);
            try { qr.clear(); } catch { /* ignore */ }
            return result;
        } finally {
            if (document.body.contains(tmpDiv)) document.body.removeChild(tmpDiv);
        }
    };

    // Handle Upload File selection
    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please select a valid image file.');
            return;
        }

        setScanningFile(true);
        setCameraError('');

        try {
            let result = await scanFileWithJsQR(file).catch(() => null);
            if (!result) result = await tryBarcodeDetector(file).catch(() => null);
            if (!result) result = await tryHtml5Qrcode(file).catch(() => null);

            if (result) {
                const normalized = normalizeCode(result);
                if (normalized) {
                    handleLookup(normalized);
                } else {
                    setCameraError('Decoded code was empty. Please try a clearer picture.');
                }
            } else {
                setCameraError('No QR code or barcode found in this photo. Make sure the code is well-lit and fits the frame.');
            }
        } catch (error) {
            console.error('File scan error:', error);
            setCameraError('Error reading the image file. Try again with a clearer image.');
        } finally {
            setScanningFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Manual lookup form submit
    const handleManualSubmit = (e) => {
        e.preventDefault();
        const code = manualCode.trim();
        if (!code) {
            toast.error('Please enter a SKU or barcode code.');
            return;
        }
        handleLookup(code);
    };

    // Restock Submit Action
    const handleRestockSubmit = async (e) => {
        e.preventDefault();
        if (!lookupResult) return;
        if (!restockQty || Number(restockQty) <= 0) {
            toast.error('Please enter a valid quantity.');
            return;
        }

        setSubmittingAction(true);
        try {
            await api.post(`/inventory/${lookupResult.id}/restock`, {
                quantity_received: Number(restockQty),
                cost_price: restockCost ? Number(restockCost) : undefined,
                notes: restockNotes || undefined
            });
            toast.success('Restocked successfully!');
            // Re-fetch item to show updated values
            await handleLookup(lookupResult.scanned_code || lookupResult.sku);
            // Reset restock fields
            setRestockQty('');
            setRestockNotes('');
            setShowRestock(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Restock transaction failed.');
        } finally {
            setSubmittingAction(false);
        }
    };

    // Consume Submit Action
    const handleConsumeSubmit = async (e) => {
        e.preventDefault();
        if (!lookupResult) return;
        if (!consumeQty || Number(consumeQty) <= 0) {
            toast.error('Please enter a valid quantity.');
            return;
        }
        if (Number(consumeQty) > Number(lookupResult.quantity)) {
            toast.error(`Insufficient stock! Available: ${lookupResult.quantity}`);
            return;
        }

        setSubmittingAction(true);
        try {
            await api.post(`/inventory/${lookupResult.id}/consume`, {
                quantity_consumed: Number(consumeQty),
                notes: consumeNotes || undefined
            });
            toast.success('Stock consumed successfully!');
            // Re-fetch item to show updated values
            await handleLookup(lookupResult.scanned_code || lookupResult.sku);
            // Reset consume fields
            setConsumeQty('');
            setConsumeNotes('');
            setShowConsume(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Consume transaction failed.');
        } finally {
            setSubmittingAction(false);
        }
    };

    const isLowStock = lookupResult && Number(lookupResult.quantity) <= Number(lookupResult.reorder_level || 0);

    return (
        <div className="scan-page-container stack-lg">
            
            {/* Header */}
            <div className="scan-header row items-center gap-md">
                <button className="btn btn-ghost icon-button back-btn" onClick={() => navigate(-1)} title="Go Back">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="scan-title">Scan Inventory Item</h1>
                    <p className="scan-subtitle">Lookup, restock, or consume general inventory items in real-time.</p>
                </div>
            </div>

            <div className="scan-layout-grid">
                
                {/* Left side: Scanner card with Tabs */}
                <div className="scanner-control-card border">
                    <div className="tabs-header row">
                        <button 
                            className={`tab-btn row items-center gap-xs flex-1 ${activeTab === 'camera' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('camera'); setCameraError(''); }}
                        >
                            <Camera size={16} /> Live Camera
                        </button>
                        <button 
                            className={`tab-btn row items-center gap-xs flex-1 ${activeTab === 'file' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('file'); setCameraError(''); }}
                        >
                            <Upload size={16} /> Upload Photo
                        </button>
                        <button 
                            className={`tab-btn row items-center gap-xs flex-1 ${activeTab === 'manual' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('manual'); setCameraError(''); }}
                        >
                            <Search size={16} /> Manual Search
                        </button>
                    </div>

                    <div className="tab-body">
                        
                        {/* Tab: Camera */}
                        {activeTab === 'camera' && (
                            <div className="camera-tab-container stack-sm">
                                {cameras.length > 1 && (
                                    <div className="camera-select-wrapper row gap-sm items-center">
                                        <span className="muted text-xs">Switch Camera:</span>
                                        <select 
                                            value={selectedCamId} 
                                            onChange={(e) => setSelectedCamId(e.target.value)}
                                            className="camera-select-field flex-1"
                                        >
                                            {cameras.map((c, i) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.label || `Camera ${i + 1}`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                
                                <div className="camera-viewport border">
                                    <div id={camDivId.current} className="camera-video-container" />
                                    {isCamActive && (
                                        <div className="viewport-overlay">
                                            <div className="scan-cutout">
                                                <div className="scan-corner scan-corner--tl" />
                                                <div className="scan-corner scan-corner--tr" />
                                                <div className="scan-corner scan-corner--bl" />
                                                <div className="scan-corner scan-corner--br" />
                                                <div className="scan-pulse" />
                                            </div>
                                        </div>
                                    )}
                                    {!isCamActive && (
                                        <div className="camera-paused row items-center justify-center">
                                            <div className="stack-xs items-center text-center">
                                                <p className="bold text-sm">{cameraError ? 'Camera Not Available' : 'Camera is off'}</p>
                                                <button className="btn btn-primary btn-sm mt-8" onClick={async () => { setCameraError(''); const ok = await requestCameraPermission(); if (ok) { setIsCamActive(true); setLookupResult(null); } }}>
                                                    <Camera size={14} className="mr-4" /> Start Camera
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        )}

                        {/* Tab: File Upload */}
                        {activeTab === 'file' && (
                            <div className="file-tab-container">
                                <div 
                                    className="upload-dropzone border"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload size={32} className="muted mb-8" />
                                    <p className="bold text-sm">Click to upload barcode/QR photo</p>
                                    <p className="muted text-xs mt-4">Accepts PNG, JPG, or WEBP images</p>
                                    
                                    {scanningFile && (
                                        <div className="dropzone-loader row items-center justify-center gap-sm">
                                            <Loader2 size={16} className="animate-spin text-primary" />
                                            <span>Processing file image...</span>
                                        </div>
                                    )}
                                </div>
                                <input 
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                    disabled={scanningFile}
                                />
                            </div>
                        )}

                        {/* Tab: Manual Search */}
                        {activeTab === 'manual' && (
                            <form onSubmit={handleManualSubmit} className="manual-tab-container stack-sm">
                                <label className="label text-xs">SKU / Item Code / Barcode</label>
                                <div className="row gap-sm">
                                    <input
                                        type="text"
                                        placeholder="Type SKU or barcode number..."
                                        value={manualCode}
                                        onChange={(e) => setManualCode(e.target.value)}
                                        className="input-field flex-1"
                                        required
                                    />
                                    <button type="submit" className="btn btn-primary" disabled={lookupLoading}>
                                        {lookupLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                    </button>
                                </div>
                            </form>
                        )}

                        {cameraError && (
                            <div className="scan-error-alert row gap-sm items-start border mt-16">
                                <ShieldAlert size={18} className="text-error mt-2" />
                                <div className="text-xs text-error">{cameraError}</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side: Result panel */}
                <div className="result-display-panel">
                    
                    {lookupLoading && (
                        <div className="result-card border row items-center justify-center" style={{ minHeight: '360px' }}>
                            <div className="stack-sm items-center text-center">
                                <Loader2 size={36} className="animate-spin text-primary" />
                                <p className="bold text-sm">Searching Database...</p>
                                <p className="muted text-xs">Retrieving inventory item record</p>
                            </div>
                        </div>
                    )}

                    {!lookupLoading && lookupError && (
                        <div className="result-card border row items-center justify-center text-center p-24" style={{ minHeight: '360px' }}>
                            <div className="stack-sm items-center">
                                <ShieldAlert size={48} className="text-error mb-8" />
                                <h3 className="bold text-lg text-error">No Item Found</h3>
                                <p className="muted text-sm max-w-xs">{lookupError}</p>
                                <button 
                                    className="btn btn-ghost btn-sm mt-12"
                                    onClick={() => { setLookupError(''); setManualCode(''); setActiveTab('manual'); }}
                                >
                                    Try Search Again
                                </button>
                            </div>
                        </div>
                    )}

                    {!lookupLoading && !lookupError && !lookupResult && (
                        <div className="result-card border row items-center justify-center text-center p-24" style={{ minHeight: '360px' }}>
                            <div className="stack-sm items-center text-muted">
                                <Package size={48} className="muted mb-8" />
                                <h3 className="bold text-md">Scan Result Display</h3>
                                <p className="muted text-xs max-w-xs">
                                    When you scan a barcode or submit a lookup, the item details and inventory transaction forms will be presented here.
                                </p>
                            </div>
                        </div>
                    )}

                    {!lookupLoading && !lookupError && lookupResult && (
                        <div className="result-card border stack-md">
                            
                            {/* Product Info Block */}
                            <div className="result-card-header row gap-md items-start">
                                {lookupResult.product_image_url || lookupResult.image_url ? (
                                    <SecureImage 
                                        src={lookupResult.product_image_url || lookupResult.image_url} 
                                        alt={lookupResult.name}
                                        className="product-detail-img border"
                                    />
                                ) : (
                                    <div className="product-detail-img border no-img row items-center justify-center">
                                        <Package size={28} className="muted" />
                                    </div>
                                )}
                                <div className="flex-1 stack-xs">
                                    <div className="sku-badge mb-4">
                                        <Tag size={12} className="mr-4" /> SKU: {lookupResult.sku}
                                    </div>
                                    <h2 className="product-detail-title">{lookupResult.name}</h2>
                                    <span className="product-category-text">{lookupResult.category || 'General'}</span>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="details-grid-layout">
                                <div className="grid-cell">
                                    <span className="cell-label">Selling Price (MRP)</span>
                                    <span className="cell-value price-text row items-center">
                                        <IndianRupee size={16} /> {lookupResult.mrp || lookupResult.sell_price || '0'}
                                    </span>
                                </div>
                                
                                {isAdminOrAccountant && (
                                    <div className="grid-cell border-left">
                                        <span className="cell-label">Cost Price (Base)</span>
                                        <span className="cell-value price-text cost row items-center">
                                            <IndianRupee size={16} /> {lookupResult.cost_price || '0'}
                                        </span>
                                    </div>
                                )}

                                <div className={`grid-cell border-left ${isLowStock ? 'alert-cell' : ''}`}>
                                    <span className="cell-label">Stock Status</span>
                                    <span className={`cell-value font-bold ${isLowStock ? 'text-error' : 'text-success'}`}>
                                        {lookupResult.quantity} {lookupResult.unit || 'pcs'}
                                    </span>
                                </div>
                            </div>

                            {/* Extra attributes */}
                            <div className="result-attributes stack-xs">
                                {lookupResult.hsn && (
                                    <div className="row space-between text-xs">
                                        <span className="muted">HSN Code:</span>
                                        <span className="bold">{lookupResult.hsn}</span>
                                    </div>
                                )}
                                {lookupResult.reorder_level !== undefined && (
                                    <div className="row space-between text-xs">
                                        <span className="muted">Reorder Threshold:</span>
                                        <span className={`bold ${isLowStock ? 'text-error' : ''}`}>
                                            {lookupResult.reorder_level} {lookupResult.unit || 'pcs'}
                                        </span>
                                    </div>
                                )}
                                {isLowStock && (
                                    <div className="low-stock-alert-bar row gap-xs items-center mt-8">
                                        <ShieldAlert size={14} className="text-error" />
                                        <span className="text-xs text-error font-semibold">Low Stock: Current quantity is below reorder level.</span>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="result-action-buttons row gap-sm mt-16">
                                {isAdminOrAccountant && (
                                    <button 
                                        className={`btn flex-1 ${showRestock ? 'btn-primary' : 'btn-ghost border'}`}
                                        onClick={() => { setShowRestock(!showRestock); setShowConsume(false); }}
                                    >
                                        <Plus size={16} className="mr-8" /> Restock
                                    </button>
                                )}
                                <button 
                                    className={`btn flex-1 ${showConsume ? 'btn-primary' : 'btn-ghost border'}`}
                                    onClick={() => { setShowConsume(!showConsume); setShowRestock(false); }}
                                >
                                    <Minus size={16} className="mr-8" /> Consume Stock
                                </button>
                            </div>

                            {/* Restock Form */}
                            {showRestock && isAdminOrAccountant && (
                                <form onSubmit={handleRestockSubmit} className="action-form stack-sm border mt-16">
                                    <h3 className="form-heading font-semibold text-sm">Restock Transaction</h3>
                                    
                                    <div className="form-fields row gap-md">
                                        <div className="flex-1 stack-xs">
                                            <label className="label text-xs">Quantity Received</label>
                                            <input 
                                                type="number"
                                                className="input-field"
                                                value={restockQty}
                                                onChange={(e) => setRestockQty(e.target.value)}
                                                placeholder="e.g. 50"
                                                min="1"
                                                required
                                            />
                                        </div>
                                        <div className="flex-1 stack-xs">
                                            <label className="label text-xs">Cost Price per Unit (₹)</label>
                                            <input 
                                                type="number"
                                                step="0.01"
                                                className="input-field"
                                                value={restockCost}
                                                onChange={(e) => setRestockCost(e.target.value)}
                                                placeholder={lookupResult.cost_price || '0'}
                                            />
                                        </div>
                                    </div>

                                    <div className="stack-xs">
                                        <label className="label text-xs">Transaction Notes</label>
                                        <input 
                                            type="text"
                                            className="input-field"
                                            value={restockNotes}
                                            onChange={(e) => setRestockNotes(e.target.value)}
                                            placeholder="Optional transaction remarks..."
                                        />
                                    </div>

                                    <div className="form-submit-row row gap-sm justify-end">
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRestock(false)}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary btn-sm" disabled={submittingAction}>
                                            {submittingAction ? <Loader2 size={14} className="animate-spin mr-8" /> : <Check size={14} className="mr-8" />}
                                            Complete Restock
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Consume Form */}
                            {showConsume && (
                                <form onSubmit={handleConsumeSubmit} className="action-form stack-sm border mt-16">
                                    <h3 className="form-heading font-semibold text-sm text-error">Consume Stock</h3>
                                    
                                    <div className="stack-xs">
                                        <label className="label text-xs">Quantity to Consume</label>
                                        <input 
                                            type="number"
                                            className="input-field"
                                            value={consumeQty}
                                            onChange={(e) => setConsumeQty(e.target.value)}
                                            placeholder={`Max: ${lookupResult.quantity}`}
                                            min="1"
                                            max={lookupResult.quantity}
                                            required
                                        />
                                    </div>

                                    <div className="stack-xs">
                                        <label className="label text-xs">Reason/Notes</label>
                                        <input 
                                            type="text"
                                            className="input-field"
                                            value={consumeNotes}
                                            onChange={(e) => setConsumeNotes(e.target.value)}
                                            placeholder="Purpose (e.g. damaged, production order)"
                                            required
                                        />
                                    </div>

                                    <div className="form-submit-row row gap-sm justify-end">
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowConsume(false)}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary btn-sm btn--danger" disabled={submittingAction}>
                                            {submittingAction ? <Loader2 size={14} className="animate-spin mr-8" /> : <Check size={14} className="mr-8" />}
                                            Confirm Consumption
                                        </button>
                                    </div>
                                </form>
                            )}
                            
                            {/* Option to clear/view in inventory */}
                            <div className="row space-between items-center mt-12 border-top pt-12">
                                <button className="btn btn-ghost btn-xs text-primary font-semibold" onClick={() => navigate('/dashboard/inventory', { state: { search: lookupResult.sku } })}>
                                    View in Inventory Sheet →
                                </button>
                                <button className="btn btn-ghost btn-xs text-muted" onClick={() => { setLookupResult(null); setIsCamActive(true); }}>
                                    Clear / Scan New
                                </button>
                            </div>

                        </div>
                    )}

                </div>

            </div>

            <CameraPermissionModal 
                isOpen={showPermissionModal} 
                onClose={() => setShowPermissionModal(false)} 
                onRetry={handleRetryPermission} 
            />
        </div>
    );
};

export default ScanItem;

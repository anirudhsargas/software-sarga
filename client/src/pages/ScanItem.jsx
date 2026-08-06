import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Camera, Search, Upload, Plus, Minus, Loader2,
    Tag, ShieldAlert, Package, Check, X, ArrowLeft, RefreshCw,
    ShoppingCart, Edit2, LayoutList, History, Scan, AlertCircle,
    ChevronRight, Zap, Users, Hash
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import SecureImage from '../components/SecureImage';
import CameraPermissionModal from '../components/CameraPermissionModal';
import PermissionDeniedState from '../components/PermissionDeniedState';
import toast from 'react-hot-toast';
import './ScanItem.css';
import PageContainer from '../components/ui/PageContainer';
// \u2500\u2500 Native camera scanner (replaces html5-qrcode) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// ── MRP Resolution (Priority: customSellingPrice → sellingPrice → mrp) ─────
const resolvePrice = (item) => {
    if (!item) return null;
    const candidates = [
        item.custom_selling_price,
        item.customSellingPrice,
        item.sell_price,
        item.selling_price,
        item.sellingPrice,
        item.mrp,
        item.MRP,
    ];
    for (const v of candidates) {
        const n = parseFloat(v);
        if (!isNaN(n) && n > 0) return n;
    }
    return null;
};

// ── Stock Status Logic ───────────────────────────────────────────────────────
const getStockStatus = (item) => {
    if (!item) return { status: 'unknown', label: 'Unknown', color: 'muted', emoji: '⚪' };
    const qty = Number(item.quantity ?? 0);
    const threshold = Number(item.reorder_level ?? item.reorder_threshold ?? 0);
    if (qty <= 0) return { status: 'out', label: 'Out of Stock', color: 'error', emoji: '🔴' };
    if (qty <= threshold) return { status: 'low', label: 'Low Stock', color: 'warning', emoji: '🟡' };
    return { status: 'in', label: 'In Stock', color: 'success', emoji: '🟢' };
};

// ── Format price display ─────────────────────────────────────────────────────
const formatPrice = (val) => {
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// ── Component ────────────────────────────────────────────────────────────────
const ScanItem = () => {
    const navigate = useNavigate();
    const userRole = auth.getUser()?.role;
    const isAdminOrAccountant = ['Admin', 'Accountant'].includes(userRole);
    const isFrontOffice = userRole === 'Front Office';

    // Scanner state
    const [activeTab, setActiveTab] = useState('camera');
    const [manualCode, setManualCode] = useState('');
    const [isCamActive, setIsCamActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [scanningFile, setScanningFile] = useState(false);
    const [cameras, setCameras] = useState([]);
    const [selectedCamId, setSelectedCamId] = useState('');
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [scanState, setScanState] = useState('idle'); // idle | scanning | found

    // Lookup state
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupResult, setLookupResult] = useState(null);
    const [lookupError, setLookupError] = useState('');

    // Scan history
    const [scanHistory, setScanHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    // Inline forms
    const [showRestock, setShowRestock] = useState(false);
    const [showConsume, setShowConsume] = useState(false);
    const [restockQty, setRestockQty] = useState('');
    const [restockCost, setRestockCost] = useState('');
    const [restockNotes, setRestockNotes] = useState('');
    const [consumeQty, setConsumeQty] = useState('');
    const [consumeNotes, setConsumeNotes] = useState('');
    const [submittingAction, setSubmittingAction] = useState(false);

    // Add to Bill modal state
    const [showAddToBill, setShowAddToBill] = useState(false);
    const [billCustomers, setBillCustomers] = useState([]);
    const [billCustomerSearch, setBillCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [billQty, setBillQty] = useState(1);
    const [billDiscount, setBillDiscount] = useState(0);
    const [billLoading, setBillLoading] = useState(false);
    const [customersLoading, setCustomersLoading] = useState(false);

    // Scanner refs
    const streamRef = useRef(null);   // Active MediaStream
    const videoRef = useRef(null);    // <video> element
    const rafRef = useRef(null);      // requestAnimationFrame handle
    const mountedRef = useRef(true);
    const fileInputRef = useRef(null);
    const manualInputRef = useRef(null);
    const camRetryRef = useRef(0);
    const scanLockRef = useRef(false);

    const normalizeCode = (val) => String(val || '').replace(/\s+/g, '').toUpperCase();

    // ── Permission check ───────────────────────────────────────────────────────
    const permitted = ['Admin', 'Front Office', 'Accountant'].includes(userRole);

    useEffect(() => {
        if (!permitted) {
            toast.error('Access Denied: Insufficient permissions.');
            navigate('/dashboard');
        }
    }, [permitted, navigate]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            stopStream();
        };
    }, []);

    // Focus manual input when tab switches
    useEffect(() => {
        if (activeTab === 'manual' && manualInputRef.current) {
            setTimeout(() => manualInputRef.current?.focus(), 100);
        }
    }, [activeTab]);

    // ── Camera helpers ─────────────────────────────────────────────────────────
    const startingRef = useRef(false);

    // Unified camera error handler with detailed messages
    const handleCameraError = useCallback((err, prefix) => {
        const name = err?.name || '';
        const msg = err?.message || '';
        console.error(`[Camera] ${prefix || ''} name="${name}" message="${msg}" stack=${err?.stack || 'none'}`);
        let userMsg;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || msg?.includes('Permission denied')) {
            userMsg = 'Camera permission was denied. Open your browser settings, find this site under Permissions, allow camera access, then reload.';
            setShowPermissionModal(true);
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            userMsg = 'No camera found on this device.';
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
            userMsg = 'Camera is busy. Close other apps using the camera and tap Retry.';
        } else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
            userMsg = 'Camera could not be configured with the selected settings.';
        } else if (name === 'AbortError') {
            userMsg = 'Camera access was aborted. Tap Retry to try again.';
        } else if (name === 'SecurityError' || msg?.includes('insecure')) {
            userMsg = 'Camera requires a secure (HTTPS) connection.';
        } else if (name === 'NotSupportedError') {
            userMsg = 'Camera access is not supported by this browser or in this context (HTTPS required).';
        } else {
            userMsg = `Unable to start camera (${name || 'UnknownError'}: ${msg || 'No details available'}). Try the Upload Image tab or Manual Entry.`;
        }
        setCameraError(userMsg);
    }, []);

    // Enumerate all video devices and find the rear camera
    const enumerateCameras = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoCams = devices.filter(d => d.kind === 'videoinput');
            console.log('[Camera] enumerateDevices found:', videoCams.length, 'cameras');
            videoCams.forEach((c, i) => console.log(`[Camera]  [${i}] label="${c.label}" deviceId="${c.deviceId.slice(0,16)}…"`));
            // Rear camera heuristic: label contains "back", "rear", or "environment"
            const rear = videoCams.find(d => {
                const lbl = d.label.toLowerCase();
                return lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment');
            }) || videoCams.find(d => d.label && !d.label.toLowerCase().includes('front'));
            return { rear, allCams: videoCams };
        } catch (err) {
            console.warn('[Camera] enumerateDevices failed:', err.name, err.message);
            return { rear: null, allCams: [] };
        }
    }, []);

    // Stop any held media tracks
    const stopStream = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) { videoRef.current.srcObject = null; }
    }, []);

    // Called synchronously from user gesture — requests camera + enumerates
    const requestCameraPermission = useCallback(async () => {
        if (startingRef.current) return false;
        startingRef.current = true;
        stopStream();
        setCameraError('');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const err = new Error('Camera API (getUserMedia) is not supported by this browser or connection. HTTPS is required.');
                err.name = 'NotSupportedError';
                throw err;
            }

            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
                });
            } catch (err1) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
                    });
                } catch (err2) {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                }
            }

            // Enumerate cameras now that permission is granted
            const { rear, allCams } = await enumerateCameras();
            if (rear) setSelectedCamId(rear.deviceId);
            else if (allCams.length > 0) setSelectedCamId(allCams[0].deviceId);
            setCameras(allCams);
            // Release the test stream; startCamera will open a fresh one
            stream.getTracks().forEach(t => t.stop());
            return true;
        } catch (err) {
            handleCameraError(err);
            return false;
        } finally {
            startingRef.current = false;
        }
    }, [enumerateCameras, stopStream, handleCameraError]);

    const safeStop = useCallback(() => {
        stopStream();
        scanLockRef.current = false;
    }, [stopStream]);


    // ── Lookup ─────────────────────────────────────────────────────────────────
    const handleLookup = useCallback(async (code) => {
        const normalized = normalizeCode(code);
        if (!normalized) return;

        setScanState('scanning');
        setLookupLoading(true);
        setLookupError('');
        try {
            const { data } = await api.get(`/inventory/by-sku/${encodeURIComponent(normalized)}`, { _noCache: true });
            setLookupResult(data);
            setRestockCost(data.cost_price || '');
            setShowRestock(false);
            setShowConsume(false);
            setScanState('found');
            // Add to scan history
            setScanHistory(prev => {
                const filtered = prev.filter(h => h.sku !== data.sku);
                return [{ ...data, scanned_at: new Date() }, ...filtered].slice(0, 10);
            });
            toast.success(`Found: ${data.name}`);
        } catch (err) {
            setLookupResult(null);
            setScanState('idle');
            setLookupError(err.response?.data?.message || `No item found for: ${code}`);
            toast.error(err.response?.data?.message || 'Item not found.');
        } finally {
            setLookupLoading(false);
            scanLockRef.current = false;
        }
    }, []);

    // ── Camera start (native getUserMedia + jsQR frame scan) ──────────────────
    const startCamera = useCallback(async () => {
        if (!mountedRef.current || activeTab !== 'camera' || !isCamActive) return;
        if (startingRef.current) return;
        startingRef.current = true;
        stopStream();
        setCameraError('');
        setScanState('scanning');

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const err = new Error('Camera API (getUserMedia) is not supported by this browser or connection. HTTPS is required.');
                err.name = 'NotSupportedError';
                throw err;
            }

            // Determine camera constraints
            const constraints = selectedCamId
                ? { video: { deviceId: { exact: selectedCamId } } }
                : { video: { facingMode: { ideal: 'environment' } } };

            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                } catch {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                }
            }

            if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
            video.srcObject = stream;
            await video.play().catch(() => {});

            // Load jsqr in parallel
            const jsQR = await import('jsqr').then(m => m.default);

            if (!mountedRef.current) { stopStream(); return; }

            // Frame scan loop
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            const scanFrame = () => {
                if (!mountedRef.current || !isCamActive) return;
                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                    if (code && !scanLockRef.current) {
                        const normalized = normalizeCode(code.data);
                        if (normalized) {
                            scanLockRef.current = true;
                            stopStream();
                            handleLookup(normalized);
                            setIsCamActive(false);
                            return;
                        }
                    }
                }
                rafRef.current = requestAnimationFrame(scanFrame);
            };
            rafRef.current = requestAnimationFrame(scanFrame);
            camRetryRef.current = 0;
        } catch (err) {
            if (!mountedRef.current) return;
            // Retry on NotReadableError (transient on Android)
            const isNotReadable = err?.name === 'NotReadableError' || err?.name === 'TrackStartError';
            if (isNotReadable && camRetryRef.current < 3) {
                camRetryRef.current += 1;
                await new Promise(r => setTimeout(r, 800 * camRetryRef.current));
                startingRef.current = false;
                return startCamera();
            }
            handleCameraError(err, 'startCamera');
            setIsCamActive(false);
            setScanState('idle');
            camRetryRef.current = 0;
        } finally {
            startingRef.current = false;
        }
    }, [activeTab, isCamActive, selectedCamId, stopStream, handleLookup, handleCameraError]);

    useEffect(() => {
        if (activeTab === 'camera' && isCamActive) startCamera();
        else stopStream();
    }, [activeTab, isCamActive, selectedCamId]);

    useEffect(() => {
        if (activeTab !== 'camera') { stopStream(); setScanState('idle'); }
    }, [activeTab]);

    // ── File scan ──────────────────────────────────────────────────────────────
    const scanFileWithJsQR = (file) => new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = async () => {
            URL.revokeObjectURL(url);
            try {
                const jsQRModule = await import('jsqr');
                const jsQR = jsQRModule.default;
                for (const scale of [1, 2, 3]) {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                    if (code) { resolve(code.data); return; }
                }
                resolve(null);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = reject;
        img.src = url;
    });

    const tryBarcodeDetector = async (file) => {
        if (!('BarcodeDetector' in window)) return null;
        try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e'] });
            const bitmap = await createImageBitmap(file);
            const codes = await detector.detect(bitmap);
            return codes.length > 0 ? codes[0].rawValue : null;
        } catch { return null; }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast.error('Select a valid image.'); return; }
        setScanningFile(true);
        setCameraError('');
        try {
            let result = await scanFileWithJsQR(file).catch(() => null);
            if (!result) result = await tryBarcodeDetector(file).catch(() => null);
            if (result) {
                const normalized = normalizeCode(result);
                if (normalized) handleLookup(normalized);
                else setCameraError('Decoded code was empty. Try a clearer image.');
            } else {
                setCameraError('No QR / barcode found. Ensure code is well-lit and in frame.');
            }
        } catch {
            setCameraError('Error reading image. Try again with a clearer photo.');
        } finally {
            setScanningFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        const code = manualCode.trim();
        if (!code) { toast.error('Enter a SKU or barcode.'); return; }
        handleLookup(code);
    };

    // ── Restock ────────────────────────────────────────────────────────────────
    const handleRestockSubmit = async (e) => {
        e.preventDefault();
        if (!lookupResult || !restockQty || Number(restockQty) <= 0) {
            toast.error('Enter a valid quantity.');
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
            await handleLookup(lookupResult.scanned_code || lookupResult.sku);
            setRestockQty(''); setRestockNotes(''); setShowRestock(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Restock failed.');
        } finally {
            setSubmittingAction(false);
        }
    };

    // ── Consume ────────────────────────────────────────────────────────────────
    const handleConsumeSubmit = async (e) => {
        e.preventDefault();
        if (!lookupResult || !consumeQty || Number(consumeQty) <= 0) {
            toast.error('Enter a valid quantity.');
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
            toast.success('Stock consumed!');
            await handleLookup(lookupResult.scanned_code || lookupResult.sku);
            setConsumeQty(''); setConsumeNotes(''); setShowConsume(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Consume failed.');
        } finally {
            setSubmittingAction(false);
        }
    };

    // ── Add to Bill ───────────────────────────────────────────────────────────
    const openAddToBill = async () => {
        setShowAddToBill(true);
        setBillQty(1);
        setBillDiscount(0);
        setSelectedCustomer(null);
        setBillCustomerSearch('');
        setCustomersLoading(true);
        try {
            const { data } = await api.get('/customers', { params: { limit: 50 } });
            const list = Array.isArray(data) ? data : (data?.data || []);
            setBillCustomers(list);
        } catch {
            toast.error('Failed to load customers.');
        } finally {
            setCustomersLoading(false);
        }
    };

    const handleAddToBillSubmit = async (e) => {
        e.preventDefault();
        if (!lookupResult) return;
        if (!selectedCustomer) { toast.error('Select a customer.'); return; }
        if (!billQty || Number(billQty) <= 0) { toast.error('Enter valid quantity.'); return; }

        const qty = Number(lookupResult.quantity);
        if (Number(billQty) > qty) {
            toast.error(`Insufficient stock. Available: ${qty}`);
            return;
        }

        setBillLoading(true);
        try {
            const price = resolvePrice(lookupResult) || 0;
            // Navigate to billing with pre-filled cart data via state
            navigate('/dashboard/billing', {
                state: {
                    prefillItem: {
                        inventoryItemId: lookupResult.id,
                        name: lookupResult.name,
                        sku: lookupResult.sku,
                        qty: Number(billQty),
                        unitPrice: price,
                        discount: Number(billDiscount) || 0,
                    },
                    prefillCustomer: selectedCustomer
                }
            });
            toast.success('Opening billing with item pre-filled…');
        } catch {
            toast.error('Failed to prepare bill.');
        } finally {
            setBillLoading(false);
            setShowAddToBill(false);
        }
    };

    const filteredCustomers = billCustomers.filter(c => {
        const q = billCustomerSearch.toLowerCase();
        return !q || (c.name || '').toLowerCase().includes(q) || (c.mobile || '').includes(q);
    });

    // ── Derived values ─────────────────────────────────────────────────────────
    const stockStatus = getStockStatus(lookupResult);
    const resolvedPrice = resolvePrice(lookupResult);
    const displayPrice = resolvedPrice !== null ? `₹${formatPrice(resolvedPrice)}` : 'Price not configured';
    const hasPriceIssue = resolvedPrice === null;

    const handleRetryPermission = async () => {
        setShowPermissionModal(false);
        setCameraError('');
        camRetryRef.current = 0;
        stopHeldStream();
        const ok = await requestCameraPermission();
        if (ok) { setIsCamActive(true); setLookupResult(null); }
    };

    const clearResult = () => {
        setLookupResult(null);
        setLookupError('');
        setScanState('idle');
        setShowRestock(false);
        setShowConsume(false);
        if (activeTab === 'camera') {
            camRetryRef.current = 0;
            stopHeldStream();
            setIsCamActive(true);
        }
        if (activeTab === 'manual') { setManualCode(''); manualInputRef.current?.focus(); }
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    if (!permitted) {
        return (
            <PageContainer title="Scan Item">
                <PermissionDeniedState
                    icon={ShieldAlert}
                    title="Access Denied"
                    message="You do not have permission to access the inventory scanner."
                    suggestion="This feature is available to Admin, Accountant, and Front Office roles only."
                    action={{ label: 'Go to Dashboard', onClick: () => navigate('/dashboard') }}
                />
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            {/* ── Page Header ─────────────────────────────────────────────────── */}
            <div className="si-header">
                <div className="si-header__left">
                    <button
                        className="si-back-btn"
                        onClick={() => navigate(-1)}
                        title="Go Back"
                        aria-label="Go back"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="si-title">Inventory Scan</h1>
                        <p className="si-subtitle">Lookup · Restock · Consume · Add to Bill</p>
                    </div>
                </div>
                <div className="si-header__right">
                    {scanHistory.length > 0 && (
                        <button
                            className={`si-history-btn ${showHistory ? 'si-history-btn--active' : ''}`}
                            onClick={() => setShowHistory(v => !v)}
                        >
                            <History size={16} />
                            <span>History ({scanHistory.length})</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Scan History Drawer ──────────────────────────────────────────── */}
            {showHistory && scanHistory.length > 0 && (
                <div className="si-history-bar">
                    {scanHistory.map((item, i) => (
                        <button
                            key={i}
                            className="si-history-chip"
                            onClick={() => { handleLookup(item.sku); setShowHistory(false); }}
                        >
                            <span className="si-history-chip__sku">{item.sku}</span>
                            <span className="si-history-chip__name">{item.name}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Main 2-Column Layout ─────────────────────────────────────────── */}
            <div className="si-grid">
                {/* ── LEFT: Scanner Panel ──────────────────────────────────────── */}
                <div className="si-scanner-panel">
                    {/* Tab selector */}
                    <div className="si-tabs">
                        {[
                            { id: 'camera', label: 'Live Camera', icon: Camera },
                            { id: 'file', label: 'Upload Image', icon: Upload },
                            { id: 'manual', label: 'Manual Entry', icon: Search },
                        ].map(({ id, label, icon: _Icon }) => (
                            <button
                                key={id}
                                className={`si-tab ${activeTab === id ? 'si-tab--active' : ''}`}
                                onClick={() => { setActiveTab(id); setCameraError(''); }}
                                aria-selected={activeTab === id}
                            >
                                <_Icon size={15} />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Tab Body */}
                    <div className="si-tab-body">

                        {/* Camera Tab */}
                        {activeTab === 'camera' && (
                            <div className="si-camera-tab">
                                {cameras.length > 1 && (
                                    <div className="si-cam-select-row">
                                        <Camera size={14} className="si-cam-select-icon" />
                                        <select
                                            value={selectedCamId}
                                            onChange={e => setSelectedCamId(e.target.value)}
                                            className="si-cam-select"
                                            aria-label="Select camera"
                                        >
                                            {cameras.map((c, i) => (
                                                <option key={c.id} value={c.id}>{c.label || `Camera ${i + 1}`}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className={`si-viewport ${!isCamActive ? 'si-viewport--off' : ''}`}>
                                    <video
                                        ref={videoRef}
                                        playsInline
                                        muted
                                        className="si-video-container"
                                        style={{ display: 'block', width: '100%' }}
                                    />

                                    {/* Scan overlay when active */}
                                    {isCamActive && (
                                        <div className="si-viewport-overlay" aria-hidden="true">
                                            <div className="si-scan-frame">
                                                <div className="si-scan-corner si-scan-corner--tl" />
                                                <div className="si-scan-corner si-scan-corner--tr" />
                                                <div className="si-scan-corner si-scan-corner--bl" />
                                                <div className="si-scan-corner si-scan-corner--br" />
                                                <div className="si-scan-line" />
                                            </div>
                                            <p className="si-scan-hint">Point camera at barcode or QR code</p>
                                        </div>
                                    )}

                                    {/* Camera off state */}
                                    {!isCamActive && (
                                        <div className="si-camera-off">
                                            <div className="si-camera-off__inner">
                                                <div className="si-camera-off__icon">
                                                    <Camera size={28} />
                                                </div>
                                                <p className="si-camera-off__title">
                                                    {cameraError ? 'Camera unavailable' : 'Camera off'}
                                                </p>
                                                <p className="si-camera-off__hint">
                                                    {cameraError || 'Start camera to begin scanning'}
                                                </p>
                                                <button
                                                    className="btn btn-primary btn-sm si-start-cam-btn"
                                                    onClick={() => {
                                                        setCameraError('');
                                                        stopHeldStream();
                                                        requestCameraPermission().then(ok => {
                                                            if (ok) {
                                                                setIsCamActive(true);
                                                                setLookupResult(null);
                                                                setScanState('idle');
                                                            }
                                                        });
                                                    }}
                                                >
                                                    <Camera size={14} />
                                                    Start Camera
                                                </button>
                                                {cameraError && (
                                                    <button
                                                        className="btn btn-ghost btn-sm si-retry-cam-btn"
                                                        onClick={() => {
                                                            setCameraError('');
                                                            setScanState('idle');
                                                            camRetryRef.current = 0;
                                                            stopHeldStream();
                                                            requestCameraPermission().then(ok => {
                                                                if (ok) {
                                                                    setIsCamActive(true);
                                                                    setLookupResult(null);
                                                                }
                                                            });
                                                        }}
                                                        style={{ marginTop: 8 }}
                                                    >
                                                        <RefreshCw size={13} />
                                                        Retry Camera
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Status badge */}
                                    {isCamActive && (
                                        <div className={`si-status-badge si-status-badge--${scanState}`}>
                                            {scanState === 'scanning' && <><Loader2 size={12} className="animate-spin" /> Scanning…</>}
                                            {scanState === 'found' && <><Check size={12} /> Product Found</>}
                                            {scanState === 'idle' && <><Scan size={12} /> Ready to Scan</>}
                                        </div>
                                    )}
                                </div>

                                {isCamActive && lookupResult && (
                                    <button
                                        className="si-scan-again-btn"
                                        onClick={clearResult}
                                    >
                                        <RefreshCw size={14} />
                                        Scan Another Item
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Upload Tab */}
                        {activeTab === 'file' && (
                            <div className="si-file-tab">
                                <div
                                    className={`si-dropzone ${scanningFile ? 'si-dropzone--loading' : ''}`}
                                    onClick={() => !scanningFile && fileInputRef.current?.click()}
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Upload barcode or QR image"
                                    onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                                >
                                    {scanningFile ? (
                                        <>
                                            <Loader2 size={36} className="animate-spin si-dropzone__spinner" />
                                            <p className="si-dropzone__text">Processing image…</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="si-dropzone__icon">
                                                <Upload size={28} />
                                            </div>
                                            <p className="si-dropzone__text">Click to upload barcode / QR photo</p>
                                            <p className="si-dropzone__hint">PNG, JPG, WEBP accepted</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                    disabled={scanningFile}
                                    aria-hidden="true"
                                />
                            </div>
                        )}

                        {/* Manual Tab */}
                        {activeTab === 'manual' && (
                            <form onSubmit={handleManualSubmit} className="si-manual-tab">
                                <label htmlFor="si-manual-input" className="si-manual-label">
                                    <Hash size={13} /> SKU / Item Code / Barcode
                                </label>
                                <div className="si-manual-row">
                                    <input
                                        id="si-manual-input"
                                        ref={manualInputRef}
                                        type="text"
                                        placeholder="Type or paste SKU / barcode…"
                                        value={manualCode}
                                        onChange={e => setManualCode(e.target.value)}
                                        className="input-field si-manual-input"
                                        autoComplete="off"
                                        spellCheck={false}
                                        required
                                    />
                                    <button
                                        type="submit"
                                        className="btn btn-primary si-manual-submit"
                                        disabled={lookupLoading}
                                        aria-label="Search item"
                                    >
                                        {lookupLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Error bar */}
                        {cameraError && (
                            <div className="si-error-bar" role="alert">
                                <AlertCircle size={16} />
                                <span>{cameraError}</span>
                            </div>
                        )}
                    </div>

                    {/* Scan tip */}
                    <div className="si-tip">
                        <Zap size={12} />
                        <span>Hardware scanners auto-detected — just scan anytime</span>
                    </div>
                </div>

                {/* ── RIGHT: Product Preview Panel ─────────────────────────────── */}
                <div className="si-result-panel">

                    {/* Loading skeleton */}
                    {lookupLoading && (
                        <div className="si-result-card si-result-card--loading">
                            <div className="si-skeleton si-skeleton--img" />
                            <div className="si-skeleton si-skeleton--title" />
                            <div className="si-skeleton si-skeleton--text" />
                            <div className="si-skeleton si-skeleton--text si-skeleton--text-short" />
                            <div className="si-skeleton si-skeleton--chip" />
                        </div>
                    )}

                    {/* Error state */}
                    {!lookupLoading && lookupError && (
                        <div className="si-result-card si-empty-state">
                            <div className="si-empty-state__icon si-empty-state__icon--error">
                                <ShieldAlert size={32} />
                            </div>
                            <h3 className="si-empty-state__title">Item Not Found</h3>
                            <p className="si-empty-state__text">{lookupError}</p>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => { setLookupError(''); setManualCode(''); setActiveTab('manual'); }}
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {/* Empty (ready) state */}
                    {!lookupLoading && !lookupError && !lookupResult && (
                        <div className="si-result-card si-empty-state">
                            <div className="si-empty-state__icon">
                                <Package size={32} />
                            </div>
                            <h3 className="si-empty-state__title">Ready to Scan</h3>
                            <p className="si-empty-state__text">
                                Product details appear here after scanning or searching.
                            </p>
                            <div className="si-empty-hints">
                                <span><Camera size={12} /> Point at barcode</span>
                                <span><Upload size={12} /> Upload image</span>
                                <span><Search size={12} /> Type SKU</span>
                            </div>
                        </div>
                    )}

                    {/* Product Found Card */}
                    {!lookupLoading && !lookupError && lookupResult && (
                        <div className={`si-result-card si-result-card--found ${scanState === 'found' ? 'si-result-card--animate' : ''}`}>

                            {/* Product Image + Identity */}
                            <div className="si-product-header">
                                <div className="si-product-image-wrap">
                                    {lookupResult.product_image_url || lookupResult.image_url ? (
                                        <SecureImage
                                            src={lookupResult.product_image_url || lookupResult.image_url}
                                            alt={lookupResult.name}
                                            className="si-product-image"
                                        />
                                    ) : (
                                        <div className="si-product-image si-product-image--placeholder">
                                            <Package size={24} />
                                        </div>
                                    )}
                                </div>
                                <div className="si-product-identity">
                                    <div className="si-sku-chip">
                                        <Tag size={11} />
                                        {lookupResult.sku}
                                    </div>
                                    <h2 className="si-product-name">{lookupResult.name}</h2>
                                    {lookupResult.category && (
                                        <span className="si-product-category">{lookupResult.category}</span>
                                    )}
                                </div>
                            </div>

                            {/* Price Row */}
                            <div className="si-price-row">
                                <div className="si-price-block">
                                    <span className="si-price-label">MRP</span>
                                    <span className={`si-price-value ${hasPriceIssue ? 'si-price-value--unconfigured' : ''}`}>
                                        {hasPriceIssue ? (
                                            <>
                                                <AlertCircle size={13} />
                                                Price not configured
                                            </>
                                        ) : displayPrice}
                                    </span>
                                </div>

                                {lookupResult.sell_price && lookupResult.sell_price !== lookupResult.mrp && (
                                    <div className="si-price-block">
                                        <span className="si-price-label">Selling Price</span>
                                        <span className="si-price-value si-price-value--selling">
                                            ₹{formatPrice(lookupResult.sell_price)}
                                        </span>
                                    </div>
                                )}

                                {isAdminOrAccountant && lookupResult.cost_price > 0 && (
                                    <div className="si-price-block">
                                        <span className="si-price-label si-price-label--admin">
                                            Cost Price <span className="si-admin-badge">Admin</span>
                                        </span>
                                        <span className="si-price-value si-price-value--cost">
                                            ₹{formatPrice(lookupResult.cost_price)}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Stock Status */}
                            <div className="si-stock-section">
                                <div className={`si-stock-badge si-stock-badge--${stockStatus.status}`}>
                                    <span className="si-stock-dot" />
                                    <span className="si-stock-label">{stockStatus.label}</span>
                                    <span className="si-stock-qty">
                                        {Number(lookupResult.quantity)} {lookupResult.unit || 'pcs'}
                                    </span>
                                </div>

                                {(lookupResult.reorder_level !== undefined && lookupResult.reorder_level !== null) && (
                                    <div className="si-reorder-info">
                                        <span>Reorder at:</span>
                                        <strong>{lookupResult.reorder_level} {lookupResult.unit || 'pcs'}</strong>
                                    </div>
                                )}

                                {lookupResult.branch_stocks && lookupResult.branch_stocks.length > 0 && (
                                    <div className="si-branch-stocks">
                                        <div className="si-branch-stocks-title">Stock by Branch</div>
                                        {lookupResult.branch_stocks.map(bs => (
                                            <div key={bs.branch_id} className="si-branch-stock-row">
                                                <span className="si-branch-stock-name">{bs.branch_name}</span>
                                                <span className={`si-branch-stock-qty ${Number(bs.quantity) <= 0 ? 'si-branch-stock-qty--empty' : ''}`}>
                                                    {Number(bs.quantity).toLocaleString()} {lookupResult.unit || 'pcs'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Extra Metadata */}
                            {lookupResult.hsn && (
                                <div className="si-meta-row">
                                    <span className="si-meta-label">HSN</span>
                                    <span className="si-meta-value">{lookupResult.hsn}</span>
                                </div>
                            )}
                            {lookupResult.vendor_name && (
                                <div className="si-meta-row">
                                    <span className="si-meta-label">Vendor</span>
                                    <span className="si-meta-value">{lookupResult.vendor_name}</span>
                                </div>
                            )}

                            {/* ── Action Buttons ─────────────────────────────────── */}
                            <div className="si-actions">
                                {/* Add to Bill — Primary CTA */}
                                {(isAdminOrAccountant || isFrontOffice) && (
                                    <button
                                        className="btn btn-primary si-action-primary"
                                        onClick={openAddToBill}
                                        disabled={Number(lookupResult.quantity) <= 0}
                                    >
                                        <ShoppingCart size={16} />
                                        Add to Bill
                                    </button>
                                )}

                                {/* Secondary actions */}
                                <div className="si-action-row">
                                    {isAdminOrAccountant && (
                                        <button
                                            className={`btn si-action-btn ${showRestock ? 'si-action-btn--active' : 'btn-ghost'}`}
                                            onClick={() => { setShowRestock(v => !v); setShowConsume(false); }}
                                        >
                                            <Plus size={15} />
                                            Restock
                                        </button>
                                    )}
                                    <button
                                        className={`btn si-action-btn ${showConsume ? 'si-action-btn--active si-action-btn--danger' : 'btn-ghost'}`}
                                        onClick={() => { setShowConsume(v => !v); setShowRestock(false); }}
                                    >
                                        <Minus size={15} />
                                        Consume
                                    </button>
                                    <button
                                        className="btn btn-ghost si-action-btn"
                                        onClick={() => navigate('/dashboard/inventory', { state: { search: lookupResult.sku } })}
                                    >
                                        <LayoutList size={15} />
                                        Inventory
                                    </button>
                                    {isAdminOrAccountant && (
                                        <button
                                            className="btn btn-ghost si-action-btn"
                                            onClick={() => navigate('/dashboard/inventory', { state: { edit: lookupResult.id } })}
                                        >
                                            <Edit2 size={15} />
                                            Edit
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ── Restock Form ──────────────────────────────────── */}
                            {showRestock && isAdminOrAccountant && (
                                <form onSubmit={handleRestockSubmit} className="si-action-form">
                                    <div className="si-action-form__header">
                                        <Plus size={14} />
                                        <span>Restock Transaction</span>
                                    </div>
                                    <div className="si-form-grid">
                                        <div className="si-form-field">
                                            <label className="si-form-label">Quantity Received</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={restockQty}
                                                onChange={e => setRestockQty(e.target.value)}
                                                placeholder="e.g. 50"
                                                min="1"
                                                required
                                            />
                                        </div>
                                        <div className="si-form-field">
                                            <label className="si-form-label">Cost Price / Unit (₹)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="input-field"
                                                value={restockCost}
                                                onChange={e => setRestockCost(e.target.value)}
                                                placeholder={lookupResult.cost_price || '0.00'}
                                            />
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={restockNotes}
                                        onChange={e => setRestockNotes(e.target.value)}
                                        placeholder="Optional notes…"
                                    />
                                    <div className="si-form-actions">
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRestock(false)}>Cancel</button>
                                        <button type="submit" className="btn btn-primary btn-sm" disabled={submittingAction}>
                                            {submittingAction ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                            Complete Restock
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* ── Consume Form ──────────────────────────────────── */}
                            {showConsume && (
                                <form onSubmit={handleConsumeSubmit} className="si-action-form si-action-form--danger">
                                    <div className="si-action-form__header si-action-form__header--danger">
                                        <Minus size={14} />
                                        <span>Consume Stock</span>
                                    </div>
                                    <div className="si-form-field">
                                        <label className="si-form-label">Quantity to Consume</label>
                                        <input
                                            type="number"
                                            className="input-field"
                                            value={consumeQty}
                                            onChange={e => setConsumeQty(e.target.value)}
                                            placeholder={`Max: ${lookupResult.quantity}`}
                                            min="1"
                                            max={lookupResult.quantity}
                                            required
                                        />
                                    </div>
                                    <div className="si-form-field">
                                        <label className="si-form-label">Reason / Notes</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            value={consumeNotes}
                                            onChange={e => setConsumeNotes(e.target.value)}
                                            placeholder="e.g. damaged, production use…"
                                            required
                                        />
                                    </div>
                                    <div className="si-form-actions">
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowConsume(false)}>Cancel</button>
                                        <button type="submit" className="btn btn-sm si-btn-danger" disabled={submittingAction}>
                                            {submittingAction ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                            Confirm
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Clear / scan new */}
                            <button className="si-clear-btn" onClick={clearResult}>
                                <RefreshCw size={13} /> Scan New Item
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Add to Bill Modal ─────────────────────────────────────────────── */}
            {showAddToBill && lookupResult && (
                <div
                    className="modal-backdrop si-bill-backdrop"
                    onClick={e => { if (e.target === e.currentTarget) setShowAddToBill(false); }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Add to Bill"
                >
                    <div className="si-bill-modal">
                        <div className="si-bill-modal__header">
                            <div className="si-bill-modal__title">
                                <ShoppingCart size={18} />
                                Add to Bill
                            </div>
                            <button
                                className="si-bill-modal__close"
                                onClick={() => setShowAddToBill(false)}
                                aria-label="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Item Preview */}
                        <div className="si-bill-item-preview">
                            <div className="si-bill-item-name">{lookupResult.name}</div>
                            <div className="si-bill-item-meta">
                                <span>SKU: {lookupResult.sku}</span>
                                <span>Stock: {lookupResult.quantity} {lookupResult.unit || 'pcs'}</span>
                                {resolvedPrice && <span>MRP: ₹{formatPrice(resolvedPrice)}</span>}
                            </div>
                        </div>

                        <form onSubmit={handleAddToBillSubmit} className="si-bill-form">
                            {/* Customer Search */}
                            <div className="si-form-field">
                                <label className="si-form-label">
                                    <Users size={12} /> Select Customer
                                </label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Search customer by name or phone…"
                                    value={billCustomerSearch}
                                    onChange={e => { setBillCustomerSearch(e.target.value); setSelectedCustomer(null); }}
                                    autoComplete="off"
                                />
                                {customersLoading && (
                                    <div className="si-bill-cust-loading">
                                        <Loader2 size={14} className="animate-spin" /> Loading customers…
                                    </div>
                                )}
                                {!customersLoading && filteredCustomers.length > 0 && !selectedCustomer && (
                                    <div className="si-bill-cust-list">
                                        {filteredCustomers.slice(0, 8).map(c => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="si-bill-cust-item"
                                                onClick={() => { setSelectedCustomer(c); setBillCustomerSearch(c.name || ''); }}
                                            >
                                                <span className="si-bill-cust-name">{c.name || 'Unknown'}</span>
                                                {c.mobile && <span className="si-bill-cust-phone">{c.mobile}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {selectedCustomer && (
                                    <div className="si-bill-cust-selected">
                                        <Check size={13} />
                                        <span>{selectedCustomer.name}</span>
                                        <button
                                            type="button"
                                            className="si-bill-cust-clear"
                                            onClick={() => { setSelectedCustomer(null); setBillCustomerSearch(''); }}
                                            aria-label="Remove customer"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Quantity & Discount */}
                            <div className="si-form-grid">
                                <div className="si-form-field">
                                    <label className="si-form-label">Quantity</label>
                                    <div className="si-qty-ctrl">
                                        <button
                                            type="button"
                                            className="si-qty-btn"
                                            onClick={() => setBillQty(q => Math.max(1, Number(q) - 1))}
                                            aria-label="Decrease quantity"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input
                                            type="number"
                                            className="si-qty-input"
                                            value={billQty}
                                            onChange={e => setBillQty(Math.max(1, Number(e.target.value)))}
                                            min="1"
                                            max={lookupResult.quantity}
                                            required
                                            aria-label="Quantity"
                                        />
                                        <button
                                            type="button"
                                            className="si-qty-btn"
                                            onClick={() => setBillQty(q => Math.min(Number(lookupResult.quantity), Number(q) + 1))}
                                            aria-label="Increase quantity"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="si-form-field">
                                    <label className="si-form-label">Discount (%)</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={billDiscount}
                                        onChange={e => setBillDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            {/* Bill total preview */}
                            {resolvedPrice && (
                                <div className="si-bill-total">
                                    <span>Estimated Total</span>
                                    <strong>
                                        ₹{formatPrice(
                                            resolvedPrice * Number(billQty) * (1 - Number(billDiscount) / 100)
                                        )}
                                    </strong>
                                </div>
                            )}

                            <div className="si-form-actions">
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setShowAddToBill(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={billLoading || !selectedCustomer}
                                >
                                    {billLoading ? <Loader2 size={15} className="animate-spin" /> : <ShoppingCart size={15} />}
                                    Open in Billing
                                    <ChevronRight size={15} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <CameraPermissionModal
                isOpen={showPermissionModal}
                onClose={() => setShowPermissionModal(false)}
                onRetry={handleRetryPermission}
            />
        </PageContainer>
    );
};

export default ScanItem;

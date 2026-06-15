import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera, Upload } from 'lucide-react';
import CameraPermissionModal from './CameraPermissionModal';

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

const ScannerModal = ({ isOpen, onClose, onScan }) => {
    const scannerRef = useRef(null);
    const isStartedRef = useRef(false);
    const isStoppingRef = useRef(false);
    const mountedRef = useRef(false);
    const fileInputRef = useRef(null);
    const camDivId = useRef(`qr-cam-${Math.random().toString(36).slice(2)}`);
    const prevIsOpenRef = useRef(isOpen);

    const [mode, setMode] = useState('file');
    const [cameraError, setCameraError] = useState('');
    const [scanning, setScanning] = useState(false);
    const [permissionRequested, setPermissionRequested] = useState(false);
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const normalizeScannedCode = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

    useEffect(() => {
        if (isOpen) {
            setMode('file');
            setCameraError('');
        }
    }, [isOpen]);

    const loadHtml5Qrcode = useCallback(async () => {
        return getHtml5QrcodeModule();
    }, []);

    const safeStop = useCallback(async () => {
        const qr = scannerRef.current;
        if (!qr || !isStartedRef.current || isStoppingRef.current) return;
        isStoppingRef.current = true;
        try {
            await qr.stop();
        } catch {
            // ignore
        } finally {
            isStartedRef.current = false;
            isStoppingRef.current = false;
            scannerRef.current = null;
        }
    }, []);

    // Start live camera
    useEffect(() => {
        if (!isOpen || mode !== 'camera') return;
        mountedRef.current = true;
        setCameraError('');

        let qr = null;
        let cancelled = false;

        const startCamera = async () => {
            const mod = await loadHtml5Qrcode();
            if (!mod || cancelled || !mountedRef.current) return;
            const { Html5Qrcode } = mod;

            qr = new Html5Qrcode(camDivId.current, { verbose: false });
            scannerRef.current = qr;
            isStartedRef.current = false;
            isStoppingRef.current = false;

            const config = { fps: 12, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 };

            const tryStart = (constraints) =>
                qr.start(constraints, config,
                    (text) => {
                        safeStop().then(() => {
                            const normalized = normalizeScannedCode(text);
                            if (normalized) { onScan(normalized); onClose(); }
                        });
                    },
                    () => { /* per-frame not-found — silenced */ }
                );

            tryStart({ facingMode: 'environment' })
                .catch(() => tryStart({ facingMode: 'user' }))
                .then(() => { isStartedRef.current = true; })
                .catch((err) => {
                    console.warn('QR camera error:', err);
                    if (!mountedRef.current) return;
                    const isPermissionDenied = err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied');
                    setCameraError(isPermissionDenied
                        ? 'Camera permission denied. Please allow camera access in your browser settings, then try again.'
                        : 'Camera unavailable. Use "Upload Photo" instead.');
                    if (isPermissionDenied) {
                        setShowPermissionModal(true);
                    }
                    isStartedRef.current = false;
                    scannerRef.current = null;
                });
        };

        startCamera();

        return () => {
            cancelled = true;
            if (qr) {
                qr.stop().catch(() => {});
            }
        };
    }, [isOpen, mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup when modal closes
    useEffect(() => {
        if (!isOpen) {
            mountedRef.current = false;
            safeStop();
            setCameraError('');
            return;
        }
        mountedRef.current = true;
        setCameraError('');
    }, [isOpen, safeStop]);

    useEffect(() => {
        getHtml5QrcodeModule();
        if ('permissions' in navigator) {
            navigator.permissions.query({ name: 'camera' }).then((status) => {
                if (status.state === 'denied') {
                    setCameraError('Camera access is blocked. Please allow camera access in your browser settings.');
                }
            }).catch(() => {});
        }
    }, []);

    const switchToFile = async () => {
        await safeStop();
        setCameraError('');
        setMode('file');
    };

    const switchToCamera = async () => {
        setCameraError('');
        if (permissionRequested) { setMode('camera'); return; }
        try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
            tempStream.getTracks().forEach(track => track.stop());
            setPermissionRequested(true);
            setMode('camera');
        } catch (err) {
            if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
                setCameraError('Camera permission denied. Please allow camera access in your browser settings, then try again.');
                setShowPermissionModal(true);
            } else {
                setCameraError('Unable to access camera. Please check your camera device or switch to file upload.');
            }
        }
    };

    const handleRetryPermission = async () => {
        setShowPermissionModal(false);
        setCameraError('');
        try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
            tempStream.getTracks().forEach(track => track.stop());
            setPermissionRequested(true);
            setMode('camera');
        } catch (err) {
            if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
                setCameraError('Camera permission denied. Please allow camera access in your browser settings, then try again.');
                setShowPermissionModal(true);
            } else {
                setCameraError('Unable to access camera. Please check your camera device or switch to file upload.');
            }
        }
    };

    // Draw image to canvas and scan with jsQR
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

    // Native BarcodeDetector
    const tryBarcodeDetector = async (file) => {
        if (!('BarcodeDetector' in window)) return null;
        try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e'] });
            const bitmap = await createImageBitmap(file);
            const codes = await detector.detect(bitmap);
            return codes.length > 0 ? codes[0].rawValue : null;
        } catch { return null; }
    };

    // html5-qrcode fallback
    const tryHtml5Qrcode = async (file) => {
        const mod = await loadHtml5Qrcode();
        if (!mod) return null;
        const tmpId = `qr-tmp-${Date.now()}`;
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

    // Scan from uploaded photo
    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setCameraError('Please select an image file.');
            return;
        }
        setScanning(true);
        setCameraError('');

        try {
            let result = await scanFileWithJsQR(file).catch(() => null);
            if (!result) result = await tryBarcodeDetector(file).catch(() => null);
            if (!result) result = await tryHtml5Qrcode(file).catch(() => null);

            if (result) {
                const normalized = normalizeScannedCode(result);
                if (!normalized) {
                    setCameraError('Scanned code was empty. Please try again.');
                    return;
                }
                onScan(normalized);
                onClose();
            } else {
                setCameraError('No QR or barcode detected. Make sure the code is clearly visible, well-lit, and fills most of the frame.');
            }
        } catch (error) {
            console.error('QR scan error:', error);
            setCameraError('Could not read the image. Please try again with a clearer photo.');
        } finally {
            setScanning(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 1000 }}>
            <div className="modal animate-scale-in" style={{ maxWidth: '460px', width: '92%', position: 'relative' }}>
                <div className="row gap-sm items-center mb-24">
                    <Camera size={18} />
                    <h2 className="section-title" style={{ margin: 0 }}>Scan QR / Barcode</h2>
                </div>

                <button
                    className="icon-button"
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '20px', right: '20px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        zIndex: 10
                    }}
                >
                    <X size={20} />
                </button>

                <div className="row gap-sm mb-16">
                    <button
                        className={`btn btn-sm ${mode === 'file' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => {
                            switchToFile();
                            setTimeout(() => {
                                if (fileInputRef.current) fileInputRef.current.click();
                            }, 150);
                        }}
                        style={{ flex: 1 }}
                        disabled={scanning}
                    >
                        <Upload size={14} style={{ marginRight: 5 }} /> Upload Photo
                    </button>
                    <button
                        className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={switchToCamera}
                        style={{ flex: 1 }}
                    >
                        <Camera size={14} style={{ marginRight: 5 }} /> Live Camera
                    </button>
                </div>

                {mode === 'file' && (
                    <div style={{ padding: '24px 0', textAlign: 'center' }}>
                        <p className="muted mb-16" style={{ fontSize: '13px' }}>
                            Click <strong>Upload Photo</strong> to select an image with a QR code or barcode.
                        </p>
                        {scanning && (
                            <div style={{
                                padding: '12px 24px', borderRadius: '8px',
                                background: 'var(--muted)', color: 'var(--text-muted)',
                                fontWeight: 600, fontSize: '15px'
                            }}>
                                Reading QR code from image...
                            </div>
                        )}
                    </div>
                )}

                {mode === 'camera' && (
                    <div
                        id={camDivId.current}
                        style={{ width: '100%', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-2)', minHeight: '240px' }}
                    />
                )}

                {cameraError && (
                    <div style={{
                        marginTop: '10px', padding: '10px 14px',
                        background: 'var(--warning-bg)', borderRadius: '8px',
                        color: '#856404', fontSize: '13px'
                    }}>
                        {cameraError}
                    </div>
                )}

                <p className="muted text-center mt-12" style={{ fontSize: '12px' }}>
                    {mode === 'file'
                        ? 'Tip: on mobile, your camera will open automatically to take a photo.'
                        : 'Hold the QR code steady — it will be detected automatically.'}
                </p>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                    disabled={scanning}
                />
            </div>

            <CameraPermissionModal 
                isOpen={showPermissionModal} 
                onClose={() => setShowPermissionModal(false)} 
                onRetry={handleRetryPermission} 
            />
        </div>
    );
};

export default ScannerModal;

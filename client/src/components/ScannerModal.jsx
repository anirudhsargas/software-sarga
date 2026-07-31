import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X, Camera, Upload } from 'lucide-react';
import CameraPermissionModal from './CameraPermissionModal';

let _html5QrcodeModule = null;
let html5QrcodePromise = null;

const SCAN_ATTEMPTS = [1, 2, 3];

const getHtml5QrcodeModule = () => {
    if (html5QrcodePromise) return html5QrcodePromise;
    html5QrcodePromise = import('html5-qrcode').then(mod => {
        _html5QrcodeModule = mod;
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
    const camDivId = `qr-cam-${useId()}`;
    const _prevIsOpenRef = useRef(isOpen);
    const triggerRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            triggerRef.current = document.activeElement;
        } else if (triggerRef.current) {
            triggerRef.current.focus();
            triggerRef.current = null;
        }
    }, [isOpen]);

    useEffect(() => {
        return () => {
            triggerRef.current?.focus();
        };
    }, []);

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

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const err = new Error('Camera API (getUserMedia) is not supported by this browser or connection. HTTPS is required.');
                err.name = 'NotSupportedError';
                console.warn('QR camera error:', err);
                setCameraError('Camera access is not supported by this browser or connection (HTTPS required).');
                return;
            }

            qr = new Html5Qrcode(camDivId, { verbose: false });
            scannerRef.current = qr;
            isStartedRef.current = false;
            isStoppingRef.current = false;

            const config = { fps: 12, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 };

            const tryStart = (constraints, currentConfig = config) =>
                qr.start(constraints, currentConfig,
                    (text) => {
                        safeStop().then(() => {
                            const normalized = normalizeScannedCode(text);
                            if (normalized) { onScan(normalized); onClose(); }
                        });
                    },
                    () => { /* per-frame not-found — silenced */ }
                );

            const tryStartWithFallback = async (constraints) => {
                try {
                    await tryStart(constraints, config);
                } catch (err) {
                    const isOverconstrained = err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError';
                    if (isOverconstrained) {
                        console.warn('[ScannerModal] OverconstrainedError, retrying without aspectRatio constraint:', err.message);
                        await tryStart(constraints, { fps: 12, qrbox: { width: 200, height: 200 } });
                    } else {
                        throw err;
                    }
                }
            };

            tryStartWithFallback({ facingMode: 'environment' })
                .catch(() => tryStartWithFallback({ facingMode: 'user' }))
                .catch(async (err) => {
                    console.log('[ScannerModal] facingMode start failed, trying enumerated device IDs...');
                    try {
                        const devices = await Html5Qrcode.getCameras();
                        if (devices && devices.length > 0) {
                            await tryStartWithFallback(devices[0].id);
                        } else {
                            throw err;
                        }
                    } catch (enumErr) {
                        throw err;
                    }
                })
                .then(() => { isStartedRef.current = true; })
                .catch((err) => {
                    console.warn('QR camera error:', err);
                    if (!mountedRef.current) return;
                    const name = err?.name || '';
                    const msg = err?.message || '';
                    const isPermissionDenied = name === 'NotAllowedError' || name === 'PermissionDeniedError' || msg?.includes('Permission denied');
                    
                    if (isPermissionDenied) {
                        setCameraError('Camera permission denied. Please allow camera access in your browser settings, then try again.');
                        setShowPermissionModal(true);
                    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                        setCameraError('No camera found on this device.');
                    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                        setCameraError('Camera is busy. Close other apps using the camera and try again.');
                    } else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
                        setCameraError('Camera could not be configured with the selected settings.');
                    } else if (name === 'SecurityError' || msg?.includes('insecure')) {
                        setCameraError('Camera requires a secure (HTTPS) connection.');
                    } else {
                        setCameraError(`Camera unavailable (${name || 'UnknownError'}: ${msg || 'No details available'}). Use "Upload Photo" instead.`);
                    }
                    isStartedRef.current = false;
                    scannerRef.current = null;
                });
        };

        startCamera().catch((err) => {
            console.warn('[ScannerModal] startCamera failed:', err);
            if (!mountedRef.current) return;
            const name = err?.name || '';
            setCameraError(`Camera unavailable (${name || 'UnknownError'}: ${String(err?.message || err || 'No details available')}). Use "Upload Photo" instead.`);
            isStartedRef.current = false;
            scannerRef.current = null;
        });

        return () => {
            cancelled = true;
            if (qr) {
                try {
                    qr.stop().catch(() => {});
                } catch {
                    // html5-qrcode stop() throws synchronously (a raw string) when the
                    // scanner is not in a running/paused state, e.g. during the start
                    // transition or after a scan has already stopped it. Never let that
                    // escape to an error boundary.
                }
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
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setCameraError('Camera API (getUserMedia) is not supported by this browser or connection. HTTPS is required.');
            return;
        }
        if (permissionRequested) { setMode('camera'); return; }
        try {
            let tempStream;
            try {
                // Try environment preference first
                tempStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } }
                });
            } catch (err1) {
                try {
                    // Try user preference
                    tempStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user' }
                    });
                } catch (err2) {
                    // Try unconstrained video
                    tempStream = await navigator.mediaDevices.getUserMedia({
                        video: true
                    });
                }
            }
            tempStream.getTracks().forEach(track => track.stop());
            setPermissionRequested(true);
            setMode('camera');
        } catch (err) {
            console.error('[ScannerModal] getUserMedia error:', err.name, err.message);
            const name = err?.name || '';
            const msg = err?.message || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || msg?.includes('Permission denied')) {
                setCameraError('Camera permission denied. Please allow camera access in your browser settings, then try again.');
                setShowPermissionModal(true);
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                setCameraError('No camera found on this device.');
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                setCameraError('Camera is busy. Close other apps using the camera and try again.');
            } else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
                setCameraError('Camera could not be configured with the selected settings.');
            } else if (name === 'SecurityError' || msg?.includes('insecure')) {
                setCameraError('Camera requires a secure (HTTPS) connection.');
            } else {
                setCameraError(`Unable to access camera (${name || 'UnknownError'}: ${msg || 'No details available'}). Please check your camera device or switch to file upload.`);
            }
        }
    };

    const handleRetryPermission = async () => {
        setShowPermissionModal(false);
        setCameraError('');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setCameraError('Camera API (getUserMedia) is not supported by this browser or connection. HTTPS is required.');
            return;
        }
        try {
            let tempStream;
            try {
                // Try environment preference first
                tempStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } }
                });
            } catch (err1) {
                try {
                    // Try user preference
                    tempStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user' }
                    });
                } catch (err2) {
                    // Try unconstrained video
                    tempStream = await navigator.mediaDevices.getUserMedia({
                        video: true
                    });
                }
            }
            tempStream.getTracks().forEach(track => track.stop());
            setPermissionRequested(true);
            setMode('camera');
        } catch (err) {
            console.error('[ScannerModal] getUserMedia retry error:', err.name, err.message);
            const name = err?.name || '';
            const msg = err?.message || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || msg?.includes('Permission denied')) {
                setCameraError('Camera permission denied. Please allow camera access in your browser settings, then try again.');
                setShowPermissionModal(true);
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                setCameraError('No camera found on this device.');
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                setCameraError('Camera is busy. Close other apps using the camera and try again.');
            } else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
                setCameraError('Camera could not be configured with the selected settings.');
            } else if (name === 'SecurityError' || msg?.includes('insecure')) {
                setCameraError('Camera requires a secure (HTTPS) connection.');
            } else {
                setCameraError(`Unable to access camera (${name || 'UnknownError'}: ${msg || 'No details available'}). Please check your camera device or switch to file upload.`);
            }
        }
    };

    // Draw image to canvas and scan with jsQR
    const scanFileWithJsQR = (file) => new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = async () => {
            URL.revokeObjectURL(url);
            try {
                const jsQRModule = await import('jsqr');
                const jsQR = jsQRModule.default;
                for (const scale of SCAN_ATTEMPTS) {
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
            } catch (err) {
                reject(err);
            }
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
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 'var(--z-modal)' }} role="dialog" aria-modal="true" aria-labelledby="scanner-modal-title">
            <div className="modal animate-scale-in" style={{ maxWidth: '460px', width: '92%', position: 'relative' }}>
                <div className="modal-header">
                    <div className="row gap-sm items-center">
                        <Camera size={18} aria-hidden="true" />
                        <h2 id="scanner-modal-title" className="modal-title" style={{ margin: 0 }}>Scan QR / Barcode</h2>
                    </div>
                    <button className="modal-close modal-close--static" onClick={onClose} aria-label="Close scanner">
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

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
                        id={camDivId}
                        style={{ width: '100%', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-2)', minHeight: '240px' }}
                    />
                )}

                {cameraError && (
                    <div style={{
                        marginTop: '10px', padding: '10px 14px',
                        background: 'var(--warning-bg)', borderRadius: '8px',
                        color: 'var(--muted-foreground)', fontSize: '13px'
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

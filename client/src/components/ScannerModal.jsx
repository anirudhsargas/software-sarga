// ── Native camera scanner (replaces html5-qrcode) ──────────────────────────
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X, Camera, Upload } from 'lucide-react';
import CameraPermissionModal from './CameraPermissionModal';

const SCAN_ATTEMPTS = [1, 2, 3];

const ScannerModal = ({ isOpen, onClose, onScan }) => {
    const streamRef = useRef(null);      // MediaStream for live camera
    const videoRef = useRef(null);       // <video> element
    const rafRef = useRef(null);         // requestAnimationFrame handle
    const mountedRef = useRef(false);
    const fileInputRef = useRef(null);
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

    // Stop active camera stream
    const stopStream = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    // Start live camera using native getUserMedia + jsQR frame scan
    useEffect(() => {
        if (!isOpen || mode !== 'camera') return;
        mountedRef.current = true;
        setCameraError('');

        let cancelled = false;

        const startCamera = async () => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setCameraError('Camera access is not supported by this browser or connection (HTTPS required).');
                return;
            }

            // Load jsqr in parallel with camera startup
            const [stream, jsQR] = await Promise.all([
                (async () => {
                    try {
                        return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
                    } catch {
                        try {
                            return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                        } catch {
                            return await navigator.mediaDevices.getUserMedia({ video: true });
                        }
                    }
                })(),
                import('jsqr').then(m => m.default),
            ]);

            if (cancelled || !mountedRef.current) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }

            streamRef.current = stream;

            // Attach stream to the video element
            const video = videoRef.current;
            if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
            video.srcObject = stream;
            await video.play().catch(() => {});

            // Frame scan loop
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            const scanFrame = () => {
                if (!mountedRef.current || cancelled) return;
                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                    if (code) {
                        const normalized = normalizeScannedCode(code.data);
                        if (normalized) {
                            stopStream();
                            onScan(normalized);
                            onClose();
                            return;
                        }
                    }
                }
                rafRef.current = requestAnimationFrame(scanFrame);
            };
            rafRef.current = requestAnimationFrame(scanFrame);
        };

        startCamera().catch((err) => {
            if (!mountedRef.current) return;
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
                setCameraError(`Camera unavailable (${name || 'UnknownError'}: ${msg || 'No details available'}). Use "Upload Photo" instead.`);
            }
        });

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [isOpen, mode, stopStream, onScan, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup when modal closes
    useEffect(() => {
        if (!isOpen) {
            mountedRef.current = false;
            stopStream();
            setCameraError('');
            return;
        }
        mountedRef.current = true;
        setCameraError('');
    }, [isOpen, stopStream]);

    useEffect(() => {
        if ('permissions' in navigator) {
            navigator.permissions.query({ name: 'camera' }).then((status) => {
                if (status.state === 'denied') {
                    setCameraError('Camera access is blocked. Please allow camera access in your browser settings.');
                }
            }).catch(() => {});
        }
    }, []);

    const switchToFile = async () => {
        stopStream();
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
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        style={{ width: '100%', borderRadius: '8px', display: 'block', background: '#000', minHeight: '240px' }}
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

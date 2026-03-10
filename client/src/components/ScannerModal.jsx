import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import jsQR from 'jsqr';
import { X, Camera, Upload } from 'lucide-react';

const ScannerModal = ({ isOpen, onClose, onScan }) => {
    const scannerRef = useRef(null);
    const isStartedRef = useRef(false);   // true only after .start() resolves
    const isStoppingRef = useRef(false);  // guard against double-stop
    const mountedRef = useRef(false);
    const fileInputRef = useRef(null);
    const camDivId = useRef(`qr-cam-${Math.random().toString(36).slice(2)}`);

    const [mode, setMode] = useState('file'); // start with file mode (works on HTTP)
    const [cameraError, setCameraError] = useState('');
    const [scanning, setScanning] = useState(false);
    const normalizeScannedCode = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

    // Safe stop helper — only stops if actually running
    const safeStop = useCallback(async () => {
        const qr = scannerRef.current;
        if (!qr || !isStartedRef.current || isStoppingRef.current) return;
        isStoppingRef.current = true;
        try {
            await qr.stop();
        } catch {
            // ignore — already stopped or never started
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

        const id = camDivId.current;
        const qr = new Html5Qrcode(id, { verbose: false });
        scannerRef.current = qr;
        isStartedRef.current = false;
        isStoppingRef.current = false;

        const config = { fps: 12, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 };

        const tryStart = (constraints) =>
            qr.start(constraints, config,
                (text) => {
                    // Success callback
                    safeStop().then(() => {
                        const normalized = normalizeScannedCode(text);
                        if (mountedRef.current && normalized) { onScan(normalized); onClose(); }
                    });
                },
                () => { /* per-frame not-found — silenced */ }
            );

        tryStart({ facingMode: 'environment' })
            .catch(() => tryStart({ facingMode: 'user' }))
            .then(() => { isStartedRef.current = true; })
            .catch((err) => {
                console.warn('Camera unavailable:', err);
                if (mountedRef.current) {
                    setCameraError('Live camera unavailable on HTTP. Use "Take / Upload Photo" below.');
                }
                isStartedRef.current = false;
                scannerRef.current = null;
            });

        return () => {
            mountedRef.current = false;
            safeStop();
        };
    }, [isOpen, mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup when modal closes
    useEffect(() => {
        if (!isOpen) {
            mountedRef.current = false;
            safeStop();
            setCameraError('');
        }
    }, [isOpen, safeStop]);

    const switchToFile = async () => {
        await safeStop();
        setCameraError('');
        setMode('file');
    };

    const switchToCamera = () => {
        setCameraError('');
        setMode('camera');
    };

    // Draw image to canvas and scan with jsQR — works on any uploaded image
    const scanFileWithJsQR = (file) => new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            // Try at original size first, then scaled up for small QR codes
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

    // Attempt QR scan using native BarcodeDetector (most reliable)
    const tryBarcodeDetector = async (file) => {
        if (!('BarcodeDetector' in window)) return null;
        const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e'] });
        const bitmap = await createImageBitmap(file);
        const codes = await detector.detect(bitmap);
        return codes.length > 0 ? codes[0].rawValue : null;
    };

    // Fallback: canvas-based scan via Html5Qrcode
    const tryHtml5Qrcode = async (file) => {
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
            const qr = new Html5Qrcode(tmpId, { verbose: false });
            const result = await qr.scanFile(file, true);
            try { qr.clear(); } catch { /* ignore */ }
            return result;
        } finally {
            if (document.body.contains(tmpDiv)) document.body.removeChild(tmpDiv);
        }
    };

    // Scan from photo/image
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
            // 1. Try jsQR (canvas-based, most reliable for uploaded images)
            let result = await scanFileWithJsQR(file).catch(() => null);

            // 2. Try native BarcodeDetector
            if (!result) result = await tryBarcodeDetector(file).catch(() => null);

            // 3. Fall back to html5-qrcode
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
                setCameraError('No QR code detected. Make sure the QR code is clearly visible, well-lit, and fills most of the frame.');
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
        <div className="modal-backdrop" style={{ zIndex: 1000 }}>
            <div className="modal" style={{ maxWidth: '460px', width: '92%' }}>
                {/* Header */}
                <div className="row space-between items-center mb-16">
                    <div className="row gap-sm items-center">
                        <Camera size={18} />
                        <h2 className="section-title" style={{ margin: 0 }}>Scan QR Code</h2>
                    </div>
                    <button className="icon-button" onClick={onClose}><X size={20} /></button>
                </div>

                {/* Mode tabs */}
                <div className="row gap-sm mb-16">
                    <button
                        className={`btn btn-sm ${mode === 'file' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => {
                            switchToFile();
                            // Trigger file input after switching to file mode
                            setTimeout(() => {
                                if (fileInputRef.current) {
                                    fileInputRef.current.click();
                                }
                            }, 100);
                        }}
                        style={{ flex: 1 }}
                        disabled={scanning}
                    >
                        <Upload size={14} style={{ marginRight: 5 }} /> Take / Upload Photo
                    </button>
                    <button
                        className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={switchToCamera}
                        style={{ flex: 1 }}
                    >
                        <Camera size={14} style={{ marginRight: 5 }} /> Live Camera
                    </button>
                </div>

                {/* File / photo mode (default — works on HTTP) */}
                {mode === 'file' && (
                    <div style={{ padding: '24px 0', textAlign: 'center' }}>
                        <p className="muted mb-16" style={{ fontSize: '13px' }}>
                            Click "Take / Upload Photo" above to select an image with a QR code.
                        </p>
                        {scanning && (
                            <div style={{
                                padding: '12px 24px', borderRadius: '8px',
                                background: 'var(--muted)', color: '#666',
                                fontWeight: 600, fontSize: '15px'
                            }}>
                                ⏳ Reading QR code from image...
                            </div>
                        )}
                    </div>
                )}

                {/* Live camera mode */}
                {mode === 'camera' && (
                    <div
                        id={camDivId.current}
                        style={{ width: '100%', borderRadius: '8px', overflow: 'hidden', background: '#111', minHeight: '240px' }}
                    />
                )}

                {/* Error banner */}
                {cameraError && (
                    <div style={{
                        marginTop: '10px', padding: '10px 14px',
                        background: '#fff3cd', borderRadius: '8px',
                        color: '#856404', fontSize: '13px'
                    }}>
                        ⚠️ {cameraError}
                    </div>
                )}

                <p className="muted text-center mt-12" style={{ fontSize: '12px' }}>
                    {mode === 'file'
                        ? 'Tip: tap the button → camera opens → aim at QR → tap shutter → done.'
                        : 'Hold the QR code steady — detects automatically.'}
                </p>

                {/* Hidden file input for photo upload */}
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
        </div>
    );
};

export default ScannerModal;


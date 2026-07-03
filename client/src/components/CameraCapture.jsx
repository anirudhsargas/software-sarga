import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

const CameraCapture = ({ onCapture, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');

  const triggerRef = useRef(null);
  useEffect(() => {
    triggerRef.current = document.activeElement;
    return () => {
      triggerRef.current?.focus();
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraLoading(true);
    setCameraError('');

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    // Build constraints — use 'ideal' (not 'exact') to avoid OverconstrainedError
    // on devices that don't support specific resolutions.
    const tryGetStream = (constraints) =>
      navigator.mediaDevices
        ? navigator.mediaDevices.getUserMedia(constraints)
        : Promise.reject(Object.assign(new Error('Not supported'), { name: 'SecurityError' }));

    try {
      let stream;
      try {
        stream = await tryGetStream({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (firstErr) {
        // OverconstrainedError or similar: retry with minimal constraints
        const retry = firstErr?.name === 'OverconstrainedError' ||
                      firstErr?.name === 'ConstraintNotSatisfiedError';
        if (retry) {
          console.warn('[CameraCapture] Retrying with unconstrained video:', firstErr?.name);
          stream = await tryGetStream({ video: true, audio: false });
        } else {
          throw firstErr;
        }
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(e => console.warn(e));
        };
      }

      const track = stream.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        try {
          await track.applyConstraints({ advanced: [{ torch: isFlashOn }] });
        } catch {
          // torch constraint unsupported — ignore
        }
      }
    } catch (err) {
      console.error('[CameraCapture] getUserMedia error:', err?.name, err?.message, err);
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' ||
          err?.message?.includes('Permission denied')) {
        setCameraError(
          'Camera permission was denied. Open your browser settings, allow camera ' +
          'access for this site, and reload the page.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('No camera found on this device.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCameraError('Camera is in use by another app. Close other apps and try again.');
      } else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
        setCameraError('Camera could not start with current settings. Try switching cameras.');
      } else if (name === 'SecurityError') {
        setCameraError('Camera access requires a secure (HTTPS) connection.');
      } else {
        setCameraError('Could not access the camera. Please check your permissions and try again.');
      }
    } finally {
      setCameraLoading(false);
    }
  }, [facingMode, isFlashOn]);

  useEffect(() => {
    if (!capturedPhoto) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [capturedPhoto, startCamera, stopCamera]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.filter = 'brightness(1.08) contrast(1.04)';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `bill_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const src = URL.createObjectURL(blob);
      setCapturedPhoto({ src, file });
    }, 'image/jpeg', 0.85);
  };

  const usePhoto = () => {
    if (!capturedPhoto) return;
    onCapture(capturedPhoto.file);
    URL.revokeObjectURL(capturedPhoto.src);
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

  const handleGalleryFile = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
    }
    e.target.value = '';
  };

  const overlay = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 'var(--z-overlay)', backgroundColor: 'var(--shadow-sm)',
    display: 'flex', flexDirection: 'column'
  };

  const header = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px',
    background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
    zIndex: 10
  };

  const headerBtn = {
    background: 'transparent', border: 'none', color: 'var(--card)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
    fontSize: '14px', padding: '8px 12px', borderRadius: '8px'
  };

  const toolBtn = (active) => ({
    background: active ? 'var(--card)' : 'transparent',
    border: '1px solid rgba(255,255,255,0.3)', color: 'var(--card)',
    cursor: 'pointer', padding: '6px 10px', borderRadius: '6px',
    fontSize: '12px'
  });

  const actionBtn = {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
    color: 'var(--card)', cursor: 'pointer', padding: '8px 20px', borderRadius: '8px',
    fontSize: '13px'
  };

  return (
    <div style={overlay}>
      <div style={header}>
        <button onClick={onClose} style={headerBtn}>
          <X size={20} aria-hidden="true" /> Exit
        </button>
        <span style={{ color: 'var(--card)', fontSize: '16px', fontWeight: 600 }}>Capture Bill</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowGrid(!showGrid)} style={toolBtn(showGrid)} aria-pressed={showGrid} aria-label="Toggle camera grid">Grid</button>
          <button onClick={toggleFlash} style={toolBtn(isFlashOn)} aria-pressed={isFlashOn} aria-label={`Toggle flash ${isFlashOn ? 'OFF' : 'ON'}`}>Flash {isFlashOn ? 'ON' : 'OFF'}</button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!capturedPhoto ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: 'var(--foreground)' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline />
            {showGrid && (
              <>
                <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', backgroundColor: 'var(--card)' }} />
                <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', backgroundColor: 'var(--card)' }} />
                <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--card)' }} />
                <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--card)' }} />
              </>
            )}
            {[
              { pos: 'top-left', top: '30px', left: '30px', borderWidth: '3px 0 0 3px' },
              { pos: 'top-right', top: '30px', right: '30px', borderWidth: '3px 3px 0 0' },
              { pos: 'bottom-left', bottom: '30px', left: '30px', borderWidth: '0 0 3px 3px' },
              { pos: 'bottom-right', bottom: '30px', right: '30px', borderWidth: '0 3px 3px 0' }
            ].map(c => (
              <div key={c.pos} style={{
                position: 'absolute', width: '40px', height: '40px',
                borderColor: 'var(--success)', borderStyle: 'solid',
                top: c.top, left: c.left, right: c.right, bottom: c.bottom,
                borderWidth: c.borderWidth
              }} />
            ))}
            {cameraLoading && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent, #fff)' }} />
              </div>
            )}
            {cameraError && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', padding: '24px', color: 'var(--card)' }}>
                <AlertCircle size={36} style={{ color: 'var(--destructive)', marginBottom: '8px' }} />
                <p style={{ fontSize: '14px' }}>{cameraError}</p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--foreground)' }}>
            <img src={capturedPhoto.src} alt="Preview of captured photo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        )}
      </div>

      <div style={{
        padding: '16px',
        background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
        zIndex: 10
      }}>
        {!capturedPhoto ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '8px 0' }}>
            <button onClick={() => fileInputRef.current?.click()} style={actionBtn}>
              Gallery
            </button>
            <button onClick={capturePhoto} disabled={cameraLoading} aria-label="Capture photo" style={{
              width: '72px', height: '72px', borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.8)',
              background: 'transparent', cursor: cameraLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: cameraLoading ? 0.5 : 1
            }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--card)' }} />
            </button>
            <button onClick={switchCamera} style={actionBtn}>
              Switch
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setCapturedPhoto(null)} style={{
              flex: 1, padding: '12px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'transparent', color: 'var(--card)', cursor: 'pointer', fontSize: '14px'
            }}>
              Retake
            </button>
            <button onClick={usePhoto} style={{
              flex: 1, padding: '12px', borderRadius: '8px',
              border: 'none', background: 'var(--accent, #3b82f6)', color: 'var(--card)',
              cursor: 'pointer', fontSize: '14px', fontWeight: 600
            }}>
              Use Photo
            </button>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <input ref={fileInputRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleGalleryFile} />
    </div>
  );
};

export default CameraCapture;

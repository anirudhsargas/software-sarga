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

      const track = stream.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: isFlashOn }]
          });
        } catch {
          // torch constraint unsupported
        }
      }
    } catch (err) {
      console.error('Camera access failed:', err);
      setCameraError('Could not access the camera. Please ensure permissions are granted.');
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
    zIndex: 10000, backgroundColor: '#000',
    display: 'flex', flexDirection: 'column'
  };

  const header = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px',
    background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
    zIndex: 10
  };

  const headerBtn = {
    background: 'transparent', border: 'none', color: '#fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
    fontSize: '14px', padding: '8px 12px', borderRadius: '8px'
  };

  const toolBtn = (active) => ({
    background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
    border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
    cursor: 'pointer', padding: '6px 10px', borderRadius: '6px',
    fontSize: '12px'
  });

  const actionBtn = {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', cursor: 'pointer', padding: '8px 20px', borderRadius: '8px',
    fontSize: '13px'
  };

  return (
    <div style={overlay}>
      <div style={header}>
        <button onClick={onClose} style={headerBtn}>
          <X size={20} /> Exit
        </button>
        <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>Capture Bill</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowGrid(!showGrid)} style={toolBtn(showGrid)}>Grid</button>
          <button onClick={toggleFlash} style={toolBtn(isFlashOn)}>Flash {isFlashOn ? 'ON' : 'OFF'}</button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!capturedPhoto ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: '#111' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline />
            {showGrid && (
              <>
                <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
                <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
                <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
                <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
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
                borderColor: 'rgba(0, 255, 200, 0.6)', borderStyle: 'solid',
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
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', padding: '24px', color: '#fff' }}>
                <AlertCircle size={36} style={{ color: '#ef4444', marginBottom: '8px' }} />
                <p style={{ fontSize: '14px' }}>{cameraError}</p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
            <img src={capturedPhoto.src} alt="Captured" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
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
            <button onClick={capturePhoto} disabled={cameraLoading} style={{
              width: '72px', height: '72px', borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.8)',
              background: 'transparent', cursor: cameraLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: cameraLoading ? 0.5 : 1
            }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#fff' }} />
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
              background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '14px'
            }}>
              Retake
            </button>
            <button onClick={usePhoto} style={{
              flex: 1, padding: '12px', borderRadius: '8px',
              border: 'none', background: 'var(--accent, #3b82f6)', color: '#fff',
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

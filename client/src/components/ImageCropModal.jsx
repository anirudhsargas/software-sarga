import React, { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedBlob } from '../utils/imageCrop';
import toast from 'react-hot-toast';
import './ImageCropModal.css';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const getOutputType = (inputType) => {
  if (SUPPORTED_TYPES.includes(inputType)) {
    return inputType;
  }
  return 'image/png';
};

const getFileExtension = (mimeType) => {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
};

const buildCroppedFileName = (originalName, mimeType) => {
  const base = originalName.replace(/\.[^/.]+$/, '') || 'image';
  return `${base}-crop.${getFileExtension(mimeType)}`;
};

const ImageCropModal = ({ file, title = 'Crop Image', outputSize = 512, onCancel, onComplete }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const imageUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, [file]);

  const handleCropComplete = (_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  };

  const handleSave = async () => {
    if (!file || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const mimeType = getOutputType(file.type);
      const blob = await getCroppedBlob(imageUrl, croppedAreaPixels, outputSize, mimeType);
      const croppedFile = new File([blob], buildCroppedFileName(file.name, mimeType), {
        type: mimeType,
        lastModified: Date.now()
      });
      onComplete(croppedFile);
    } catch (error) {
      console.error('Image crop failed', error);
      toast.error('Unable to crop image. Please try another file.');
      setSaving(false);
    }
  };

  if (!file) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal cropper-modal">
        <h2 className="cropper-title">{title}</h2>
        <div className="cropper-wrapper">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>
        <div className="cropper-controls">
          <div className="cropper-controls__label">
            <span className="cropper-controls__title">Zoom</span>
            <span className="cropper-controls__value">{zoom.toFixed(2)}x</span>
          </div>
          <input
            className="cropper-slider"
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </div>
        <div className="cropper-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Use Photo'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;

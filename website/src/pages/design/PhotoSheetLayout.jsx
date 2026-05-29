import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, Download, Move, RotateCw, Trash2, Grid3X3,
  ZoomIn, ZoomOut, Maximize, ArrowLeft, FileImage, Crop,
  LayoutGrid, ChevronDown, ChevronUp, Settings
} from 'lucide-react';
import { PHOTO_PRESETS, autoArrangePhotos, smartPack, renderToCanvas, downloadImage, exportPDF, SHEET_PRESETS } from '../../utils/printLayout';
import './PhotoSheetLayout.css';

const SHEET = SHEET_PRESETS['13x19'];
const SHEET_W = SHEET.safeWidth;
const SHEET_H = SHEET.safeHeight;

const MIN_PHOTO_IN = 0.5;
const HANDLE_SIZE = 10;

let photoIdCounter = 0;

export default function PhotoSheetLayout() {
  const navigate = useNavigate();
  const sheetRef = useRef(null);
  const fileInputRef = useRef(null);

  const [photos, setPhotos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [margin, setMargin] = useState(0.5);
  const [spacing, setSpacing] = useState(0.25);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [dpi, setDpi] = useState(300);
  const [presetWidth, setPresetWidth] = useState(6);
  const [presetHeight, setPresetHeight] = useState(4);
  const [showSettings, setShowSettings] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dragTarget, setDragTarget] = useState(null);
  const [resizeDir, setResizeDir] = useState(null);

  const selectedPhoto = photos.find(p => p.id === selectedId);

  const inchesToPixels = useCallback((inches) => Math.round(inches * 40 * zoom), [zoom]);

  useEffect(() => {
    document.title = 'Photo Sheet Layout - Sarga Offset';
  }, []);

  const handleFiles = useCallback((files) => {
    const newPhotos = Array.from(files).map((file) => ({
      id: `photo_${++photoIdCounter}`,
      file,
      src: URL.createObjectURL(file),
      x: 0, y: 0,
      width: presetWidth,
      height: presetHeight,
      rotation: 0,
      locked: false,
      naturalW: 0,
      naturalH: 0,
    }));

    const loaded = newPhotos.map((p) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const aspect = img.naturalWidth / img.naturalHeight;
          let w = presetWidth;
          let h = w / aspect;
          if (h > presetHeight) { h = presetHeight; w = h * aspect; }
          resolve({ ...p, width: w, height: h, naturalW: img.naturalWidth, naturalH: img.naturalHeight });
        };
        img.onerror = () => resolve(p);
        img.src = p.src;
      });
    });

    Promise.all(loaded).then((placed) => {
      const result = smartPack(placed, SHEET_W + 2, SHEET_H + 2, margin, spacing);
      setPhotos(prev => [...prev, ...result.items]);
    });
  }, [presetWidth, presetHeight, margin, spacing]);

  const handleUpload = (e) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    e.target.value = '';
  };

  const removePhoto = (id) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleAutoArrange = () => {
    setPhotos(prev => {
      const arranged = autoArrangePhotos(prev, SHEET_W, SHEET_H, margin, spacing);
      return arranged.map((p, i) => ({
        ...p,
        x: margin + (i % 2) * ((SHEET_W - margin * 2) / 2),
        y: margin + Math.floor(i / 2) * (p.height + spacing),
      }));
    });
  };

  const handleSmartPack = () => {
    setPhotos(prev => {
      const result = smartPack(prev, SHEET_W, SHEET_H, margin, spacing);
      return result.items;
    });
  };

  const getSheetStyle = () => {
    const scale = 40 * zoom;
    const w = SHEET_W * scale;
    const h = SHEET_H * scale;
    return {
      width: w,
      height: h,
      backgroundColor: bgColor,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 2px 20px rgba(0,0,0,0.15)',
      borderRadius: 2,
    };
  };

  const getPhotoStyle = (p) => {
    const scale = 40 * zoom;
    return {
      position: 'absolute',
      left: p.x * scale,
      top: p.y * scale,
      width: p.width * scale,
      height: p.height * scale,
      transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
      cursor: p.locked ? 'default' : 'move',
      border: selectedId === p.id ? '2px solid #8b5cf6' : '2px solid transparent',
      borderRadius: 2,
      boxSizing: 'border-box',
      zIndex: selectedId === p.id ? 10 : 1,
    };
  };

  const handleMouseDown = (e, p) => {
    if (p.locked) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(p.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const startPhotoX = p.x;
    const startPhotoY = p.y;

    const handleMouseMove = (ev) => {
      const scale = 40 * zoom;
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      setPhotos(prev => prev.map(ph =>
        ph.id === p.id ? { ...ph, x: startPhotoX + dx, y: startPhotoY + dy } : ph
      ));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target === sheetRef.current || e.target.classList.contains('sheet-area')) {
      setSelectedId(null);
    }
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        removePhoto(selectedId);
      }
    }
    if (e.key === 'ArrowUp' && selectedId) {
      e.preventDefault();
      setPhotos(prev => prev.map(p => p.id === selectedId ? { ...p, y: Math.max(0, p.y - 0.05) } : p));
    }
    if (e.key === 'ArrowDown' && selectedId) {
      e.preventDefault();
      setPhotos(prev => prev.map(p => p.id === selectedId ? { ...p, y: p.y + 0.05 } : p));
    }
    if (e.key === 'ArrowLeft' && selectedId) {
      e.preventDefault();
      setPhotos(prev => prev.map(p => p.id === selectedId ? { ...p, x: Math.max(0, p.x - 0.05) } : p));
    }
    if (e.key === 'ArrowRight' && selectedId) {
      e.preventDefault();
      setPhotos(prev => prev.map(p => p.id === selectedId ? { ...p, x: p.x + 0.05 } : p));
    }
  }, [selectedId]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleResizeStart = (e, p, dir) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(p.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = p.width;
    const startH = p.height;
    const startXPos = p.x;
    const startYPos = p.y;
    const aspect = p.width / p.height;

    const handleMouseMove = (ev) => {
      const scale = 40 * zoom;
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;

      setPhotos(prev => prev.map(ph => {
        if (ph.id !== p.id) return ph;
        let newW = startW, newH = startH, newX = startXPos, newY = startYPos;

        if (dir.includes('e')) { newW = Math.max(startW + dx, MIN_PHOTO_IN); newH = newW / aspect; }
        if (dir.includes('s')) { newH = Math.max(startH + dy, MIN_PHOTO_IN); newW = newH * aspect; }
        if (dir.includes('w')) {
          const diff = Math.max(startW - dx, MIN_PHOTO_IN) - startW;
          newW = startW + diff; newH = newW / aspect; newX = startXPos - diff;
        }
        if (dir.includes('n')) {
          const diff = Math.max(startH - dy, MIN_PHOTO_IN) - startH;
          newH = startH + diff; newW = newH * aspect; newY = startYPos - diff;
        }

        return { ...ph, width: newW, height: newH, x: newX, y: newY };
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const rotateSelected = () => {
    if (!selectedId) return;
    setPhotos(prev => prev.map(p =>
      p.id === selectedId ? { ...p, rotation: (p.rotation + 90) % 360, width: p.height, height: p.width } : p
    ));
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      if (format === 'pdf') {
        await exportPDF(photos, SHEET_W, SHEET_H, 'print-sheet', dpi);
      } else {
        const canvas = await renderToCanvas(photos, SHEET_W, SHEET_H, dpi, bgColor);
        downloadImage(canvas, 'print-sheet', format);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  const applyPreset = (preset) => {
    if (preset.layout === '2xA4') {
      setPresetWidth(11.69); setPresetHeight(16.53);
    } else {
      setPresetWidth(preset.width); setPresetHeight(preset.height);
    }
  };

  return (
    <div className="sheet-layout">
      <div className="sheet-layout__toolbar">
        <button className="sheet-layout__back" onClick={() => navigate('/design')}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="sheet-layout__toolbar-title">Photo Sheet Layout — 12×18" Safe Area</div>
        <div className="sheet-layout__toolbar-actions">
          <button className="sheet-layout__btn" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Upload
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUpload} hidden />
          <button className="sheet-layout__btn" onClick={handleAutoArrange} disabled={!photos.length}>
            <LayoutGrid size={16} /> Arranged
          </button>
          <button className="sheet-layout__btn" onClick={handleSmartPack} disabled={!photos.length}>
            <Grid3X3 size={16} /> Pack
          </button>
          <button className="sheet-layout__btn" onClick={rotateSelected} disabled={!selectedId}>
            <RotateCw size={16} /> Rotate
          </button>
          <button className="sheet-layout__btn sheet-layout__btn--danger" onClick={() => selectedId && removePhoto(selectedId)} disabled={!selectedId}>
            <Trash2 size={16} /> Delete
          </button>
          <div className="sheet-layout__separator" />
          <button className="sheet-layout__btn" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}>
            <ZoomIn size={16} />
          </button>
          <span className="sheet-layout__zoom">{Math.round(zoom * 100)}%</span>
          <button className="sheet-layout__btn" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>
            <ZoomOut size={16} />
          </button>
          <button className="sheet-layout__btn" onClick={() => setZoom(1)}>
            <Maximize size={16} />
          </button>
        </div>
      </div>

      <div className="sheet-layout__body">
        <div className="sheet-layout__sidebar">
          <div className="sheet-layout__panel">
            <div className="sheet-layout__panel-header" onClick={() => setShowSettings(s => !s)}>
              <Settings size={16} /> Settings {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
            {showSettings && (
              <div className="sheet-layout__panel-body">
                <label className="sheet-layout__label">Margin (in)</label>
                <input type="range" min="0" max="1" step="0.05" value={margin} onChange={e => setMargin(parseFloat(e.target.value))} className="sheet-layout__range" />
                <span className="sheet-layout__value">{margin.toFixed(2)}"</span>

                <label className="sheet-layout__label">Spacing (in)</label>
                <input type="range" min="0" max="0.5" step="0.05" value={spacing} onChange={e => setSpacing(parseFloat(e.target.value))} className="sheet-layout__range" />
                <span className="sheet-layout__value">{spacing.toFixed(2)}"</span>

                <label className="sheet-layout__label">Background</label>
                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="sheet-layout__color" />

                <label className="sheet-layout__label">Export DPI</label>
                <select value={dpi} onChange={e => setDpi(Number(e.target.value))} className="sheet-layout__select">
                  <option value={150}>150 DPI (Draft)</option>
                  <option value={300}>300 DPI (Print)</option>
                  <option value={600}>600 DPI (High)</option>
                </select>
              </div>
            )}
          </div>

          <div className="sheet-layout__panel">
            <div className="sheet-layout__panel-header">Photo Presets</div>
            <div className="sheet-layout__panel-body">
              <div className="sheet-layout__presets">
                {PHOTO_PRESETS.map((preset, i) => (
                  <button key={i} className={`sheet-layout__preset-btn ${presetWidth === preset.width && presetHeight === preset.height ? 'active' : ''}`}
                    onClick={() => applyPreset(preset)}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="sheet-layout__custom-size">
                <input type="number" step="0.5" min="0.5" max="12" value={presetWidth} onChange={e => setPresetWidth(Number(e.target.value))} className="sheet-layout__size-input" />
                <span className="sheet-layout__size-x">×</span>
                <input type="number" step="0.5" min="0.5" max="18" value={presetHeight} onChange={e => setPresetHeight(Number(e.target.value))} className="sheet-layout__size-input" />
                <span className="sheet-layout__size-in">in</span>
              </div>
            </div>
          </div>

          <div className="sheet-layout__panel">
            <div className="sheet-layout__panel-header">
              <FileImage size={16} /> Photos ({photos.length})
            </div>
            <div className="sheet-layout__photo-list">
              {photos.map((p, i) => (
                <div key={p.id} className={`sheet-layout__photo-item ${selectedId === p.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(p.id)}>
                  <img src={p.src} alt="" className="sheet-layout__photo-thumb" />
                  <span className="sheet-layout__photo-name">Photo {i + 1}</span>
                  <span className="sheet-layout__photo-size">{p.width.toFixed(1)}×{p.height.toFixed(1)}"</span>
                  <button className="sheet-layout__photo-remove" onClick={(e) => { e.stopPropagation(); removePhoto(p.id); }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="sheet-layout__panel">
            <div className="sheet-layout__panel-header">
              <Download size={16} /> Export
            </div>
            <div className="sheet-layout__panel-body">
              <button className="sheet-layout__export-btn" onClick={() => handleExport('pdf')} disabled={!photos.length || exporting}>
                {exporting ? 'Exporting...' : 'Download PDF'}
              </button>
              <button className="sheet-layout__export-btn sheet-layout__export-btn--secondary" onClick={() => handleExport('png')} disabled={!photos.length || exporting}>
                Download PNG
              </button>
              <button className="sheet-layout__export-btn sheet-layout__export-btn--secondary" onClick={() => handleExport('jpeg')} disabled={!photos.length || exporting}>
                Download JPEG
              </button>
            </div>
          </div>
        </div>

        <div className="sheet-layout__canvas-area" onMouseDown={handleCanvasMouseDown}>
          <div className="sheet-layout__canvas-scroll">
            <div ref={sheetRef} className="sheet-layout__sheet" style={getSheetStyle()}>
              <div className="sheet-area" style={{ position: 'absolute', inset: 0 }}>
                {photos.map((p) => (
                  <div key={p.id} style={getPhotoStyle(p)}
                    onMouseDown={(e) => handleMouseDown(e, p)}>
                    <img src={p.src} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', userSelect: 'none' }}
                      draggable={false} />
                    {selectedId === p.id && !p.locked && (
                      <>
                        <div className="sheet-layout__handle sheet-layout__handle--nw" onMouseDown={(e) => handleResizeStart(e, p, 'nw')} />
                        <div className="sheet-layout__handle sheet-layout__handle--ne" onMouseDown={(e) => handleResizeStart(e, p, 'ne')} />
                        <div className="sheet-layout__handle sheet-layout__handle--sw" onMouseDown={(e) => handleResizeStart(e, p, 'sw')} />
                        <div className="sheet-layout__handle sheet-layout__handle--se" onMouseDown={(e) => handleResizeStart(e, p, 'se')} />
                        <div className="sheet-layout__rotate-handle" onMouseDown={(e) => { e.stopPropagation(); rotateSelected(); }}>
                          <RotateCw size={12} />
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!photos.length && (
                  <div className="sheet-layout__empty">
                    <Upload size={48} />
                    <p>Upload photos to get started</p>
                    <button className="sheet-layout__upload-btn" onClick={() => fileInputRef.current?.click()}>
                      Choose Photos
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

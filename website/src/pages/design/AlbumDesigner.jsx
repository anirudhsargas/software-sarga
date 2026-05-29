import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, ArrowLeft, Download, Type, Image,
  Square, FileDown, Loader2
} from 'lucide-react';
import { renderToCanvas, downloadImage } from '../../utils/printLayout';
import './AlbumDesigner.css';

const PAGE_W = 11.69;
const PAGE_H = 16.53;
const PAGE_COLORS = ['#ffffff', '#fafafa', '#f5f5f5', '#fff8f0', '#faf5ff', '#f0f9ff', '#fef2f2', '#f0fdf4'];

let elemIdCounter = 0;

export default function AlbumDesigner() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const bgInputRef = useRef(null);
  const pngInputRef = useRef(null);

  const [pages, setPages] = useState([{ id: 'page_1', elements: [], bgColor: '#ffffff' }]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [selectedElemId, setSelectedElemId] = useState(null);
  const [zoom, setZoom] = useState(0.8);

  const currentPage = pages[currentPageIdx];

  useEffect(() => {
    document.title = 'Album Designer - Sarga Offset';
  }, []);

  const addPage = () => {
    setPages(prev => [...prev, { id: `page_${prev.length + 1}`, elements: [], bgColor: '#ffffff' }]);
  };

  const removePage = (idx) => {
    if (pages.length <= 1) return;
    setPages(prev => prev.filter((_, i) => i !== idx));
    if (currentPageIdx >= idx && currentPageIdx > 0) {
      setCurrentPageIdx(prev => prev - 1);
    }
  };

  const addElement = (type) => {
    const id = `elem_${++elemIdCounter}`;
    const newElem = type === 'text'
      ? { id, type: 'text', x: 1, y: 1, width: 4, height: 1.5, content: 'Double-click to edit', fontSize: 24, fontFamily: 'Georgia', color: '#171717', align: 'center', bold: false, rotation: 0 }
      : { id, type: 'image', x: 1, y: 1, width: 4, height: 4, src: null, rotation: 0, borderRadius: 0 };

    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx ? { ...p, elements: [...p.elements, newElem] } : p
    ));
    setSelectedElemId(id);
  };

  const updateElement = (id, updates) => {
    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx
        ? { ...p, elements: p.elements.map(e => e.id === id ? { ...e, ...updates } : e) }
        : p
    ));
  };

  const removeElement = (id) => {
    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx ? { ...p, elements: p.elements.filter(e => e.id !== id) } : p
    ));
    if (selectedElemId === id) setSelectedElemId(null);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    addElement('image');
    const id = `elem_${elemIdCounter}`;
    updateElement(id, { src });
    e.target.value = '';
  };

  const handlePngUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    const id = `elem_${++elemIdCounter}`;
    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx ? {
        ...p, elements: [...p.elements, {
          id, type: 'image', x: 2, y: 2, width: 3, height: 3, src, rotation: 0, borderRadius: 0
        }]
      } : p
    ));
    setSelectedElemId(id);
    e.target.value = '';
  };

  const getElemStyle = (e) => {
    const scale = 40 * zoom;
    return {
      position: 'absolute',
      left: e.x * scale,
      top: e.y * scale,
      width: e.width * scale,
      height: e.height * scale,
      transform: e.rotation ? `rotate(${e.rotation}deg)` : undefined,
      cursor: 'move',
      border: selectedElemId === e.id ? '2px solid #8b5cf6' : '2px solid transparent',
      borderRadius: e.type === 'image' ? `${e.borderRadius || 0}px` : undefined,
      zIndex: selectedElemId === e.id ? 10 : 1,
    };
  };

  const handleElemMouseDown = (e, elem) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedElemId(elem.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const startElemX = elem.x;
    const startElemY = elem.y;

    const handleMove = (ev) => {
      const scale = 40 * zoom;
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      updateElement(elem.id, { x: startElemX + dx, y: startElemY + dy });
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const [exporting, setExporting] = useState(false);
  const selectedElem = currentPage?.elements?.find(e => e.id === selectedElemId);

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const elems = currentPage?.elements || [];
      if (!elems.length) return;

      const renderItems = elems.map(e => ({
        src: e.type === 'text'
          ? textToDataUrl(e.content, e.fontSize || 24, e.color || '#171717', e.fontFamily || 'Georgia', e.width * 40, e.height * 40)
          : e.src,
        x: e.x, y: e.y,
        width: e.width, height: e.height,
        rotation: e.rotation || 0,
      }));

      const validItems = [];
      for (const item of renderItems) {
        if (item.src) {
          validItems.push(item);
        }
      }

      if (format === 'pdf') {
        const { exportPDF } = await import('../../utils/printLayout');
        await exportPDF(validItems, PAGE_W, PAGE_H, 'album-page', 300);
      } else {
        const canvas = await renderToCanvas(validItems, PAGE_W, PAGE_H, 300, currentPage?.bgColor || '#ffffff');
        downloadImage(canvas, 'album-page', format);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  const textToDataUrl = (text, fontSize, color, fontFamily, w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    const lines = (text || '').split('\n');
    const lineH = fontSize * 1.3;
    const startY = (h - lines.length * lineH) / 2 + fontSize / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineH);
    });
    return canvas.toDataURL();
  };

  return (
    <div className="album-designer">
      <div className="album-designer__toolbar">
        <button className="album-designer__back" onClick={() => navigate('/design')}>
          <ArrowLeft size={18} /> Back
        </button>
        <span className="album-designer__toolbar-title">Album Designer</span>
        <div className="album-designer__toolbar-actions">
          <button className="album-designer__btn" onClick={() => addElement('text')}>
            <Type size={16} /> Text
          </button>
          <button className="album-designer__btn" onClick={() => fileInputRef.current?.click()}>
            <Image size={16} /> Image
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} hidden />
          <button className="album-designer__btn" onClick={() => pngInputRef.current?.click()}>
            <Square size={16} /> PNG
          </button>
          <input ref={pngInputRef} type="file" accept="image/png,image/svg+xml" onChange={handlePngUpload} hidden />
          <div className="album-designer__separator" />
          <button className="album-designer__btn" onClick={() => setZoom(z => Math.min(z + 0.2, 2))}>+</button>
          <span className="album-designer__zoom">{Math.round(zoom * 100)}%</span>
          <button className="album-designer__btn" onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))}>-</button>
        </div>
      </div>

      <div className="album-designer__body">
        <div className="album-designer__sidebar">
          <div className="album-designer__panel">
            <div className="album-designer__panel-header">Pages ({pages.length})</div>
            <div className="album-designer__page-list">
              {pages.map((page, i) => (
                <div key={page.id}
                  className={`album-designer__page-thumb ${i === currentPageIdx ? 'active' : ''}`}
                  onClick={() => setCurrentPageIdx(i)}>
                  <div className="album-designer__page-thumb-inner" style={{ background: page.bgColor }}>
                    <span>{i + 1}</span>
                  </div>
                </div>
              ))}
              <button className="album-designer__add-page" onClick={addPage}>
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div className="album-designer__panel">
            <div className="album-designer__panel-header">Page Background</div>
            <div className="album-designer__panel-body">
              <div className="album-designer__color-grid">
                {PAGE_COLORS.map((c, i) => (
                  <button key={i} className={`album-designer__color-swatch ${currentPage?.bgColor === c ? 'active' : ''}`}
                    style={{ background: c, border: c === '#ffffff' ? '1px solid var(--border)' : undefined }}
                    onClick={() => setPages(prev => prev.map((p, j) => j === currentPageIdx ? { ...p, bgColor: c } : p))} />
                ))}
              </div>
            </div>
          </div>

          <div className="album-designer__panel">
            <div className="album-designer__panel-header">Layers</div>
            <div className="album-designer__layer-list">
              {currentPage?.elements?.map((e, i) => (
                <div key={e.id}
                  className={`album-designer__layer-item ${selectedElemId === e.id ? 'active' : ''}`}
                  onClick={() => setSelectedElemId(e.id)}>
                  {e.type === 'text' ? <Type size={12} /> : <Image size={12} />}
                  <span className="album-designer__layer-name">{e.type === 'text' ? e.content?.slice(0, 20) : `Image ${i + 1}`}</span>
                  <button className="album-designer__layer-remove" onClick={() => removeElement(e.id)}>
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {(!currentPage?.elements?.length) && (
                <div className="album-designer__layer-empty">No elements yet</div>
              )}
            </div>
          </div>

          {selectedElem && (
            <div className="album-designer__panel">
              <div className="album-designer__panel-header">Properties</div>
              <div className="album-designer__panel-body">
                {selectedElem.type === 'text' && (
                  <>
                    <label className="album-designer__label">Content</label>
                    <textarea className="album-designer__textarea" rows={2}
                      value={selectedElem.content} onChange={e => updateElement(selectedElem.id, { content: e.target.value })} />
                    <label className="album-designer__label">Font Size</label>
                    <input type="range" min="8" max="72" value={selectedElem.fontSize}
                      onChange={e => updateElement(selectedElem.id, { fontSize: Number(e.target.value) })}
                      className="album-designer__range" />
                    <span className="album-designer__value">{selectedElem.fontSize}px</span>
                    <label className="album-designer__label">Color</label>
                    <input type="color" value={selectedElem.color}
                      onChange={e => updateElement(selectedElem.id, { color: e.target.value })}
                      className="album-designer__color" />
                  </>
                )}
                {selectedElem.type === 'image' && (
                  <>
                    <label className="album-designer__label">Border Radius</label>
                    <input type="range" min="0" max="50" value={selectedElem.borderRadius || 0}
                      onChange={e => updateElement(selectedElem.id, { borderRadius: Number(e.target.value) })}
                      className="album-designer__range" />
                    <span className="album-designer__value">{selectedElem.borderRadius}px</span>
                  </>
                )}
                <label className="album-designer__label">Rotation</label>
                <input type="range" min="0" max="360" value={selectedElem.rotation || 0}
                  onChange={e => updateElement(selectedElem.id, { rotation: Number(e.target.value) })}
                  className="album-designer__range" />
                <span className="album-designer__value">{selectedElem.rotation}°</span>
              </div>
            </div>
          )}

          <div className="album-designer__panel">
            <div className="album-designer__panel-header">
              <Download size={14} /> Export
            </div>
            <div className="album-designer__panel-body">
              <button className="album-designer__export-btn" onClick={() => handleExport('pdf')} disabled={!currentPage?.elements?.length || exporting}>
                {exporting ? <><Loader2 size={14} className="spin" /> Exporting...</> : <><FileDown size={14} /> Download PDF</>}
              </button>
              <button className="album-designer__export-btn album-designer__export-btn--secondary" onClick={() => handleExport('png')} disabled={!currentPage?.elements?.length || exporting}>
                Download PNG
              </button>
              <button className="album-designer__export-btn album-designer__export-btn--secondary" onClick={() => handleExport('jpeg')} disabled={!currentPage?.elements?.length || exporting}>
                Download JPEG
              </button>
            </div>
          </div>
        </div>

        <div className="album-designer__canvas-area" onClick={() => setSelectedElemId(null)}>
          <div className="album-designer__canvas-scroll">
            <div className="album-designer__page" style={{
              width: PAGE_W * 40 * zoom,
              height: PAGE_H * 40 * zoom,
              background: currentPage?.bgColor || '#ffffff',
            }}>
              {currentPage?.elements?.map((elem) => (
                <div key={elem.id} style={getElemStyle(elem)}
                  onMouseDown={(e) => handleElemMouseDown(e, elem)}>
                  {elem.type === 'text' ? (
                    <div style={{
                      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: elem.fontSize * zoom, fontFamily: elem.fontFamily || 'Georgia',
                      color: elem.color, textAlign: elem.align || 'center',
                      fontWeight: elem.bold ? 700 : 400, overflow: 'hidden', wordBreak: 'break-word',
                      padding: 4, boxSizing: 'border-box', pointerEvents: 'none', userSelect: 'none',
                    }}>
                      {elem.content}
                    </div>
                  ) : (
                    elem.src ? (
                      <img src={elem.src} alt="" style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        borderRadius: elem.borderRadius || 0, pointerEvents: 'none', userSelect: 'none',
                      }} draggable={false} />
                    ) : (
                      <div className="album-designer__empty-img">
                        <Image size={24} />
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

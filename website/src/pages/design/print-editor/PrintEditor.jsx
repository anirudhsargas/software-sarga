import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Canvas, Rect, Ellipse, Triangle as FabricTriangle, IText, FabricImage, Pattern, Line as FabricLine } from 'fabric';
import {
  ArrowLeft, Type, Square, Circle, Triangle, Image as ImageIcon,
  Upload, Download, ZoomIn, ZoomOut, Maximize, Trash2, Copy,
  Undo2, Redo2, Lock, Unlock, BringToFront, SendToBack,
  Sun, Moon, Grid3X3, Ruler, Plus, Minus, PaintBucket,
  AlignCenter, AlignLeft, AlignRight, AlignStartVertical, AlignEndVertical,
  Move, MousePointer2, Layers, Save, FileDown, Sparkles, QrCode,
  Group, Ungroup, Repeat, ChevronDown, ChevronUp, X
} from 'lucide-react';
import { findProduct, getCanvasDimensions, FONTS, FONT_SIZES, SHAPES } from '../../../lib/productConfig';
import './PrintEditor.css';

const DESIGN_API = '/api/website/designs';

export default function PrintEditor() {
  const navigate = useNavigate();
  const { productId, designId } = useParams();
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const historyRef = useRef({ past: [], future: [], max: 50, saving: false });
  const autosaveRef = useRef(null);

  const product = findProduct(productId || 'visiting-card');
  const dims = getCanvasDimensions(product);

  const [canvas, setCanvas] = useState(null);
  const [selectedObj, setSelectedObj] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState('select');
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [tab, setTab] = useState('elements');
  const [textContent, setTextContent] = useState('Text');
  const [textFont, setTextFont] = useState('Arial');
  const [textSize, setTextSize] = useState(24);
  const [textColor, setTextColor] = useState('#171717');
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [textAlign, setTextAlign] = useState('left');
  const [fillColor, setFillColor] = useState('#8b5cf6');
  const [strokeColor, setStrokeColor] = useState('#171717');
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [opacity, setOpacity] = useState(1);
  const [lockObj, setLockObj] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('png');
  const [exportDpi, setExportDpi] = useState(300);
  const [exportBg, setExportBg] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tabSub, setTabSub] = useState('templates');
  const [thumbCanvas, setThumbCanvas] = useState(null);

  const getScale = useCallback(() => 40 * zoom, [zoom]);

  const resetHistory = useCallback(() => {
    historyRef.current = { past: [], future: [], max: 50, saving: false };
  }, []);

  const saveToHistory = useCallback(() => {
    if (!fabricRef.current || historyRef.current.saving) return;
    const json = JSON.stringify(fabricRef.current.toJSON(['id', 'name', 'locked']));
    historyRef.current.past.push(json);
    if (historyRef.current.past.length > historyRef.current.max) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length || !fabricRef.current) return;
    h.saving = true;
    const current = JSON.stringify(fabricRef.current.toJSON(['id', 'name', 'locked']));
    h.future.push(current);
    const prev = h.past.pop();
    fabricRef.current.loadFromJSON(JSON.parse(prev), () => {
      fabricRef.current.renderAll();
      h.saving = false;
    });
  }, []);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length || !fabricRef.current) return;
    h.saving = true;
    const current = JSON.stringify(fabricRef.current.toJSON(['id', 'name', 'locked']));
    h.past.push(current);
    const next = h.future.pop();
    fabricRef.current.loadFromJSON(JSON.parse(next), () => {
      fabricRef.current.renderAll();
      h.saving = false;
    });
  }, []);

  useEffect(() => {
    if (canvasRef.current && !fabricRef.current) {
      const c = new Canvas(canvasRef.current, {
        width: dims.width,
        height: dims.height,
        backgroundColor: '#ffffff',
        preserveObjectStacking: true,
        stopContextMenu: true,
        fireRightClick: false,
      });

      c.on('object:modified', () => saveToHistory());
      c.on('object:added', (e) => { if (e.e) saveToHistory(); });
      c.on('object:removed', () => saveToHistory());
      c.on('selection:created', (e) => updateSelection(e.selected?.[0]));
      c.on('selection:updated', (e) => updateSelection(e.selected?.[0]));
      c.on('selection:cleared', () => updateSelection(null));
      c.on('object:moving', () => checkBounds());
      c.on('object:scaling', () => checkBounds());

      fabricRef.current = c;
      setCanvas(c);
      resetHistory();

      const grid = createGridPattern(dims.width / zoom, dims.height / zoom, getScale());
      c.setBackgroundColor(grid, () => c.renderAll());

      return () => {
        c.dispose();
        fabricRef.current = null;
      };
    }
  }, [productId]);

  function updateSelection(obj) {
    setSelectedObj(obj ? {
      id: obj.id,
      type: obj.type,
      left: obj.left,
      top: obj.top,
      width: obj.width * (obj.scaleX || 1),
      height: obj.height * (obj.scaleY || 1),
      angle: obj.angle,
      fill: obj.fill,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      opacity: obj.opacity,
      locked: obj.locked,
      text: obj.text,
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      fontWeight: obj.fontWeight,
      fontStyle: obj.fontStyle,
      textAlign: obj.textAlign,
      underline: obj.underline,
    } : null);

    if (obj) {
      setLockObj(!!obj.locked);
      setOpacity(obj.opacity ?? 1);
      if (obj.type === 'i-text' || obj.type === 'textbox') {
        setTextContent(obj.text || '');
        setTextFont(obj.fontFamily || 'Arial');
        setTextSize(obj.fontSize || 24);
        setTextColor(obj.fill || '#171717');
        setTextBold(obj.fontWeight === 'bold');
        setTextItalic(obj.fontStyle === 'italic');
        setTextUnderline(!!obj.underline);
        setTextAlign(obj.textAlign || 'left');
      } else {
        setFillColor(obj.fill || '#8b5cf6');
        setStrokeColor(obj.stroke || '#171717');
        setStrokeWidth(obj.strokeWidth || 1);
      }
    }
  }

  function createGridPattern(w, h, scale) {
    const size = 20;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x += size) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += size) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += size * 5) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += size * 5) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    return new Pattern({ source: canvas, repeat: 'repeat' });
  }

  function checkBounds() {
    if (!fabricRef.current) return;
    const c = fabricRef.current;
    const safeL = dims.bleedPx;
    const safeT = dims.bleedPx;
    const safeR = dims.width - dims.bleedPx;
    const safeB = dims.height - dims.bleedPx;
    c.getObjects().forEach((obj) => {
      const bounds = obj.getBoundingRect();
      const outside = bounds.left < safeL || bounds.top < safeT ||
        bounds.left + bounds.width > safeR ||
        bounds.top + bounds.height > safeB;
      obj.set({ opacity: outside ? 0.5 : 1 });
    });
    c.renderAll();
  }

  function handleKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const active = fabricRef.current?.getActiveObject();
      if (active) { fabricRef.current.remove(active); fabricRef.current.discardActiveObject(); fabricRef.current.renderAll(); }
    }
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    if (e.ctrlKey && e.key === 'c') { e.preventDefault(); copySelected(); }
    if (e.ctrlKey && e.key === 'v') { e.preventDefault(); pasteSelected(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
  }

  const keyHandlerRef = useRef(handleKeyDown);
  useEffect(() => { keyHandlerRef.current = handleKeyDown; });

  useEffect(() => {
    const handler = (e) => keyHandlerRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function copySelected() {
    const active = fabricRef.current?.getActiveObject();
    if (active) {
      active.clone((cloned) => { fabricRef.current.__clipboard = cloned; });
    }
  }

  function pasteSelected() {
    const clip = fabricRef.current?.__clipboard;
    if (!clip) return;
    clip.clone((cloned) => {
      cloned.set({ left: (cloned.left || 0) + 20, top: (cloned.top || 0) + 20, evented: true });
      if (cloned.type === 'activeSelection') {
        cloned.toGroup().then((g) => fabricRef.current.add(g));
      } else {
        fabricRef.current.add(cloned);
      }
      fabricRef.current.setActiveObject(cloned);
      fabricRef.current.renderAll();
    });
  }

  function addText() {
    if (!fabricRef.current) return;
    const txt = new IText(textContent || 'Text', {
      left: dims.width / 2 - 50,
      top: dims.height / 2 - 15,
      fontSize: textSize,
      fontFamily: textFont,
      fill: textColor,
      fontWeight: textBold ? 'bold' : 'normal',
      fontStyle: textItalic ? 'italic' : 'normal',
      underline: textUnderline,
      textAlign,
      id: `text_${Date.now()}`,
      name: 'Text',
    });
    fabricRef.current.add(txt);
    fabricRef.current.setActiveObject(txt);
    fabricRef.current.renderAll();
    saveToHistory();
  }

  function addShape(shape) {
    if (!fabricRef.current) return;
    const opts = {
      left: dims.width / 2 - 40,
      top: dims.height / 2 - 40,
      fill: fillColor,
      stroke: strokeColor,
      strokeWidth,
      opacity,
      id: `${shape}_${Date.now()}`,
      name: shape,
    };
    let obj;
    switch (shape) {
      case 'rect': obj = new Rect({ ...opts, width: 80, height: 80, rx: 0, ry: 0 }); break;
      case 'circle': obj = new Ellipse({ ...opts, rx: 40, ry: 40 }); break;
      case 'triangle': obj = new FabricTriangle({ ...opts, width: 80, height: 80 }); break;
      case 'line': obj = new FabricLine([0, 0, 160, 0], { ...opts, left: dims.width / 2 - 80, top: dims.height / 2, strokeWidth: 2 }); break;
      default: obj = new Rect({ ...opts, width: 80, height: 80 });
    }
    fabricRef.current.add(obj);
    fabricRef.current.setActiveObject(obj);
    fabricRef.current.renderAll();
    saveToHistory();
  }

  function addImage(src, opts = {}) {
    if (!fabricRef.current) return;
    FabricImage.fromURL(src, { crossOrigin: 'anonymous' }).then((img) => {
      const maxW = dims.width * 0.6;
      const maxH = dims.height * 0.6;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      img.set({
        left: opts.left || dims.width / 2 - (img.width * scale) / 2,
        top: opts.top || dims.height / 2 - (img.height * scale) / 2,
        scaleX: scale, scaleY: scale,
        id: `img_${Date.now()}`,
        name: 'Image',
      });
      fabricRef.current.add(img);
      fabricRef.current.setActiveObject(img);
      fabricRef.current.renderAll();
      saveToHistory();
    }).catch(() => {});
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => addImage(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function uploadToCloudinary(file) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'sarga_designs');
      fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'demo'}/image/upload`, {
        method: 'POST', body: formData,
      }).then(r => r.json()).then(d => resolve(d.secure_url)).catch(reject);
    });
  }

  function setCanvasZoom(z) {
    if (!fabricRef.current) return;
    fabricRef.current.setZoom(z);
    fabricRef.current.renderAll();
    setZoom(z);
  }

  function zoomIn() { setCanvasZoom(Math.min(zoom + 0.2, 3)); }
  function zoomOut() { setCanvasZoom(Math.max(zoom - 0.2, 0.2)); }
  function zoomFit() {
    if (!fabricRef.current) return;
    const vp = fabricRef.current;
    const scaleX = vp.getWidth() / dims.width;
    const scaleY = vp.getHeight() / dims.height;
    setCanvasZoom(Math.min(scaleX, scaleY) * 0.9);
  }

  function alignDir(dir) {
    const active = fabricRef.current?.getActiveObject();
    if (!active) return;
    const canvasW = dims.width;
    const canvasH = dims.height;
    const bounds = active.getBoundingRect();
    switch (dir) {
      case 'left': active.set('left', 0); break;
      case 'centerH': active.set('left', (canvasW - bounds.width) / 2); break;
      case 'right': active.set('left', canvasW - bounds.width); break;
      case 'top': active.set('top', 0); break;
      case 'centerV': active.set('top', (canvasH - bounds.height) / 2); break;
      case 'bottom': active.set('top', canvasH - bounds.height); break;
    }
    active.setCoords();
    fabricRef.current.renderAll();
    saveToHistory();
  }

  function toggleLock() {
    const active = fabricRef.current?.getActiveObject();
    if (!active) return;
    const newLock = !active.locked;
    active.set({ locked: newLock, evented: !newLock, selectable: !newLock });
    if (newLock) fabricRef.current.discardActiveObject();
    fabricRef.current.renderAll();
    setLockObj(newLock);
  }

  function moveLayer(dir) {
    const active = fabricRef.current?.getActiveObject();
    if (!active) return;
    if (dir === 'up') fabricRef.current.bringForward(active);
    else fabricRef.current.sendBackwards(active);
    fabricRef.current.renderAll();
  }

  function groupSelected() {
    const active = fabricRef.current?.getActiveObject();
    if (active && active.type === 'activeSelection') {
      active.toGroup().then((g) => { fabricRef.current.add(g); fabricRef.current.renderAll(); saveToHistory(); });
    }
  }

  function ungroupSelected() {
    const active = fabricRef.current?.getActiveObject();
    if (active && active.type === 'group') {
      active.toActiveSelection().then((s) => { fabricRef.current.setActiveObject(s); fabricRef.current.renderAll(); saveToHistory(); });
    }
  }

  async function handleExport() {
    if (!fabricRef.current) return;
    setExporting(true);
    try {
      const c = fabricRef.current;
      const scale = exportDpi / 96;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = dims.width * scale;
      exportCanvas.height = dims.height * scale;
      const ctx = exportCanvas.getContext('2d');
      if (exportBg) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      }
      const oldZoom = c.getZoom();
      c.setZoom(scale);

      if (exportFormat === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const dataUrl = c.toDataURL({ format: 'png', multiplier: 1 });
        const mmW = dims.actualWidthMm;
        const mmH = dims.actualHeightMm;
        const pdf = new jsPDF({ orientation: mmW > mmH ? 'landscape' : 'portrait', unit: 'mm', format: [mmW, mmH] });
        pdf.addImage(dataUrl, 'PNG', 0, 0, mmW, mmH);
        const pdfName = `${product?.name || 'design'}.pdf`;
        pdf.save(pdfName);
      } else {
        const mime = exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
        const ext = exportFormat === 'jpeg' ? 'jpg' : 'png';
        const dataUrl = c.toDataURL({ format: exportFormat === 'jpeg' ? 'jpeg' : 'png', multiplier: 1 });
        const link = document.createElement('a');
        link.download = `${product?.name || 'design'}.${ext}`;
        link.href = dataUrl;
        link.click();
      }

      c.setZoom(oldZoom);
      c.renderAll();
    } catch (err) {
      console.error('Export error:', err);
    }
    setExporting(false);
    setExportModal(false);
  }

  async function handleSave() {
    if (!fabricRef.current || !saveName.trim()) return;
    setSaving(true);
    try {
      const json = fabricRef.current.toJSON(['id', 'name', 'locked']);
      const thumb = fabricRef.current.toDataURL({ format: 'png', multiplier: 0.3 });
      const body = {
        name: saveName,
        productId: productId,
        designData: JSON.stringify(json),
        thumbnail: thumb,
      };
      const url = designId ? `${DESIGN_API}/${designId}` : DESIGN_API;
      const method = designId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Save error:', err);
    }
    setSaving(false);
  }

  async function loadDesign(id) {
    try {
      const res = await fetch(`${DESIGN_API}/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.design && fabricRef.current) {
        fabricRef.current.loadFromJSON(JSON.parse(data.design), () => {
          fabricRef.current.renderAll();
          resetHistory();
        });
        setSaveName(data.name || '');
      }
    } catch (err) {
      console.error('Load error:', err);
    }
  }

  async function loadTemplates() {
    try {
      const res = await fetch(`${DESIGN_API}/templates?product=${productId}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Templates error:', err);
    }
  }

  function applyTemplate(tpl) {
    if (!fabricRef.current || !tpl.design_data) return;
    fabricRef.current.loadFromJSON(JSON.parse(tpl.design_data), () => {
      fabricRef.current.renderAll();
      resetHistory();
    });
    setShowTemplates(false);
  }

  useEffect(() => {
    if (showTemplates) loadTemplates();
  }, [showTemplates, productId]);

  useEffect(() => {
    if (designId) loadDesign(designId);
  }, [designId]);

  useEffect(() => {
    loadSavedDesigns();
  }, []);

  const [savedDesigns, setSavedDesigns] = useState([]);

  async function loadSavedDesigns() {
    try {
      const res = await fetch(`${DESIGN_API}?product=${productId}`);
      if (res.ok) {
        const data = await res.json();
        setSavedDesigns(data.designs || []);
      }
    } catch (err) { /* ignore */ }
  }

  function updateSelectedProp(prop, value) {
    const active = fabricRef.current?.getActiveObject();
    if (!active) return;
    active.set(prop, value);
    active.setCoords();
    fabricRef.current.renderAll();
    saveToHistory();
    updateSelection(active);
  }

  function deleteSelected() {
    const active = fabricRef.current?.getActiveObject();
    if (active) {
      fabricRef.current.remove(active);
      fabricRef.current.discardActiveObject();
      fabricRef.current.renderAll();
    }
  }

  return (
    <div className={`print-editor ${darkMode ? 'dark' : ''}`}>
      {/* ─── Top Toolbar ─── */}
      <div className="pe-toolbar">
        <button className="pe-btn pe-btn--ghost" onClick={() => navigate('/design')}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="pe-toolbar__divider" />

        <button className={`pe-btn ${tool === 'select' ? 'pe-btn--active' : ''}`} onClick={() => { setTool('select'); if (fabricRef.current) fabricRef.current.isDrawingMode = false; }}>
          <MousePointer2 size={16} /> Select
        </button>
        <button className="pe-btn" onClick={addText}>
          <Type size={16} /> Text
        </button>
        <button className="pe-btn" onClick={() => addShape('rect')}>
          <Square size={16} /> Shape
        </button>
        <button className="pe-btn" onClick={() => fileInputRef.current?.click()}>
          <ImageIcon size={16} /> Image
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} hidden />

        <div className="pe-toolbar__divider" />
        <button className="pe-btn" onClick={undo} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
        <button className="pe-btn" onClick={redo} title="Redo (Ctrl+Y)"><Redo2 size={16} /></button>
        <button className="pe-btn" onClick={copySelected} title="Copy (Ctrl+C)"><Copy size={16} /></button>
        <button className="pe-btn" onClick={pasteSelected} title="Paste (Ctrl+V)"><Plus size={16} /></button>
        <button className="pe-btn pe-btn--danger" onClick={deleteSelected} title="Delete"><Trash2 size={16} /></button>

        <div className="pe-toolbar__divider" />
        <button className="pe-btn" onClick={groupSelected} title="Group"><Group size={16} /></button>
        <button className="pe-btn" onClick={ungroupSelected} title="Ungroup"><Ungroup size={16} /></button>

        <div className="pe-toolbar__spacer" />
        <span className="pe-toolbar__product-name">{product?.name}</span>
        <div className="pe-toolbar__spacer" />

        <button className="pe-btn" onClick={() => setShowGrid(g => !g)}>
          <Grid3X3 size={16} />
        </button>
        <button className="pe-btn" onClick={() => setShowRulers(g => !g)}>
          <Ruler size={16} />
        </button>
        <button className="pe-btn" onClick={() => setDarkMode(d => !d)}>
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="pe-toolbar__divider" />
        <button className="pe-btn" onClick={zoomOut}><ZoomOut size={16} /></button>
        <span className="pe-zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="pe-btn" onClick={zoomIn}><ZoomIn size={16} /></button>
        <button className="pe-btn" onClick={zoomFit}><Maximize size={16} /></button>

        <div className="pe-toolbar__divider" />
        <button className="pe-btn" onClick={() => setShowTemplates(true)}>
          <Repeat size={16} /> Templates
        </button>
        <button className="pe-btn pe-btn--primary" onClick={() => setExportModal(true)}>
          <Download size={16} /> Export
        </button>
        <button className="pe-btn pe-btn--primary" onClick={handleSave} disabled={!saveName.trim() || saving}>
          <Save size={16} /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      <div className="pe-body">
        {/* ─── Left Sidebar ─── */}
        <div className="pe-left">
          <div className="pe-left__tabs">
            <button className={`pe-left__tab ${tab === 'elements' ? 'active' : ''}`} onClick={() => setTab('elements')}>
              <Layers size={16} /> Elements
            </button>
            <button className={`pe-left__tab ${tab === 'layers' ? 'active' : ''}`} onClick={() => setTab('layers')}>
              <Menu size={16} /> Layers
            </button>
            <button className={`pe-left__tab ${tab === 'designs' ? 'active' : ''}`} onClick={() => setTab('designs')}>
              <Save size={16} /> My Designs
            </button>
          </div>

          <div className="pe-left__content">
            {tab === 'elements' && (
              <>
                <div className="pe-section">
                  <div className="pe-section__title">Text</div>
                  <div className="pe-text-controls">
                    <input type="text" className="pe-input" value={textContent} onChange={e => setTextContent(e.target.value)} placeholder="Type here..." />
                    <select className="pe-select" value={textFont} onChange={e => setTextFont(e.target.value)}>
                      {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="pe-text-row">
                      <select className="pe-select pe-select--sm" value={textSize} onChange={e => setTextSize(Number(e.target.value))}>
                        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="color" className="pe-color" value={textColor} onChange={e => setTextColor(e.target.value)} />
                      <button className={`pe-btn-icon ${textBold ? 'active' : ''}`} onClick={() => setTextBold(b => !b)}><b>B</b></button>
                      <button className={`pe-btn-icon ${textItalic ? 'active' : ''}`} onClick={() => setTextItalic(b => !b)}><i>I</i></button>
                      <button className={`pe-btn-icon ${textUnderline ? 'active' : ''}`} onClick={() => setTextUnderline(b => !b)}><u>U</u></button>
                    </div>
                    <button className="pe-btn pe-btn--block" onClick={addText}>Add Text</button>
                  </div>
                </div>

                <div className="pe-section">
                  <div className="pe-section__title">Shapes</div>
                  <div className="pe-shapes-grid">
                    {SHAPES.slice(0, 5).map(s => (
                      <button key={s} className="pe-shape-btn" onClick={() => addShape(s)}>
                        {s === 'rect' && <Square size={20} />}
                        {s === 'circle' && <Circle size={20} />}
                        {s === 'triangle' && <Triangle size={20} />}
                        {s === 'line' && <Minus size={20} />}
                        {s === 'polygon' && <Triangle size={20} />}
                        <span>{s}</span>
                      </button>
                    ))}
                  </div>
                  <div className="pe-color-row">
                    <label className="pe-label-sm">Fill</label>
                    <input type="color" className="pe-color" value={fillColor} onChange={e => setFillColor(e.target.value)} />
                    <label className="pe-label-sm">Stroke</label>
                    <input type="color" className="pe-color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} />
                  </div>
                </div>

                <div className="pe-section">
                  <div className="pe-section__title">Upload</div>
                  <button className="pe-btn pe-btn--block" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} /> Upload Image
                  </button>
                  <button className="pe-btn pe-btn--block" onClick={() => logoInputRef.current?.click()}>
                    <ImageIcon size={14} /> Upload Logo
                  </button>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleImageUpload} hidden />
                </div>

                <div className="pe-section">
                  <div className="pe-section__title">QR Code</div>
                  <button className="pe-btn pe-btn--block" onClick={() => {
                    const url = prompt('Enter URL for QR code:');
                    if (url) addQRCode(url);
                  }}>
                    <QrCode size={14} /> Generate QR Code
                  </button>
                </div>
              </>
            )}

            {tab === 'layers' && (
              <div className="pe-layers">
                {fabricRef.current?.getObjects()?.length === 0 && (
                  <div className="pe-empty-state">No objects on canvas</div>
                )}
                {fabricRef.current?.getObjects()?.slice().reverse().map((obj, i) => (
                  <div key={obj.id || i}
                    className={`pe-layer-item ${selectedObj?.id === obj.id ? 'active' : ''}`}
                    onClick={() => { fabricRef.current.setActiveObject(obj); fabricRef.current.renderAll(); }}>
                    <span className="pe-layer-icon">
                      {obj.type === 'i-text' || obj.type === 'textbox' ? <Type size={12} /> :
                       obj.type === 'rect' ? <Square size={12} /> :
                       obj.type === 'ellipse' ? <Circle size={12} /> :
                       obj.type === 'triangle' ? <Triangle size={12} /> :
                       obj.type === 'image' ? <ImageIcon size={12} /> : <Square size={12} />}
                    </span>
                    <span className="pe-layer-name">{obj.name || obj.type || 'Object'} {i + 1}</span>
                    <span className="pe-layer-opacity">{Math.round((obj.opacity || 1) * 100)}%</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'designs' && (
              <div className="pe-saved-list">
                {savedDesigns.length === 0 && <div className="pe-empty-state">No saved designs yet</div>}
                {savedDesigns.map(d => (
                  <div key={d.id} className="pe-saved-item" onClick={() => loadDesign(d.id)}>
                    <div className="pe-saved-thumb" style={{ background: d.thumbnail ? `url(${d.thumbnail}) center/cover` : 'var(--bg-secondary)' }} />
                    <div className="pe-saved-info">
                      <span className="pe-saved-name">{d.name}</span>
                      <span className="pe-saved-date">{new Date(d.updated_at || d.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Canvas Area ─── */}
        <div className="pe-canvas-area" style={{ background: darkMode ? '#1a1a2e' : '#e8e6e3' }}>
          <div className="pe-canvas-wrap">
            <canvas ref={canvasRef} />
            {showGrid && (
              <svg className="pe-bleed-overlay" width={dims.width} height={dims.height}
                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <rect x={dims.bleedPx} y={dims.bleedPx} width={dims.width - dims.bleedPx * 2} height={dims.height - dims.bleedPx * 2}
                  fill="none" stroke="rgba(220,38,38,0.3)" strokeWidth={1} strokeDasharray="4,3" />
                <rect x={dims.bleedPx + product.safeMargin * 40 * zoom / zoom} y={dims.bleedPx + product.safeMargin * 40 * zoom / zoom}
                  width={dims.width - (dims.bleedPx + product.safeMargin * 40 * zoom / zoom) * 2}
                  height={dims.height - (dims.bleedPx + product.safeMargin * 40 * zoom / zoom) * 2}
                  fill="none" stroke="rgba(37,99,235,0.25)" strokeWidth={1} strokeDasharray="2,3" />
              </svg>
            )}
          </div>
        </div>

        {/* ─── Right Properties Panel ─── */}
        <div className="pe-right">
          <div className="pe-section">
            <div className="pe-section__title">Properties</div>
            {!selectedObj ? (
              <div className="pe-empty-state">Select an object to edit</div>
            ) : (
              <div className="pe-props">
                <div className="pe-prop-row">
                  <label className="pe-label-sm">X</label>
                  <input type="number" className="pe-input-sm" value={Math.round(selectedObj.left || 0)} onChange={e => updateSelectedProp('left', Number(e.target.value))} />
                  <label className="pe-label-sm">Y</label>
                  <input type="number" className="pe-input-sm" value={Math.round(selectedObj.top || 0)} onChange={e => updateSelectedProp('top', Number(e.target.value))} />
                </div>
                <div className="pe-prop-row">
                  <label className="pe-label-sm">W</label>
                  <input type="number" className="pe-input-sm" value={Math.round(selectedObj.width || 0)} onChange={e => updateSelectedProp('width', Number(e.target.value))} />
                  <label className="pe-label-sm">H</label>
                  <input type="number" className="pe-input-sm" value={Math.round(selectedObj.height || 0)} onChange={e => updateSelectedProp('height', Number(e.target.value))} />
                </div>
                <div className="pe-prop-row">
                  <label className="pe-label-sm">Rotate</label>
                  <input type="number" className="pe-input-sm" value={Math.round(selectedObj.angle || 0)} onChange={e => updateSelectedProp('angle', Number(e.target.value))} />
                  <label className="pe-label-sm">Opacity</label>
                  <input type="number" className="pe-input-sm" min="0" max="1" step="0.05" value={opacity} onChange={e => { setOpacity(Number(e.target.value)); updateSelectedProp('opacity', Number(e.target.value)); }} />
                </div>

                {(selectedObj.type === 'i-text' || selectedObj.type === 'textbox') && (
                  <>
                    <div className="pe-prop-row">
                      <label className="pe-label-sm">Font</label>
                      <select className="pe-select-sm" value={selectedObj.fontFamily} onChange={e => updateSelectedProp('fontFamily', e.target.value)}>
                        {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div className="pe-prop-row">
                      <label className="pe-label-sm">Size</label>
                      <select className="pe-select-sm" value={selectedObj.fontSize} onChange={e => { setTextSize(Number(e.target.value)); updateSelectedProp('fontSize', Number(e.target.value)); }}>
                        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="color" className="pe-color-sm" value={selectedObj.fill || '#000'} onChange={e => updateSelectedProp('fill', e.target.value)} />
                    </div>
                    <div className="pe-prop-row">
                      <button className={`pe-btn-icon-sm ${selectedObj.fontWeight === 'bold' ? 'active' : ''}`} onClick={() => updateSelectedProp('fontWeight', selectedObj.fontWeight === 'bold' ? 'normal' : 'bold')}><b>B</b></button>
                      <button className={`pe-btn-icon-sm ${selectedObj.fontStyle === 'italic' ? 'active' : ''}`} onClick={() => updateSelectedProp('fontStyle', selectedObj.fontStyle === 'italic' ? 'normal' : 'italic')}><i>I</i></button>
                      <button className={`pe-btn-icon-sm ${selectedObj.underline ? 'active' : ''}`} onClick={() => updateSelectedProp('underline', !selectedObj.underline)}><u>U</u></button>
                    </div>
                  </>
                )}

                <div className="pe-prop-row">
                  <button className="pe-btn-icon-sm" onClick={toggleLock} title={lockObj ? 'Unlock' : 'Lock'}>
                    {lockObj ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                  <button className="pe-btn-icon-sm" onClick={() => moveLayer('up')} title="Bring Forward"><BringToFront size={14} /></button>
                  <button className="pe-btn-icon-sm" onClick={() => moveLayer('down')} title="Send Backward"><SendToBack size={14} /></button>
                  <button className="pe-btn-icon-sm" onClick={() => alignDir('left')} title="Align Left"><AlignLeft size={14} /></button>
                  <button className="pe-btn-icon-sm" onClick={() => alignDir('centerH')} title="Center H"><AlignCenter size={14} /></button>
                  <button className="pe-btn-icon-sm" onClick={() => alignDir('right')} title="Align Right"><AlignRight size={14} /></button>
                  <button className="pe-btn-icon-sm" onClick={() => alignDir('top')} title="Align Top"><AlignStartVertical size={14} /></button>
                  <button className="pe-btn-icon-sm" onClick={() => alignDir('centerV')} title="Center V"><AlignCenter size={14} /></button>
                  <button className="pe-btn-icon-sm" onClick={() => alignDir('bottom')} title="Align Bottom"><AlignEndVertical size={14} /></button>
                </div>
              </div>
            )}
          </div>

          <div className="pe-section">
            <div className="pe-section__title">Save</div>
            <input type="text" className="pe-input" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Design name..." />
          </div>

          <div className="pe-section">
            <div className="pe-section__title">Canvas</div>
            <div className="pe-prop-row">
              <button className={`pe-btn-icon-sm ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(g => !g)} title="Grid"><Grid3X3 size={14} /></button>
              <button className={`pe-btn-icon-sm ${showRulers ? 'active' : ''}`} onClick={() => setShowRulers(g => !g)} title="Rulers"><Ruler size={14} /></button>
              <button className={`pe-btn-icon-sm ${darkMode ? 'active' : ''}`} onClick={() => setDarkMode(d => !d)} title="Dark Mode">{darkMode ? <Sun size={14} /> : <Moon size={14} />}</button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Export Modal ─── */}
      {exportModal && (
        <div className="pe-modal-overlay" onClick={() => setExportModal(false)}>
          <div className="pe-modal" onClick={e => e.stopPropagation()}>
            <div className="pe-modal__header">
              <h3>Export Design</h3>
              <button className="pe-btn pe-btn--ghost" onClick={() => setExportModal(false)}><X size={18} /></button>
            </div>
            <div className="pe-modal__body">
              <div className="pe-modal__row">
                <label className="pe-label">Format</label>
                <select className="pe-select" value={exportFormat} onChange={e => setExportFormat(e.target.value)}>
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
              <div className="pe-modal__row">
                <label className="pe-label">DPI</label>
                <select className="pe-select" value={exportDpi} onChange={e => setExportDpi(Number(e.target.value))}>
                  <option value={72}>72 DPI (Web)</option>
                  <option value={150}>150 DPI (Draft)</option>
                  <option value={300}>300 DPI (Print)</option>
                  <option value={600}>600 DPI (High)</option>
                </select>
              </div>
              {exportFormat !== 'pdf' && (
                <div className="pe-modal__row">
                  <label className="pe-label">Background</label>
                  <label className="pe-checkbox">
                    <input type="checkbox" checked={exportBg} onChange={e => setExportBg(e.target.checked)} />
                    White background
                  </label>
                </div>
              )}
              <div className="pe-modal__info">
                <span>Size: {product?.width} × {product?.height} {product?.unit}</span>
                <span> | </span>
                <span>{exportDpi} DPI = {Math.round(product?.width * exportDpi)} × {Math.round(product?.height * exportDpi)} px</span>
              </div>
            </div>
            <div className="pe-modal__footer">
              <button className="pe-btn pe-btn--ghost" onClick={() => setExportModal(false)}>Cancel</button>
              <button className="pe-btn pe-btn--primary" onClick={handleExport} disabled={exporting}>
                {exporting ? 'Exporting...' : `Download ${exportFormat.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Templates Modal ─── */}
      {showTemplates && (
        <div className="pe-modal-overlay" onClick={() => setShowTemplates(false)}>
          <div className="pe-modal pe-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="pe-modal__header">
              <h3>Templates — {product?.name}</h3>
              <button className="pe-btn pe-btn--ghost" onClick={() => setShowTemplates(false)}><X size={18} /></button>
            </div>
            <div className="pe-modal__body">
              {templates.length === 0 && <div className="pe-empty-state">No templates yet</div>}
              <div className="pe-template-grid">
                {templates.map(t => (
                  <div key={t.id} className="pe-template-card" onClick={() => applyTemplate(t)}>
                    <div className="pe-template-thumb" style={{ background: t.thumbnail ? `url(${t.thumbnail}) center/cover` : 'var(--bg-secondary)' }} />
                    <div className="pe-template-name">{t.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function addQRCode(url) {
  // Placeholder — would use a QR generation library
  alert(`QR code for: ${url}\n(Integration with QR library needed)`);
}

function Menu({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}

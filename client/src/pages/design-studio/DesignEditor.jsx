import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Save, Undo2, Redo2, Eye, Download, Share2, Clock,
    Grid3X3, Search, Type, Image, Upload, Layers, Palette, Layout,
    Sun, Crop, Filter, Circle, Sliders, Eraser, Square, FlipHorizontal,
    FlipVertical, Copy, Trash2, AlignLeft, AlignCenter, AlignRight,
    AlignStartVertical, AlignEndVertical, AlignCenterVertical,
    Group, Lock, Unlock, BringToFront, SendToBack, ArrowUp, ArrowDown,
    ZoomIn, ZoomOut, Maximize2, Minimize2, Plus, Minus, X, PanelRight,
    BookOpen, Sparkles, Scissors, Printer
} from 'lucide-react';
import './DesignEditor.css';

const LEFT_PANELS = [
    { id: 'templates', icon: Layout, label: 'Templates' },
    { id: 'elements', icon: Plus, label: 'Elements' },
    { id: 'text', icon: Type, label: 'Text' },
    { id: 'gallery', icon: Image, label: 'Gallery' },
    { id: 'uploads', icon: Upload, label: 'Uploads' },
    { id: 'background', icon: Sun, label: 'Background' },
    { id: 'layers', icon: Layers, label: 'Layers' },
    { id: 'brand', icon: Palette, label: 'Brand Assets' },
    { id: 'matter', icon: BookOpen, label: 'Matter Library' },
];

const ZOOM_LEVELS = [25, 33, 50, 67, 75, 80, 100, 125, 150, 200];

const DesignEditor = () => {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const canvasRef = useRef(null);
    const [activePanel, setActivePanel] = useState(null);
    const [zoom, setZoom] = useState(100);
    const [selectedTool, setSelectedTool] = useState(null);
    const [selectedElements, setSelectedElements] = useState([]);
    const [showRightPanel, setShowRightPanel] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [showGuides, setShowGuides] = useState(true);
    const [isSaved, setIsSaved] = useState(true);
    const [docName, setDocName] = useState('Untitled Design');
    const [imageToolbar, setImageToolbar] = useState(null);

    const creationParams = location.state;

    const prevCreationParams = useRef(creationParams);
    useEffect(() => {
        if (creationParams?.name && creationParams !== prevCreationParams.current) {
            setDocName(creationParams.name);
            prevCreationParams.current = creationParams;
        }
    }, [creationParams]);

    const handleBack = () => navigate('/dashboard/design-studio');

    const handleSave = useCallback(() => {
        setIsSaved(true);
    }, []);

    const handleZoomIn = () => {
        setZoom(prev => {
            const next = ZOOM_LEVELS.find(z => z > prev);
            return next || ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
        });
    };

    const handleZoomOut = () => {
        setZoom(prev => {
            const next = [...ZOOM_LEVELS].reverse().find(z => z < prev);
            return next || ZOOM_LEVELS[0];
        });
    };

    const handleFitZoom = () => setZoom(100);

    const handleSelectElement = (elId) => {
        setSelectedElements(prev =>
            prev.includes(elId) ? prev.filter(id => id !== elId) : [...prev, elId]
        );
    };

    const handleImageAction = (action) => {
        setImageToolbar(null);
    };

    const togglePanel = (panelId) => {
        setActivePanel(prev => prev === panelId ? null : panelId);
    };

    const panelContent = LEFT_PANELS.find(p => p.id === activePanel);

    return (
        <div className="dse-layout">
            {/* ── Top Toolbar ─────────────────────────────── */}
            <header className="dse-topbar">
                <div className="dse-topbar-left">
                    <button className="dse-tb-btn" onClick={handleBack} title="Back">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="dse-doc-name">
                        <input
                            value={docName}
                            onChange={e => { setDocName(e.target.value); setIsSaved(false); }}
                            className="dse-doc-input"
                        />
                        {!isSaved && <span className="dse-unsaved">Unsaved</span>}
                    </div>
                </div>

                <div className="dse-topbar-center">
                    <button className="dse-tb-btn" onClick={handleSave} title="Save"><Save size={18} /></button>
                    <button className={`dse-tb-btn ${!isSaved ? 'active' : ''}`} title="Auto Save"><Clock size={18} /></button>
                    <div className="dse-sep" />
                    <button className="dse-tb-btn" title="Undo"><Undo2 size={18} /></button>
                    <button className="dse-tb-btn" title="Redo"><Redo2 size={18} /></button>
                    <div className="dse-sep" />
                    <button className="dse-tb-btn" title="Preview"><Eye size={18} /></button>
                    <button className="dse-tb-btn" title="Export"><Download size={18} /></button>
                    <button className="dse-tb-btn" title="Share"><Share2 size={18} /></button>
                    <button className="dse-tb-btn" title="Version History"><Clock size={18} /></button>
                </div>

                <div className="dse-topbar-right">
                    <div className="dse-zoom-controls">
                        <button className="dse-tb-btn" onClick={handleZoomOut} title="Zoom Out"><ZoomOut size={16} /></button>
                        <span className="dse-zoom-value" onClick={handleFitZoom}>{zoom}%</span>
                        <button className="dse-tb-btn" onClick={handleZoomIn} title="Zoom In"><ZoomIn size={16} /></button>
                    </div>
                    <button className={`dse-tb-btn ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(!showGrid)} title="Grid">
                        <Grid3X3 size={16} />
                    </button>
                    <button className={`dse-tb-btn ${showGuides ? 'active' : ''}`} onClick={() => setShowGuides(!showGuides)} title="Guides">
                        <Scissors size={16} />
                    </button>
                    <button className={`dse-tb-btn ${showRightPanel ? 'active' : ''}`} onClick={() => setShowRightPanel(!showRightPanel)} title="Properties">
                        <PanelRight size={18} />
                    </button>
                </div>
            </header>

            <div className="dse-body">
                {/* ── Left Sidebar ────────────────────────── */}
                <aside className="dse-sidebar-left">
                    {LEFT_PANELS.map(panel => (
                        <button
                            key={panel.id}
                            className={`dse-sidebar-btn ${activePanel === panel.id ? 'active' : ''}`}
                            onClick={() => togglePanel(panel.id)}
                            title={panel.label}
                        >
                            <panel.icon size={20} />
                            <span>{panel.label}</span>
                        </button>
                    ))}
                </aside>

                {/* ── Left Panel Content ──────────────────── */}
                {panelContent && (
                    <div className="dse-panel dse-panel-left">
                        <div className="dse-panel-header">
                            <h3>{panelContent.label}</h3>
                            <button className="dse-tb-btn" onClick={() => setActivePanel(null)}><X size={16} /></button>
                        </div>
                        <div className="dse-panel-body">
                            {activePanel === 'templates' && (
                                <div className="dse-panel-section">
                                    <div className="dse-panel-search">
                                        <Search size={14} />
                                        <input type="text" placeholder="Search templates..." />
                                    </div>
                                    <div className="dse-template-cats">
                                        {['Wedding', 'Album', 'Visiting', 'Premium'].map(cat => (
                                            <button key={cat} className="dse-tag">{cat}</button>
                                        ))}
                                    </div>
                                    <div className="dse-template-grid">
                                        {[1, 2, 3, 4, 5, 6].map(i => (
                                            <div key={i} className="dse-template-item">
                                                <div className="dse-template-thumb">
                                                    <div className="dse-template-placeholder">
                                                        <Layout size={24} />
                                                    </div>
                                                </div>
                                                <div className="dse-template-actions">
                                                    <button className="dse-btn-sm">Apply</button>
                                                    <button className="dse-btn-sm dse-btn-sm-ghost">Preview</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {activePanel === 'elements' && (
                                <div className="dse-panel-section">
                                    <div className="dse-panel-search">
                                        <Search size={14} />
                                        <input type="text" placeholder="Search elements..." />
                                    </div>
                                    <div className="dse-elements-grid">
                                        {['Circle', 'Square', 'Line', 'Triangle', 'Star', 'Heart'].map(el => (
                                            <button key={el} className="dse-element-btn" draggable>
                                                {el === 'Circle' && <Circle size={24} />}
                                                {el === 'Square' && <Square size={24} />}
                                                {el === 'Line' && <Minus size={24} />}
                                                {el === 'Star' && <Sparkles size={24} />}
                                                {el === 'Heart' && <span style={{ fontSize: 20 }}>♥</span>}
                                                {el === 'Triangle' && <span style={{ fontSize: 20 }}>△</span>}
                                                <span>{el}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {activePanel === 'text' && (
                                <div className="dse-panel-section">
                                    <button className="dse-btn-full">
                                        <Plus size={16} /> Add Text Box
                                    </button>
                                    <div className="dse-panel-search" style={{ marginTop: 12 }}>
                                        <Search size={14} />
                                        <input type="text" placeholder="Search fonts..." />
                                    </div>
                                    <div className="dse-font-list">
                                        {['Plus Jakarta Sans', 'Space Grotesk', 'Playfair Display', 'DM Serif', 'Inter', 'Roboto'].map(f => (
                                            <button key={f} className="dse-font-item" style={{ fontFamily: f }}>
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {activePanel === 'uploads' && (
                                <div className="dse-panel-section">
                                    <div className="dse-upload-area">
                                        <Upload size={32} />
                                        <p>Drop files here or click to upload</p>
                                        <button className="ds-btn ds-btn-primary">Choose Files</button>
                                    </div>
                                </div>
                            )}
                            {activePanel === 'layers' && (
                                <div className="dse-panel-section">
                                    <p className="dse-panel-hint">No layers yet. Add elements to your canvas.</p>
                                </div>
                            )}
                            {activePanel === 'brand' && (
                                <div className="dse-panel-section">
                                    <p className="dse-panel-hint">Brand assets will appear here. Upload logos, colors, and fonts.</p>
                                </div>
                            )}
                            {activePanel === 'matter' && (
                                <div className="dse-panel-section">
                                    <p className="dse-panel-hint">Wedding matter templates and text blocks.</p>
                                </div>
                            )}
                            {activePanel === 'background' && (
                                <div className="dse-panel-section">
                                    <div className="dse-color-row">
                                        <span>Background Color</span>
                                        <input type="color" className="dse-color-picker" defaultValue="#ffffff" />
                                    </div>
                                    <div className="dse-panel-search" style={{ marginTop: 12 }}>
                                        <Search size={14} />
                                        <input type="text" placeholder="Search backgrounds..." />
                                    </div>
                                </div>
                            )}
                            {activePanel === 'gallery' && (
                                <div className="dse-panel-section">
                                    <p className="dse-panel-hint">Stock photos and design elements.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Canvas Area ─────────────────────────── */}
                <main className={`dse-canvas-area ${showGrid ? 'dse-canvas-gridded' : ''}`}>
                    {selectedElements.length > 1 && (
                        <div className="dse-multi-toolbar">
                            <button className="dse-tb-btn" title="Group"><Group size={16} /></button>
                            <button className="dse-tb-btn" title="Duplicate"><Copy size={16} /></button>
                            <button className="dse-tb-btn" title="Align Left"><AlignLeft size={16} /></button>
                            <button className="dse-tb-btn" title="Align Center"><AlignCenter size={16} /></button>
                            <button className="dse-tb-btn" title="Align Right"><AlignRight size={16} /></button>
                            <div className="dse-sep" />
                            <button className="dse-tb-btn" title="Align Top"><AlignStartVertical size={16} /></button>
                            <button className="dse-tb-btn" title="Align Middle"><AlignCenterVertical size={16} /></button>
                            <button className="dse-tb-btn" title="Align Bottom"><AlignEndVertical size={16} /></button>
                            <div className="dse-sep" />
                            <button className="dse-tb-btn" title="Distribute"><Minimize2 size={16} /></button>
                            <div className="dse-sep" />
                            <button className="dse-tb-btn" title="Lock"><Lock size={16} /></button>
                            <button className="dse-tb-btn" title="Delete"><Trash2 size={16} /></button>
                        </div>
                    )}

                    {imageToolbar && (
                        <div className="dse-image-toolbar">
                            <button onClick={() => handleImageAction('replace')}><Image size={14} /> Replace</button>
                            <button onClick={() => handleImageAction('adjust')}><Sliders size={14} /> Adjust</button>
                            <button onClick={() => handleImageAction('crop')}><Crop size={14} /> Crop</button>
                            <button onClick={() => handleImageAction('filter')}><Filter size={14} /> Filter</button>
                            <button onClick={() => handleImageAction('shadow')}><Circle size={14} /> Shadow</button>
                            <button onClick={() => handleImageAction('bgremoval')}><Erase size={14} /> Remove BG</button>
                            <div className="dse-sep" />
                            <button onClick={() => handleImageAction('opacity')}><Sun size={14} /> Opacity</button>
                            <button onClick={() => handleImageAction('border')}><Square size={14} /> Border</button>
                            <button onClick={() => handleImageAction('mask')}><Circle size={14} /> Mask</button>
                            <div className="dse-sep" />
                            <button onClick={() => handleImageAction('rotate')}><FlipHorizontal size={14} /> Rotate</button>
                            <button onClick={() => handleImageAction('flip')}><FlipVertical size={14} /> Flip</button>
                            <div className="dse-sep" />
                            <button onClick={() => handleImageAction('duplicate')}><Copy size={14} /> Duplicate</button>
                            <button className="danger" onClick={() => handleImageAction('delete')}><Trash2 size={14} /> Delete</button>
                        </div>
                    )}

                    <div className="dse-canvas-container" ref={canvasRef}>
                        <div
                            className="dse-canvas"
                            style={{
                                width: creationParams?.width ? `${creationParams.width * (zoom / 100) * 3.78}px` : '600px',
                                height: creationParams?.height ? `${creationParams.height * (zoom / 100) * 3.78}px` : '800px',
                                background: '#fff',
                            }}
                        >
                            {showGuides && (
                                <>
                                    <div className="dse-guide dse-guide-h" style={{ top: '20px' }} />
                                    <div className="dse-guide dse-guide-h" style={{ bottom: '20px' }} />
                                    <div className="dse-guide dse-guide-v" style={{ left: '20px' }} />
                                    <div className="dse-guide dse-guide-v" style={{ right: '20px' }} />
                                </>
                            )}
                            {creationParams?.printReady && (
                                <div className="dse-print-badge-canvas">Print Ready</div>
                            )}
                            <div className="dse-canvas-center-hint">
                                <Layout size={48} strokeWidth={1} />
                                <p>Drag elements here or use the sidebar to add content</p>
                            </div>
                        </div>
                    </div>
                </main>

                {/* ── Right Properties Panel ──────────────── */}
                {showRightPanel && (
                    <aside className="dse-panel dse-panel-right">
                        <div className="dse-panel-header">
                            <h3>Properties</h3>
                        </div>
                        <div className="dse-panel-body">
                            <div className="dse-panel-section">
                                <h4 className="dse-prop-title">Canvas Size</h4>
                                <div className="dse-prop-row">
                                    <div className="dse-prop-field">
                                        <label>W</label>
                                        <input type="number" value={creationParams?.width || 12} />
                                    </div>
                                    <div className="dse-prop-field">
                                        <label>H</label>
                                        <input type="number" value={creationParams?.height || 18} />
                                    </div>
                                    <div className="dse-prop-field">
                                        <label>Unit</label>
                                        <select value={creationParams?.unit || 'inch'}>
                                            <option>inch</option>
                                            <option>mm</option>
                                            <option>cm</option>
                                            <option>px</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="dse-panel-section">
                                <h4 className="dse-prop-title">Layer Controls</h4>
                                <button className="dse-btn-full"><BringToFront size={14} /> Bring to Front</button>
                                <button className="dse-btn-full"><ArrowUp size={14} /> Move Forward</button>
                                <button className="dse-btn-full"><ArrowDown size={14} /> Move Backward</button>
                                <button className="dse-btn-full"><SendToBack size={14} /> Send to Back</button>
                            </div>

                            <div className="dse-panel-section">
                                <h4 className="dse-prop-title">Alignment</h4>
                                <div className="dse-align-grid">
                                    <button className="dse-tb-btn"><AlignLeft size={16} /></button>
                                    <button className="dse-tb-btn"><AlignCenter size={16} /></button>
                                    <button className="dse-tb-btn"><AlignRight size={16} /></button>
                                    <button className="dse-tb-btn"><AlignStartVertical size={16} /></button>
                                    <button className="dse-tb-btn"><AlignCenterVertical size={16} /></button>
                                    <button className="dse-tb-btn"><AlignEndVertical size={16} /></button>
                                </div>
                            </div>

                            <div className="dse-panel-section">
                                <h4 className="dse-prop-title">Effects</h4>
                                <button className="dse-btn-full"><Sun size={14} /> Shadow</button>
                                <button className="dse-btn-full"><Circle size={14} /> Blur</button>
                                <button className="dse-btn-full"><Palette size={14} /> Color Overlay</button>
                            </div>
                        </div>
                    </aside>
                )}
            </div>

            {/* ── Bottom Bar ──────────────────────────────── */}
            <footer className="dse-bottombar">
                <div className="dse-bottombar-left">
                    <span className="dse-bottombar-item"><Printer size={14} /> 300 DPI</span>
                    <span className="dse-bottombar-item">Bleed: 3mm</span>
                    <span className="dse-bottombar-item"><Eye size={14} /> Print Preview</span>
                    <span className="dse-bottombar-item"><Palette size={14} /> CMYK</span>
                </div>
                <div className="dse-bottombar-right">
                    <span className="dse-bottombar-item">{creationParams?.width || 12} × {creationParams?.height || 18} {creationParams?.unit || 'inch'}</span>
                </div>
            </footer>
        </div>
    );
};

export default DesignEditor;

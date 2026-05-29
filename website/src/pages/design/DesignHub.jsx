import { useNavigate } from 'react-router-dom';
import { Layout, BookOpen, ArrowRight, Sparkles, Image, Crop, Ruler, Palette, Type, Download, Layers, PenTool, Upload, FileText, CheckCircle, Zap, Shield, Smile } from 'lucide-react';
import './DesignHub.css';

const tools = [
  {
    id: 'sheet-layout',
    icon: Layout,
    title: 'Photo Sheet Layout',
    tagline: 'Arrange photos on print-ready sheets',
    description: 'Upload multiple photos and instantly arrange them on standard 13×19 inch printing sheets. Drag, resize, rotate — then export as print-ready PDF at up to 600 DPI.',
    features: ['Auto-arrange', 'Smart pack', 'Drag & resize', 'Size presets', 'PDF/PNG export'],
    path: '/design/sheet-layout',
    color: '#7c3aed',
    highlights: [
      { icon: Image, text: 'Upload & arrange' },
      { icon: Crop, text: 'Resize handles' },
      { icon: Download, text: '300 DPI export' },
    ],
  },
  {
    id: 'print-editor',
    icon: PenTool,
    title: 'Print Product Designer',
    tagline: 'Full Fabric.js canvas editor',
    description: 'Design visiting cards, wedding cards, banners, posters, ID cards, and more with a professional drag-and-drop editor. Add text, images, shapes, QR codes, and export print-ready files at up to 600 DPI.',
    features: ['7 product types', 'Fabric.js canvas', 'Text & shapes', 'Undo/redo', '600 DPI export'],
    path: '/design/print-editor',
    color: '#f59e0b',
    highlights: [
      { icon: PenTool, text: 'Full editor' },
      { icon: Layers, text: 'Layer mgmt' },
      { icon: Download, text: 'Print-ready' },
    ],
  },
  {
    id: 'upload-design',
    icon: Upload,
    title: 'Upload Your Design',
    tagline: 'Send us your existing design files',
    description: 'Already have a print-ready design? Upload PDF, PNG, JPG, PSD or AI files and our team will handle the printing. Add notes for specifications.',
    features: ['PDF/PNG/JPG', 'PSD/AI support', 'Drag & drop', 'Design support'],
    path: '/design/upload-design',
    color: '#10b981',
    highlights: [
      { icon: Upload, text: 'Drag & drop' },
      { icon: FileText, text: 'Multi-format' },
      { icon: CheckCircle, text: 'Quick submit' },
    ],
  },
  {
    id: 'album',
    icon: BookOpen,
    title: 'Album Page Designer',
    tagline: 'Design beautiful photo albums',
    description: 'Create stunning multi-page wedding albums, photo books, and custom print albums. Add text overlays, decorative PNG elements, and premium backgrounds.',
    features: ['Multi-page', 'Text editor', 'PNG decorations', 'Backgrounds', 'PDF export'],
    path: '/design/album',
    color: '#db2777',
    highlights: [
      { icon: Layers, text: 'Multi-page' },
      { icon: Type, text: 'Text layers' },
      { icon: Palette, text: 'Decorations' },
    ],
  },
];

export default function DesignHub() {
  const navigate = useNavigate();

  return (
    <div className="design-hub">
      <section className="dh-hero">
        <div className="dh-hero__glow" />
        <div className="dh-hero__grid" />
        <div className="dh-hero__content">
          <div className="dh-hero__badge">
            <Sparkles size={13} />
            <span>Print Design Studio</span>
          </div>
          <h1 className="dh-hero__title">
            Design<span className="dh-hero__title-accent"> & Print</span>
          </h1>
          <p className="dh-hero__sub">
            Create print-ready photo layouts and custom album pages — no design experience needed.
            Upload your photos, arrange with drag-and-drop, and export as high-quality PDF.
          </p>
          <div className="dh-hero__stats">
            <div className="dh-hero__stat">
              <span className="dh-hero__stat-val">13×19"</span>
              <span className="dh-hero__stat-lbl">Print Sheet</span>
            </div>
            <div className="dh-hero__stat">
              <span className="dh-hero__stat-val">300 DPI</span>
              <span className="dh-hero__stat-lbl">Print Ready</span>
            </div>
            <div className="dh-hero__stat">
              <span className="dh-hero__stat-val">PDF</span>
              <span className="dh-hero__stat-lbl">Export</span>
            </div>
          </div>
        </div>
      </section>

      <section className="dh-tools">
        <div className="dh-tools__header">
          <h2 className="dh-section-title">Choose a Tool</h2>
          <p className="dh-section-sub">Select the design tool that fits your project</p>
        </div>

        <div className="dh-grid">
          {tools.map((tool, i) => (
            <button
              key={tool.id}
              className="dh-card"
              style={{ '--tool-color': tool.color }}
              onClick={() => navigate(tool.path)}
            >
              <div className="dh-card__bar" style={{ background: tool.color }} />
              <div className="dh-card__body">
                <div className="dh-card__top">
                  <div className="dh-card__icon" style={{ background: `${tool.color}18`, color: tool.color }}>
                    <tool.icon size={24} />
                  </div>
                  <div className="dh-card__header">
                    <h3 className="dh-card__title">{tool.title}</h3>
                    <p className="dh-card__tagline">{tool.tagline}</p>
                  </div>
                </div>
                <p className="dh-card__desc">{tool.description}</p>
                <div className="dh-card__highlights">
                  {tool.highlights.map((h, j) => (
                    <span key={j} className="dh-card__hl">
                      <h.icon size={11} />
                      {h.text}
                    </span>
                  ))}
                </div>
                <div className="dh-card__features">
                  {tool.features.map((f, j) => (
                    <span key={j} className="dh-card__chip">{f}</span>
                  ))}
                </div>
              </div>
              <div className="dh-card__cta" style={{ '--tool-color': tool.color }}>
                <span>Open Tool</span>
                <ArrowRight size={15} className="dh-card__arrow" />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="dh-features">
        <h2 className="dh-section-title">Why Use Our Design Tools?</h2>
        <div className="dh-features__grid">
          <div className="dh-feature">
            <div className="dh-feature__icon" style={{ background: 'rgba(124,58,237,0.12)', color: '#7c3aed' }}>
              <Ruler size={20} />
            </div>
            <h4>Print-Ready Output</h4>
            <p>Export at 300-600 DPI with crop marks and bleed, ready for professional printing.</p>
          </div>
          <div className="dh-feature">
            <div className="dh-feature__icon" style={{ background: 'rgba(219,39,119,0.12)', color: '#db2777' }}>
              <Layers size={20} />
            </div>
            <h4>Multi-Page Albums</h4>
            <p>Create entire wedding albums and photo books with unlimited pages and consistent styling.</p>
          </div>
          <div className="dh-feature">
            <div className="dh-feature__icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
              <Smile size={20} />
            </div>
            <h4>No Design Skills Needed</h4>
            <p>Auto-arrange and smart pack algorithms do the heavy lifting. Just upload and export.</p>
          </div>
          <div className="dh-feature">
            <div className="dh-feature__icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
              <Shield size={20} />
            </div>
            <h4>Fast & Reliable</h4>
            <p>Export multiple sheets in seconds. Your data stays local — nothing is uploaded to any server.</p>
          </div>
          <div className="dh-feature">
            <div className="dh-feature__icon" style={{ background: 'rgba(234,179,8,0.12)', color: '#ca8a04' }}>
              <Zap size={20} />
            </div>
            <h4>Instant Previews</h4>
            <p>See every change in real time. Zoom, pan, and inspect details before you export.</p>
          </div>
          <div className="dh-feature">
            <div className="dh-feature__icon" style={{ background: 'rgba(139,0,0,0.12)', color: 'var(--red-accent)' }}>
              <FileText size={20} />
            </div>
            <h4>Multiple Export Formats</h4>
            <p>Download as PDF, PNG, or JPEG. Choose DPI, color profile, and page size for any printer.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

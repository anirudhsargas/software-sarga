import { useNavigate } from 'react-router-dom';
import { CreditCard, Heart, Flag, Image, IdCard, Frame, Award, ArrowRight, Sparkles } from 'lucide-react';
import { PRODUCT_TYPES } from '../../../lib/productConfig';
import './FabricEditorHub.css';

const iconMap = { CreditCard, Heart: Heart, Flag, Image, IdCard, Frame: Frame, Award };

export default function FabricEditorHub() {
  const navigate = useNavigate();

  return (
    <div className="fe-hub">
      <div className="fe-hub__hero">
        <div className="fe-hub__badge"><Sparkles size={14} /> Print Design Studio</div>
        <h1 className="fe-hub__title">Choose Your Product</h1>
        <p className="fe-hub__subtitle">
          Select a print product to start designing. Customize every detail with our online editor.
        </p>
      </div>
      <div className="fe-hub__grid">
        {PRODUCT_TYPES.map((p) => {
          const Icon = iconMap[p.icon] || Image;
          return (
            <button key={p.id} className="fe-hub__card" onClick={() => navigate(`/design/print-editor/${p.id}`)}>
              <div className="fe-hub__card-icon" style={{ background: getColor(p.id).bg, color: getColor(p.id).fg }}>
                <Icon size={28} />
              </div>
              <h3 className="fe-hub__card-title">{p.name}</h3>
              <p className="fe-hub__card-desc">{p.description}</p>
              <div className="fe-hub__card-specs">
                <span>{p.width}×{p.height}{p.unit}</span>
                <span>{p.dpi} DPI</span>
                {p.bleed > 0 && <span>Bleed: {p.bleed}"</span>}
              </div>
              <span className="fe-hub__card-cta">
                Design Now <ArrowRight size={14} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getColor(id) {
  const colors = {
    'visiting-card': { bg: 'rgba(59,130,246,0.1)', fg: '#3b82f6' },
    'wedding-card': { bg: 'rgba(236,72,153,0.1)', fg: '#ec4899' },
    'flex-banner': { bg: 'rgba(245,158,11,0.1)', fg: '#f59e0b' },
    'poster': { bg: 'rgba(16,185,129,0.1)', fg: '#10b981' },
    'id-card': { bg: 'rgba(139,92,246,0.1)', fg: '#8b5cf6' },
    'photo-frame': { bg: 'rgba(59,130,246,0.1)', fg: '#3b82f6' },
    'memento': { bg: 'rgba(239,68,68,0.1)', fg: '#ef4444' },
  };
  return colors[id] || { bg: 'rgba(107,114,128,0.1)', fg: '#6b7280' };
}

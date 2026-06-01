import { useState, useRef, useEffect } from 'react';

const FINISH_EFFECTS = {
  'gold-foil': {
    label: 'Gold Foil',
    color: '#d4a843',
    gradient: 'linear-gradient(135deg, #d4a843, #f7e8a0, #d4a843, #f7e8a0)',
    description: 'Premium gold metallic finish',
    overlayStyle: { mixBlendMode: 'color' },
  },
  'silver-foil': {
    label: 'Silver Foil',
    color: '#c0c0c0',
    gradient: 'linear-gradient(135deg, #c0c0c0, #f0f0f0, #c0c0c0, #f0f0f0)',
    description: 'Elegant silver metallic finish',
    overlayStyle: { mixBlendMode: 'color' },
  },
  'spot-uv': {
    label: 'Spot UV',
    color: 'rgba(255,255,255,0.15)',
    gradient: 'linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.05))',
    description: 'High-gloss selective coating',
    overlayStyle: { mixBlendMode: 'overlay' },
  },
  embossing: {
    label: 'Embossing',
    color: 'rgba(0,0,0,0.08)',
    gradient: 'radial-gradient(circle at 50% 40%, rgba(0,0,0,0.12), transparent)',
    description: 'Raised relief effect',
    overlayStyle: { mixBlendMode: 'multiply' },
  },
  debossing: {
    label: 'Debossing',
    color: 'rgba(0,0,0,0.12)',
    gradient: 'radial-gradient(circle at 50% 60%, rgba(0,0,0,0.15), transparent)',
    description: 'Indented depressed effect',
    overlayStyle: { mixBlendMode: 'multiply' },
  },
  'foil-stamping': {
    label: 'Foil Stamping',
    color: '#b8860b',
    gradient: 'linear-gradient(135deg, #b8860b, #ffd700, #b8860b, #ffd700)',
    description: 'Hot foil stamping finish',
    overlayStyle: { mixBlendMode: 'color' },
  },
};

export default function FinishSimulator({ designUrl, productName = 'Design Preview', width = 400, height = 300 }) {
  const [activeFinish, setActiveFinish] = useState(null);
  const [rotation, setRotation] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (activeFinish) {
      intervalRef.current = setInterval(() => setRotation(r => (r + 1) % 360), 50);
    } else {
      clearInterval(intervalRef.current);
      setRotation(0);
    }
    return () => clearInterval(intervalRef.current);
  }, [activeFinish]);

  const finish = activeFinish ? FINISH_EFFECTS[activeFinish] : null;

  return (
    <div className="space-y-4">
      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
        style={{ width, height, perspective: '800px' }}>
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `rotateY(${rotation * 0.5}deg)`, transition: 'transform 0.05s linear' }}>
          {designUrl ? (
            <img src={designUrl} alt={productName}
              className="w-full h-full object-contain" />
          ) : (
            <div className="text-center text-gray-400 p-8">
              <svg className="w-16 h-16 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Upload a design to preview finishes</p>
            </div>
          )}
        </div>
        {finish && (
          <div className="absolute inset-0 pointer-events-none"
            style={{
              background: finish.gradient,
              ...finish.overlayStyle,
              animation: 'shimmer 2s ease-in-out infinite',
            }} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {Object.entries(FINISH_EFFECTS).map(([key, f]) => (
          <button key={key} onClick={() => setActiveFinish(activeFinish === key ? null : key)}
            className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
              activeFinish === key
                ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-300'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}>
            <span className="block">{f.label}</span>
          </button>
        ))}
      </div>

      {finish && <p className="text-xs text-gray-500">{finish.description}</p>}

      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

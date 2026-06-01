import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function StickyQuoteWidget() {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobile) return null;

  return (
    <div className="sticky-quote-widget" style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 401
    }}>
      <button 
        className="btn btn-primary" 
        onClick={() => navigate('/contact')}
        style={{
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          borderRadius: 'var(--radius-full)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          background: 'var(--accent)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        aria-label="Request a custom quote"
      >
        <MessageSquare size={20} /> Request Custom Quote
      </button>
    </div>
  );
}

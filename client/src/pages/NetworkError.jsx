import React from 'react';
import { WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NetworkError = () => {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
      <WifiOff size={48} className="text-warning" />
      <h1 style={{ fontSize: 28, marginTop: 12 }}>Network Error</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560, textAlign: 'center' }}>
        We couldn't reach the server. Check your internet connection and try again.
      </p>
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
        <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => navigate('/', { replace: true })}>Go Home</button>
      </div>
    </div>
  );
};

export default NetworkError;

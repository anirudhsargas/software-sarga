import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ServerError = () => {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
      <AlertTriangle size={48} className="text-danger" />
      <h1 style={{ fontSize: 28, marginTop: 12 }}>Server Error</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560, textAlign: 'center' }}>
        The server encountered an unexpected error. The team has been notified. Please try again later.
      </p>
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>Go Home</button>
        <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => window.location.reload()}>Reload</button>
      </div>
    </div>
  );
};

export default ServerError;

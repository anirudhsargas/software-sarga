import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '2rem'
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--text-light, var(--muted))', margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.1rem', color: 'var(--text-muted, var(--muted))', marginBottom: '1.5rem' }}>
        Page not found. The page you're looking for doesn't exist.
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
        Go to Dashboard
      </button>
    </div>
  );
};

export default NotFound;

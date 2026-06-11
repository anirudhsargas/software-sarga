import React from 'react';

const ErrorPage = React.memo(({ icon: Icon, title, message, suggestion, actions }) => {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: 24, textAlign: 'center'
    }}>
      {Icon && <Icon size={48} style={{ marginBottom: 12 }} />}
      <h1 style={{ fontSize: 28, margin: '0 0 8px', fontWeight: 700 }}>{title}</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.6, margin: '0 0 4px' }}>
        {message}
      </p>
      {suggestion && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 440, margin: '4px 0 0', fontStyle: 'italic' }}>
          {suggestion}
        </p>
      )}
      {actions && actions.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions.map((action, i) => (
            <button
              key={i}
              className={action.variant === 'ghost' ? 'btn btn-ghost' : 'btn btn-primary'}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default ErrorPage;

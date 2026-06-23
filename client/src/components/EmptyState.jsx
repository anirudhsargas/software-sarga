import React from 'react';

const EmptyState = ({ 
  icon: Icon, 
  title = 'Nothing here yet', 
  description, 
  action, 
  actionLabel,
  onAction 
}) => (
  <div style={{
    textAlign: 'center',
    padding: '60px 24px',
    color: 'var(--muted)',
  }}>
    {Icon && (
      <Icon 
        size={40} 
        style={{ 
          margin: '0 auto 12px', 
          display: 'block', 
          opacity: 0.3 
        }} 
      />
    )}
    <div style={{ 
      fontSize: 16, 
      fontWeight: 600, 
      marginBottom: 4,
      color: 'var(--text)',
    }}>
      {title}
    </div>
    {description && (
      <div style={{ 
        fontSize: 14, 
        maxWidth: 320, 
        margin: '0 auto',
        lineHeight: 1.5,
      }}>
        {description}
      </div>
    )}
    {(action || onAction) && (
      <button
        className="btn btn-primary"
        style={{ marginTop: 16 }}
        onClick={onAction || action}
      >
        {actionLabel || 'Get Started'}
      </button>
    )}
  </div>
);

export default EmptyState;

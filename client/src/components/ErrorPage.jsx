import React from 'react';

const ErrorPage = ({ icon: Icon, title, message, suggestion, actions }) => {
  return (
    <div className="empty-state-global" role="alert">
      {Icon && (
        <div className="empty-state-global__icon" style={{ width: 48, height: 48 }}>
          <Icon size={48} />
        </div>
      )}
      <h2 className="empty-state-global__title">{title}</h2>
      <p className="empty-state-global__message">{message}</p>
      {suggestion && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 440, margin: '4px 0 0', fontStyle: 'italic' }}>
          {suggestion}
        </p>
      )}
      {actions && actions.length > 0 && (
        <div className="empty-state__actions">
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
};

export default ErrorPage;
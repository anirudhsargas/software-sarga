import React from 'react';
import { X } from 'lucide-react';
import './EmptyState.css';

const EmptyState = React.memo(({
  icon: Icon,
  title = 'Nothing here yet',
  description,
  action,
  onAction,
  actionLabel,
  variant = 'default',
  size = 'md',
  secondaryAction,
  secondaryLabel
}) => (
  <div className={`empty-state-root empty-state-root--${size}`}>
    {Icon && (
      <div className={`empty-state-icon empty-state-icon--${variant}`}>
        <Icon size={32} />
      </div>
    )}
    <h3 className="empty-state-title">{title}</h3>
    {description && (
      <p className="empty-state-description">{description}</p>
    )}
    {(action || onAction || secondaryAction) && (
      <div className="empty-state-actions">
        {(action || onAction) && (
          <button
            className="btn btn-primary"
            onClick={onAction || action}
          >
            {actionLabel || 'Get Started'}
          </button>
        )}
        {secondaryAction && (
          <button
            className="empty-state-secondary-btn"
            onClick={secondaryAction}
          >
            <X size={14} />
            {secondaryLabel || 'Clear'}
          </button>
        )}
      </div>
    )}
  </div>
));

export default EmptyState;

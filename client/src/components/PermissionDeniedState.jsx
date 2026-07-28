import React from 'react';
import { ShieldOff } from 'lucide-react';

const sizeMap = {
  sm: { iconSize: 28, wrapperPadding: '32px 16px', gap: 8 },
  md: { iconSize: 40, wrapperPadding: '48px 24px', gap: 12 },
  lg: { iconSize: 56, wrapperPadding: '64px 32px', gap: 16 },
};

const PermissionDeniedState = ({
  icon: Icon,
  title = 'Permission Denied',
  message = 'You do not have the required permissions to access this.',
  suggestion,
  requiredRole,
  requiredPermission,
  action,
  size = 'md',
  compact,
}) => {
  const IconComponent = Icon || ShieldOff;
  const s = sizeMap[size] || sizeMap.md;
  const showSuggestion = suggestion || requiredRole || requiredPermission;

  if (compact) {
    return (
      <div className="pds pds--compact" role="alert">
        <div className="pds__row">
          <IconComponent size={18} className="pds__icon" aria-hidden="true" />
          <span className="pds__text">{title}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pds" role="alert" style={{ padding: s.wrapperPadding }}>
      <IconComponent size={s.iconSize} className="pds__icon" aria-hidden="true" style={{ width: s.iconSize, height: s.iconSize }} />
      <h3 className="pds__title">{title}</h3>
      <p className="pds__message">{message}</p>
      {showSuggestion && (
        <p className="pds__suggestion">
          {suggestion || 'Contact your administrator to request access.'}
          {requiredRole && !suggestion && (
            <> Required role: <strong>{requiredRole}</strong>.</>
          )}
          {requiredPermission && !suggestion && (
            <> Required permission: <strong>{requiredPermission}</strong>.</>
          )}
        </p>
      )}
      {action && (
        <div className="pds__actions">
          <button className="btn btn-primary btn-sm" onClick={action.onClick}>
            {action.label || 'Go Back'}
          </button>
        </div>
      )}
    </div>
  );
};

export default PermissionDeniedState;

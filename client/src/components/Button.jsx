import React from 'react';
import { addRipple } from '../utils/ripple';
import { Loader2 } from 'lucide-react';

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText,
  icon,
  iconRight,
  pill = false,
  full = false,
  onClick,
  className = '',
  ...props
}) => {
  const handleClick = (e) => {
    addRipple(e);
    if (onClick) onClick(e);
  };

  const classes = [
    'btn',
    `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    pill ? 'btn-pill' : '',
    full ? 'btn--full' : '',
    loading ? 'btn--loading' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      onClick={handleClick}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="btn-icon-left" />
          {loadingText || children}
        </>
      ) : (
        <>
          {icon && <span className="btn-icon-left">{icon}</span>}
          {children}
          {iconRight && <span className="btn-icon-right">{iconRight}</span>}
        </>
      )}
    </button>
  );
};

export default Button;

import React, { useCallback, useMemo } from 'react';
import { addRipple } from '../utils/ripple';
import { Loader2 } from 'lucide-react';
import useMagnetic from '../hooks/useMagnetic';

export const Button = React.memo(({
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
  const handleClick = useCallback((e) => {
    addRipple(e);
    if (onClick) onClick(e);
  }, [onClick]);

  const classes = useMemo(() => [
    'btn',
    `btn-${variant}`,
    variant === 'primary' ? 'btn-press' : '',
    size !== 'md' ? `btn-${size}` : '',
    pill ? 'btn-pill' : '',
    full ? 'btn--full' : '',
    loading ? 'btn--loading' : '',
    className
  ].filter(Boolean).join(' '), [variant, size, pill, full, loading, className]);
  const { ref: magneticRef } = useMagnetic();

  return (
    <button
      ref={variant === 'primary' ? magneticRef : null}
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
});

export default Button;

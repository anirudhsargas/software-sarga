import React from 'react';

/**
 * FormError — consistent error display for form-level messages.
 *
 * Props:
 *   message  — error text
 *   onDismiss — optional close handler
 */
export default function FormError({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      <span className="form-error__text">{message}</span>
      {onDismiss && (
        <button type="button" className="form-error__dismiss" onClick={onDismiss} aria-label="Dismiss error">
          ×
        </button>
      )}
    </div>
  );
}

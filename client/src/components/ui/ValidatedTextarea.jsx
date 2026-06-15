import React, { useCallback, useRef, useState } from 'react';

/**
 * ValidatedTextarea — production-grade <textarea> with real-time validation.
 *
 * Props:
 *   name        — field name
 *   label       — label text
 *   value       — controlled value
 *   onChange    — (e) => void
 *   validator   — (value) => { valid, error }
 *   required    — boolean
 *   placeholder — string
 *   disabled    — boolean
 *   rows        — number
 *   maxLength   — number
 *   className   — extra class on wrapper
 */
const ValidatedTextarea = React.memo(function ValidatedTextarea({
  name,
  label,
  value,
  onChange,
  validator,
  required = false,
  placeholder,
  disabled = false,
  rows = 4,
  maxLength,
  className = '',
  ...rest
}) {
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const ref = useRef(null);

  const handleChange = useCallback(
    (e) => {
      let val = e.target.value;
      // Strip invisible characters
      val = val.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
      e.target.value = val;

      if (validator && touched) {
        const result = validator(val);
        setError(result.valid ? '' : result.error);
      }
      onChange?.(e);
    },
    [validator, touched, onChange]
  );

  const handleBlur = useCallback(
    (e) => {
      setTouched(true);
      if (validator) {
        const result = validator(e.target.value);
        setError(result.valid ? '' : result.error);
        if (!result.valid && ref.current) {
          ref.current.focus();
        }
      }
    },
    [validator]
  );

  const showError = touched && error;

  return (
    <div className={`validated-field ${showError ? 'validated-field--error' : ''} ${className}`}>
      {label && (
        <label className="validated-field__label" htmlFor={name}>
          {label}
          {required && <span className="validated-field__required"> *</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={name}
        name={name}
        value={value ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        className={`input-field ${showError ? 'input-field--error' : ''}`}
        aria-invalid={showError ? 'true' : undefined}
        aria-describedby={showError ? `${name}-error` : undefined}
        {...rest}
      />
      {showError && (
        <span className="validated-field__error" id={`${name}-error`} role="alert">
          {error}
        </span>
      )}
      {!showError && maxLength && (
        <span className="validated-field__help">
          {(value?.length || 0)}/{maxLength}
        </span>
      )}
    </div>
  );
});

export default ValidatedTextarea;

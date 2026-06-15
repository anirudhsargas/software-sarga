import React, { useCallback, useRef, useState } from 'react';

/**
 * ValidatedInput — production-grade text/number/tel/email input with real-time validation.
 *
 * Props:
 *   type        — 'text' | 'number' | 'tel' | 'email' | 'password' | 'date' | 'time' | 'url'
 *   name        — field name
 *   label       — label text
 *   value       — controlled value
 *   onChange    — (e) => void  — called with native event; value is pre-formatted
 *   validator   — (value) => { valid, error, normalized }  — called on every change
 *   required    — boolean
 *   placeholder — string
 *   disabled    — boolean
 *   maxLength   — number
 *   min / max   — for number type
 *   step        — for number type
 *   className   — extra class on wrapper
 *   inputClassName — extra class on <input>
 *   autoFocus   — boolean
 *   onBlur      — (e) => void
 *   helpText    — optional help text below input
 */
const ValidatedInput = React.memo(function ValidatedInput({
  type = 'text',
  name,
  label,
  value,
  onChange,
  validator,
  required = false,
  placeholder,
  disabled = false,
  maxLength,
  min,
  max,
  step,
  className = '',
  inputClassName = '',
  autoFocus = false,
  onBlur,
  helpText,
  ...rest
}) {
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  const handleChange = useCallback(
    (e) => {
      let val = e.target.value;

      // Auto-format based on type before calling parent
      if (type === 'tel' || name?.toLowerCase().includes('phone') || name?.toLowerCase().includes('mobile')) {
        val = val.replace(/\D/g, '').slice(0, 10);
      } else if (type === 'email' || name?.toLowerCase().includes('email')) {
        val = val.trim().toLowerCase();
      } else if (name?.toLowerCase().includes('gst') || name?.toLowerCase().includes('gstin') || name?.toLowerCase().includes('pan')) {
        val = val.trim().toUpperCase();
      } else if (name?.toLowerCase().includes('sku') || name?.toLowerCase().includes('vendor_code')) {
        val = val.trim().toUpperCase();
      }

      // Sync native value
      e.target.value = val;

      // Validate
      if (validator && touched) {
        const result = validator(val);
        setError(result.valid ? '' : result.error);
      }

      onChange?.(e);
    },
    [type, name, validator, touched, onChange]
  );

  const handleBlur = useCallback(
    (e) => {
      setTouched(true);
      if (validator) {
        const result = validator(e.target.value);
        setError(result.valid ? '' : result.error);
        if (!result.valid && inputRef.current) {
          inputRef.current.focus();
        }
      }
      onBlur?.(e);
    },
    [validator, onBlur]
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
      <input
        ref={inputRef}
        id={name}
        name={name}
        type={type === 'tel' ? 'text' : type}
        value={value ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
        autoFocus={autoFocus}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        className={`input-field ${showError ? 'input-field--error' : ''} ${inputClassName}`}
        aria-invalid={showError ? 'true' : undefined}
        aria-describedby={showError ? `${name}-error` : undefined}
        {...rest}
      />
      {showError && (
        <span className="validated-field__error" id={`${name}-error`} role="alert">
          {error}
        </span>
      )}
      {!showError && helpText && (
        <span className="validated-field__help">{helpText}</span>
      )}
    </div>
  );
});

export default ValidatedInput;

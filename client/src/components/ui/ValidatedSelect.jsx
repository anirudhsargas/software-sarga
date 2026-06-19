import React, { useCallback, useState } from 'react';

/**
 * ValidatedSelect — production-grade <select> with real-time validation.
 *
 * Props:
 *   name        — field name
 *   label       — label text
 *   value       — controlled value
 *   onChange    — (e) => void
 *   validator   — (value) => { valid, error }
 *   required    — boolean
 *   options     — [{ value, label }]
 *   placeholder — shown as first option when empty
 *   disabled    — boolean
 *   className   — extra class on wrapper
 */
const ValidatedSelect = React.memo(function ValidatedSelect({
  name,
  label,
  value,
  onChange,
  validator,
  required = false,
  options = [],
  placeholder = 'Select...',
  disabled = false,
  className = '',
  inputClassName = '',
  helpText,
  ...rest
}) {
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      if (validator && touched) {
        const result = validator(val);
        setError(result.valid ? '' : result.error);
      }
      onChange?.(e);
    },
    [validator, touched, onChange]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
    if (validator) {
      const result = validator(value);
      setError(result.valid ? '' : result.error);
    }
  }, [validator, value]);

  const showError = touched && error;

  return (
    <div className={`validated-field ${showError ? 'validated-field--error' : ''} ${className}`}>
      {label && (
        <label className="validated-field__label" htmlFor={name}>
          {label}
          {required && <span className="validated-field__required"> *</span>}
        </label>
      )}
      <select
        id={name}
        name={name}
        value={value ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        className={`input-field ${showError ? 'input-field--error' : ''} ${inputClassName}`}
        aria-invalid={showError ? 'true' : undefined}
        aria-describedby={showError ? `${name}-error` : helpText ? `${name}-help` : undefined}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {showError && (
        <span className="validated-field__error" id={`${name}-error`} role="alert">
          {error}
        </span>
      )}
      {!showError && helpText && (
        <span className="validated-field__help" id={`${name}-help`}>{helpText}</span>
      )}
    </div>
  );
});

export default ValidatedSelect;

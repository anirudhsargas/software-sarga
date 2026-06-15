import { useState, useCallback, useRef } from 'react';

/**
 * useFormValidation — batch form validation hook.
 *
 * Usage:
 *   const { errors, validate, validateField, clearErrors, focusFirstError } = useFormValidation();
 *
 *   // On submit:
 *   const result = validate(values, {
 *     name: () => validateName(values.name),
 *     email: () => validateEmail(values.email),
 *     phone: () => validatePhone(values.phone),
 *   });
 *   if (!result.valid) focusFirstError();
 *
 *   // On individual field blur:
 *   validateField('email', validateEmail(values.email));
 */
export default function useFormValidation() {
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);

  const validateField = useCallback((fieldName, result) => {
    setErrors((prev) => {
      if (result.valid) {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      }
      return { ...prev, [fieldName]: result.error };
    });
    return result;
  }, []);

  const validate = useCallback(
    (validators) => {
      const newErrors = {};
      let valid = true;

      for (const [field, validatorFn] of Object.entries(validators)) {
        const result = validatorFn();
        if (!result.valid) {
          newErrors[field] = result.error;
          valid = false;
        }
      }

      setErrors(newErrors);
      return { valid, errors: newErrors };
    },
    []
  );

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const clearFieldError = useCallback((fieldName) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  const focusFirstError = useCallback(() => {
    if (!formRef.current) return;
    const firstErrorField = formRef.current.querySelector('.validated-field--error input, .validated-field--error select, .validated-field--error textarea, [aria-invalid="true"]');
    if (firstErrorField) {
      firstErrorField.focus();
      firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const setFieldError = useCallback((fieldName, error) => {
    setErrors((prev) => ({ ...prev, [fieldName]: error }));
  }, []);

  const hasErrors = Object.keys(errors).length > 0;

  return {
    errors,
    hasErrors,
    validate,
    validateField,
    clearErrors,
    clearFieldError,
    focusFirstError,
    setFieldError,
    formRef,
  };
}

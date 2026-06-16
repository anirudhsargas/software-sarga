// ─── Centralized Validation Library ───
// All validation functions return { valid, error, normalized }

const INDIAN_GST_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;
const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;
const PIN_REGEX = /^\d{6}$/;
const URL_REGEX = /^https?:\/\/.+/;
const VENDOR_CODE_REGEX = /^[A-Z]{3}$/;
const SKU_REGEX = /^[A-Z0-9\-_]+$/;
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const ok = (normalized) => ({ valid: true, error: null, normalized });
export const fail = (error) => ({ valid: false, error, normalized: null });

// ─── Phone / Mobile ───────────────────────────────────────────
export function validatePhone(value) {
  if (!value && value !== 0) return fail('Phone number is required');
  const raw = String(value).trim();
  if (!raw) return fail('Phone number is required');

  // Allow leading + for international numbers
  if (/^\+/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return ok(raw.replace(/\s+/g, ''));
    return fail('Phone number must have 10-15 digits');
  }

  // Indian 10-digit
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10) return fail('Mobile number must be exactly 10 digits');
  if (!/^\d{10}$/.test(digits)) return fail('Mobile number must contain only digits');
  return ok(digits);
}

// ─── Mobile Input Filter (for onChange handlers) ─────────────
// Simple filter that strips non-digits and caps at 10 characters.
// Use this in onChange handlers; use validatePhone() for full validation.
export function filterMobile(value) {
  return String(value).replace(/\D/g, '').slice(0, 10);
}

// ─── Email ────────────────────────────────────────────────────
export function validateEmail(value) {
  if (!value) return ok(''); // email is often optional
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return ok('');
  if (!EMAIL_REGEX.test(trimmed)) return fail('Invalid email format');
  if (trimmed.length > 254) return fail('Email is too long');
  return ok(trimmed);
}

// ─── GST Number (Indian) ─────────────────────────────────────
export function validateGST(value) {
  if (!value) return ok(''); // often optional
  const upper = String(value).trim().toUpperCase();
  if (!upper) return ok('');
  if (!INDIAN_GST_REGEX.test(upper)) return fail('Invalid GST format (e.g., 32ABCDE1234F1Z5)');
  return ok(upper);
}

// ─── PAN Number (Indian) ─────────────────────────────────────
export function validatePAN(value) {
  if (!value) return ok('');
  const upper = String(value).trim().toUpperCase();
  if (!upper) return ok('');
  if (!PAN_REGEX.test(upper)) return fail('Invalid PAN format (e.g., ABCDE1234F)');
  return ok(upper);
}

// ─── PIN Code ─────────────────────────────────────────────────
export function validatePIN(value) {
  if (!value) return ok('');
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 6) return fail('PIN code must be exactly 6 digits');
  return ok(digits);
}

// ─── Name Fields ──────────────────────────────────────────────
export function validateName(value, { required = true, label = 'Name', maxLength = 200 } = {}) {
  if (!value || !String(value).trim()) {
    return required ? fail(`${label} is required`) : ok('');
  }
  const normalized = String(value).trim().replace(/\s+/g, ' ');
  if (normalized.length > maxLength) return fail(`${label} must be under ${maxLength} characters`);
  return ok(normalized);
}

// ─── Price / Amount ───────────────────────────────────────────
export function validatePrice(value, { required = true, min = 0, max = 999999999, label = 'Amount', decimals = 2 } = {}) {
  if (value === '' || value === null || value === undefined || value === undefined) {
    return required ? fail(`${label} is required`) : ok(0);
  }
  const num = Number(value);
  if (isNaN(num)) return fail(`${label} must be a number`);
  if (num < min) return fail(`${label} must be at least ${min}`);
  if (num > max) return fail(`${label} is too large`);
  const rounded = Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return ok(rounded);
}

// ─── Quantity ─────────────────────────────────────────────────
export function validateQuantity(value, { required = true, min = 0, label = 'Quantity', decimals = 0 } = {}) {
  if (value === '' || value === null || value === undefined) {
    return required ? fail(`${label} is required`) : ok(0);
  }
  const num = Number(value);
  if (isNaN(num)) return fail(`${label} must be a number`);
  if (num < min) return fail(`${label} must be at least ${min}`);
  const rounded = Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return ok(rounded);
}

// ─── Date Fields ──────────────────────────────────────────────
export function validateDate(value, { required = true, label = 'Date', futureAllowed = true, pastAllowed = true } = {}) {
  if (!value) return required ? fail(`${label} is required`) : ok('');
  const str = String(value).trim();
  if (!DATE_REGEX.test(str)) return fail(`${label} must be in YYYY-MM-DD format`);
  const date = new Date(str);
  if (isNaN(date.getTime())) return fail(`${label} is not a valid date`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!futureAllowed && date > today) return fail(`${label} cannot be in the future`);
  if (!pastAllowed && date < today) return fail(`${label} cannot be in the past`);
  return ok(str);
}

// ─── Time ─────────────────────────────────────────────────────
export function validateTime(value, { required = true, label = 'Time' } = {}) {
  if (!value) return required ? fail(`${label} is required`) : ok('');
  const str = String(value).trim();
  if (!TIME_REGEX.test(str)) return fail(`${label} must be in HH:MM format`);
  return ok(str);
}

// ─── Percentage ───────────────────────────────────────────────
export function validatePercentage(value, { required = true, min = 0, max = 100, label = 'Percentage' } = {}) {
  if (value === '' || value === null || value === undefined) {
    return required ? fail(`${label} is required`) : ok(0);
  }
  const num = Number(value);
  if (isNaN(num)) return fail(`${label} must be a number`);
  if (num < min) return fail(`${label} must be at least ${min}%`);
  if (num > max) return fail(`${label} cannot exceed ${max}%`);
  return ok(num);
}

// ─── URL ──────────────────────────────────────────────────────
export function validateURL(value, { required = true, label = 'URL' } = {}) {
  if (!value) return required ? fail(`${label} is required`) : ok('');
  const str = String(value).trim();
  if (!str) return required ? fail(`${label} is required`) : ok('');
  if (!URL_REGEX.test(str)) return fail(`${label} must start with http:// or https://`);
  return ok(str);
}

// ─── SKU ──────────────────────────────────────────────────────
export function validateSKU(value, { required = true } = {}) {
  if (!value) return required ? fail('SKU is required') : ok('');
  const upper = String(value).trim().toUpperCase();
  if (!upper) return required ? fail('SKU is required') : ok('');
  if (!SKU_REGEX.test(upper)) return fail('SKU can only contain letters, numbers, hyphens, and underscores');
  return ok(upper);
}

// ─── Address ──────────────────────────────────────────────────
export function validateAddress(value, { required = false, maxLength = 500, label = 'Address' } = {}) {
  if (!value) return required ? fail(`${label} is required`) : ok('');
  const normalized = String(value).trim();
  if (!normalized) return required ? fail(`${label} is required`) : ok('');
  if (normalized.length > maxLength) return fail(`${label} must be under ${maxLength} characters`);
  return ok(normalized);
}

// ─── Password ─────────────────────────────────────────────────
export function validatePassword(value, { required = true, label = 'Password' } = {}) {
  if (!value) return required ? fail(`${label} is required`) : ok('');
  const str = String(value);
  const checks = {
    minLength: str.length >= 8,
    hasUppercase: /[A-Z]/.test(str),
    hasLowercase: /[a-z]/.test(str),
    hasNumber: /[0-9]/.test(str),
    hasSpecial: /[@$!%*?&^#()_+\-=[\]{};':",./<>?|`~]/.test(str),
  };
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  if (failed.length > 0) return fail('Password must have 8+ characters, uppercase, lowercase, number, and special character');
  return ok(str);
}

// ─── Vendor Code ──────────────────────────────────────────────
export function validateVendorCode(value, { required = true } = {}) {
  if (!value) return required ? fail('Vendor code is required') : ok('');
  const upper = String(value).trim().toUpperCase();
  if (!upper) return required ? fail('Vendor code is required') : ok('');
  if (!VENDOR_CODE_REGEX.test(upper)) return fail('Vendor code must be exactly 3 uppercase letters');
  return ok(upper);
}

// ─── Generic String ───────────────────────────────────────────
export function validateString(value, { required = true, minLength = 0, maxLength = 1000, label = 'Field', trim = true } = {}) {
  if (!value || !String(value).trim()) {
    return required ? fail(`${label} is required`) : ok('');
  }
  let normalized = String(value);
  if (trim) normalized = normalized.trim().replace(/\s+/g, ' ');
  if (normalized.length < minLength) return fail(`${label} must be at least ${minLength} characters`);
  if (normalized.length > maxLength) return fail(`${label} must be under ${maxLength} characters`);
  return ok(normalized);
}

// ─── Select / Enum ────────────────────────────────────────────
export function validateEnum(value, options, { required = true, label = 'Selection' } = {}) {
  if (!value) return required ? fail(`${label} is required`) : ok('');
  if (!options.includes(value)) return fail(`Invalid ${label.toLowerCase()}`);
  return ok(value);
}

// ─── Integer ──────────────────────────────────────────────────
export function validateInteger(value, { required = true, min = 0, max = Infinity, label = 'Value' } = {}) {
  if (value === '' || value === null || value === undefined) {
    return required ? fail(`${label} is required`) : ok(0);
  }
  const num = Number(value);
  if (!Number.isInteger(num)) return fail(`${label} must be a whole number`);
  if (num < min) return fail(`${label} must be at least ${min}`);
  if (num > max) return fail(`${label} is too large`);
  return ok(num);
}

// ─── OTP ──────────────────────────────────────────────────────
export function validateOTP(value) {
  if (!value) return fail('OTP is required');
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 6) return fail('OTP must be exactly 6 digits');
  return ok(digits);
}

// ─── IP Address ───────────────────────────────────────────────
export function validateIPAddress(value, { required = true, label = 'IP Address' } = {}) {
  if (!value) return required ? fail(`${label} is required`) : ok('');
  const str = String(value).trim();
  const parts = str.split('.');
  if (parts.length !== 4) return fail(`${label} must be a valid IPv4 address`);
  for (const part of parts) {
    const num = Number(part);
    if (isNaN(num) || num < 0 || num > 255 || part !== String(num)) {
      return fail(`${label} must be a valid IPv4 address`);
    }
  }
  return ok(str);
}

// ─── Cross-field helpers ──────────────────────────────────────
export function validatePasswordMatch(password, confirm) {
  if (password !== confirm) return fail('Passwords do not match');
  return ok(confirm);
}

// ─── Batch validation helper ──────────────────────────────────
export function validateFields(validations) {
  const errors = {};
  const values = {};
  let valid = true;
  for (const [key, validator] of Object.entries(validations)) {
    const result = validator();
    if (!result.valid) {
      errors[key] = result.error;
      valid = false;
    } else {
      values[key] = result.normalized;
    }
  }
  return { valid, errors, values };
}

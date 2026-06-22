// Lightweight phone utilities for client-side normalization and formatting.
// Prefer users entering full E.164 (+CC...) for international numbers.
// This file provides safe fallbacks for legacy 10-digit Indian numbers.

/**
 * Normalize input to E.164 when possible.
 * - If input already starts with '+' and looks like digits, returns cleaned +digits
 * - If input is 10 digits, assumes India (+91) and returns +91XXXXXXXXXX
 * - Otherwise returns digits-only fallback (last 10 digits) to preserve legacy behavior
 *
 * @param {string} input
 * @param {string} defaultRegion default region code to assume for 10-digit numbers (default 'IN')
 * @returns {string} E.164 like '+919876543210' or legacy fallback like '9876543210' or ''
 */
export function normalizeToE164(input, defaultRegion = 'IN') {
  if (!input && input !== 0) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  // If input already looks like E.164 (+ and 10-15 digits), accept it
  const noSpace = raw.replace(/\s+/g, '');
  if (/^\+\d{10,15}$/.test(noSpace)) return noSpace;

  // Extract digits only
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    // Heuristic: assume India for plain 10-digit numbers
    if (defaultRegion === 'IN') return `+91${digits}`;
    // Fallback: return digits for unknown default region
    return digits;
  }

  // If digits look like they already include country code (11-15), return with +
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;

  // Legacy fallback: return last 10 digits
  return digits.slice(-10);
}

/**
 * Convert an E.164 string (with leading +) to a WhatsApp-friendly numeric string
 * Example: '+919876543210' -> '919876543210'
 */
export function e164ToWhatsAppDigits(e164) {
  if (!e164) return '';
  const s = String(e164).trim();
  if (s.startsWith('+')) return s.replace(/\D/g, '').replace(/^0+/, '');
  return s.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Format phone for display in UI. Prefers E.164 (with a space after country code),
 * falls back to a +91 prefix for 10-digit Indian numbers, otherwise returns digits.
 */
export function formatForDisplay(input, defaultRegion = 'IN') {
  const e164 = normalizeToE164(input, defaultRegion);
  if (!e164) return '';
  if (e164.startsWith('+')) {
    const m = e164.match(/^(\+\d{1,3})(\d+)$/);
    if (m) return `${m[1]} ${m[2]}`;
    return e164;
  }
  if (e164.length === 10 && defaultRegion === 'IN') return `+91 ${e164}`;
  return e164;
}

/**
 * Return a tel: href for the given phone input, preferring E.164 when possible.
 */
export function telHref(input, defaultRegion = 'IN') {
  const e164 = normalizeToE164(input, defaultRegion);
  if (!e164) return '';
  if (e164.startsWith('+')) return `tel:${e164}`;
  if (e164.length === 10 && defaultRegion === 'IN') return `tel:+91${e164}`;
  return `tel:${e164}`;
}

/**
 * Convenience utility to merge country code and number for formatting and display.
 * @param {string} countryCode
 * @param {string} number
 * @returns {string} e.g. "+91 9876543210"
 */
export function formatPhoneNumber(countryCode, number) {
  if (!number) return '';
  const cc = (countryCode || '').trim();
  const num = (number || '').trim().replace(/\D/g, '');
  if (!cc) return formatForDisplay(num);
  const combined = cc.startsWith('+') ? `${cc}${num}` : `+${cc}${num}`;
  return formatForDisplay(combined);
}

/**
 * Convenience utility to merge country code and number into normalized E.164.
 * @param {string} countryCode
 * @param {string} number
 * @returns {string} e.g. "+919876543210"
 */
export function normalizePhone(countryCode, number) {
  if (!number) return '';
  const cc = (countryCode || '').trim();
  const num = (number || '').trim().replace(/\D/g, '');
  if (!cc) return normalizeToE164(num);
  const combined = cc.startsWith('+') ? `${cc}${num}` : `+${cc}${num}`;
  return normalizeToE164(combined);
}

// ─── Consolidated Formatting Utilities ───
// Single source of truth — import from here, NOT from inline duplicates

/**
 * Format number to Indian currency style (₹1,23,456)
 * @param {number|string} n
 * @param {boolean} [withSymbol=true]
 * @returns {string}
 */
export function formatCurrency(n, withSymbol = true) {
  const raw = Number(n || 0);
  const num = Object.is(raw, -0) || Math.abs(raw) < 0.00001 ? 0 : raw;
  const formatted = num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return withSymbol ? `₹${formatted}` : formatted;
}

/**
 * Format number with decimals to Indian currency style
 * @param {number|string} n
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function formatCurrencyDecimal(n, decimals = 2) {
  const raw = Number(n || 0);
  const num = Object.is(raw, -0) || Math.abs(raw) < 0.00001 ? 0 : raw;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Format date string to DD/MM/YYYY
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN');
}

/**
 * Format date with time
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN') + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format phone for display (+91 98765 43210)
 * @param {string} phone
 * @returns {string}
 */
export function formatPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length > 10) return `+${digits}`;
  return digits;
}

/**
 * Format phone for display without spacing (+919876543210)
 * @param {string} phone
 * @returns {string}
 */
export function formatPhoneCompact(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return digits;
}

/**
 * Format GST number (uppercase, trimmed)
 * @param {string} gst
 * @returns {string}
 */
export function formatGST(gst) {
  if (!gst) return '';
  return String(gst).trim().toUpperCase();
}

/**
 * Format PAN number (uppercase, trimmed)
 * @param {string} pan
 * @returns {string}
 */
export function formatPAN(pan) {
  if (!pan) return '';
  return String(pan).trim().toUpperCase();
}

/**
 * Format vendor code (uppercase, trimmed)
 * @param {string} code
 * @returns {string}
 */
export function formatVendorCode(code) {
  if (!code) return '';
  return String(code).trim().toUpperCase();
}

/**
 * Format SKU (uppercase, trimmed)
 * @param {string} sku
 * @returns {string}
 */
export function formatSKU(sku) {
  if (!sku) return '';
  return String(sku).trim().toUpperCase();
}

/**
 * Format email (lowercase, trimmed)
 * @param {string} email
 * @returns {string}
 */
export function formatEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

/**
 * Format quantity with optional decimal places
 * @param {number|string} qty
 * @param {number} [decimals=0]
 * @returns {string}
 */
export function formatQuantity(qty, decimals = 0) {
  const num = Number(qty || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Format percentage
 * @param {number|string} pct
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPercentage(pct, decimals = 1) {
  const num = Number(pct || 0);
  return `${num.toFixed(decimals)}%`;
}

/**
 * Strip invisible / zero-width characters from a string
 * @param {string} str
 * @returns {string}
 */
export function stripInvisible(str) {
  if (!str) return '';
  return String(str).replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
}

/**
 * Truncate string with ellipsis
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(str, maxLen = 50) {
  if (!str) return '';
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

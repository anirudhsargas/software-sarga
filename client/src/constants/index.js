// ─── Shared Application Constants ───
// Centralized to avoid duplication across components

export const GST_RATE = 0.18;

export const CUSTOMER_TYPES = [
  { value: 'Regular', label: 'Regular' },
  { value: 'Walk-in', label: 'Walk-in' },
  { value: 'Credit', label: 'Credit' },
];

export const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Card', label: 'Card' },
  { value: 'Cheque', label: 'Cheque' },
];

/**
 * Format a number to Indian currency style (₹1,23,456)
 * @param {number|string} n - The number to format
 * @param {boolean} [withSymbol=true] - Whether to prefix ₹
 * @returns {string}
 */
export const formatCurrency = (n, withSymbol = true) => {
  const num = Number(n || 0);
  const formatted = num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return withSymbol ? `₹${formatted}` : formatted;
};

/**
 * Format a number with decimals to Indian currency style
 * @param {number|string} n
 * @param {number} [decimals=2]
 * @returns {string}
 */
export const formatCurrencyDecimal = (n, decimals = 2) => {
  const num = Number(n || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

/**
 * Format a date string to DD/MM/YYYY
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN');
};

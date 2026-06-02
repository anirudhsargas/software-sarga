/**
 * Sarga Prints MCP Server — Formatting Utilities
 */

/**
 * Format a number as Indian Rupees: ₹1,23,456.78
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '₹0.00';
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';

  const [intPart, decPart] = num.toFixed(2).split('.');
  const isNegative = intPart.startsWith('-');
  const abs = isNegative ? intPart.slice(1) : intPart;

  // Indian number formatting: last 3 digits, then groups of 2
  let result = '';
  if (abs.length <= 3) {
    result = abs;
  } else {
    const last3 = abs.slice(-3);
    const remaining = abs.slice(0, -3);
    const groups = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    result = `${groups},${last3}`;
  }

  return `${isNegative ? '-' : ''}₹${result}.${decPart}`;
}

/**
 * Format a date as DD-MMM-YYYY (e.g., 02-Jun-2026)
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

/**
 * Format a date as YYYY-MM-DD for SQL queries.
 */
export function toSqlDate(date: Date | string | undefined): string {
  if (!date) {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Get date N days ago in YYYY-MM-DD format.
 */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/**
 * Get first day of current month in YYYY-MM-DD format.
 */
export function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Get last day of current month in YYYY-MM-DD format.
 */
export function endOfMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split('T')[0];
}

/**
 * Truncate a string to max length with ellipsis.
 */
export function truncate(str: string | null | undefined, maxLen = 100): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Format tool results as structured text for MCP responses.
 */
export function formatToolResult(data: unknown): string {
  if (data === null || data === undefined) return 'No data';
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Safely parse a page/limit from user input.
 */
export function parsePagination(page?: number, limit?: number): { page: number; limit: number; offset: number } {
  const p = clamp(page || 1, 1, 10000);
  const l = clamp(limit || 20, 1, 100);
  return { page: p, limit: l, offset: (p - 1) * l };
}

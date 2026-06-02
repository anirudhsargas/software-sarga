/**
 * Sarga Prints MCP Server — Input Validation Helpers
 */

/**
 * Sanitize a string for safe use in SQL LIKE clauses.
 */
export function sanitizeLike(input: string): string {
  return input.replace(/[%_\\]/g, (char) => `\\${char}`);
}

/**
 * Validate that a string is a valid YYYY-MM-DD date.
 */
export function isValidDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

/**
 * Validate a positive integer ID.
 */
export function isValidId(id: unknown): id is number {
  if (typeof id === 'number') return Number.isInteger(id) && id > 0;
  if (typeof id === 'string') {
    const n = Number(id);
    return Number.isInteger(n) && n > 0;
  }
  return false;
}

/**
 * Parse a string or number into a valid positive integer, or return null.
 */
export function parseId(id: unknown): number | null {
  if (id == null) return null;
  const n = Number(id);
  if (Number.isInteger(n) && n > 0) return n;
  return null;
}

/**
 * Ensure a date range makes sense (from <= to).
 */
export function validateDateRange(from: string, to: string): { valid: boolean; error?: string } {
  if (!isValidDate(from)) return { valid: false, error: `Invalid from_date: ${from}` };
  if (!isValidDate(to)) return { valid: false, error: `Invalid to_date: ${to}` };
  if (from > to) return { valid: false, error: 'from_date must be before to_date' };
  return { valid: true };
}

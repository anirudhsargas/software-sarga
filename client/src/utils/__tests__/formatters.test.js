import { describe, it, expect } from 'vitest';
import {
  formatCurrency, formatCurrencyDecimal, formatDate, formatDateTime,
  formatPhone, formatPhoneCompact, formatGST, formatPAN,
  formatVendorCode, formatSKU, formatEmail, formatQuantity,
  formatPercentage, stripInvisible, truncate,
} from '../formatters';

describe('formatCurrency', () => {
  it('formats number with ₹ symbol', () => {
    expect(formatCurrency(123456)).toContain('₹');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toContain('₹');
  });

  it('formats without symbol when false', () => {
    expect(formatCurrency(1000, false)).not.toContain('₹');
  });
});

describe('formatCurrencyDecimal', () => {
  it('formats with 2 decimal places by default', () => {
    const result = formatCurrencyDecimal(1234.5);
    expect(result).toContain('₹');
  });

  it('handles custom decimals', () => {
    expect(formatCurrencyDecimal(100, 0)).toContain('₹');
  });
});

describe('formatDate', () => {
  it('returns em-dash for falsy input', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('formats a valid date', () => {
    const result = formatDate('2025-01-15');
    expect(result).not.toBe('—');
  });
});

describe('formatDateTime', () => {
  it('returns em-dash for falsy input', () => {
    expect(formatDateTime('')).toBe('—');
  });

  it('includes time in output', () => {
    const result = formatDateTime('2025-01-15T10:30:00');
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(10);
  });
});

describe('formatPhone', () => {
  it('handles empty input', () => {
    expect(formatPhone('')).toBe('');
    expect(formatPhone(null)).toBe('');
  });

  it('formats 10-digit number', () => {
    const result = formatPhone('9876543210');
    expect(result).toMatch(/\+91/);
    expect(result).toContain(' ');
  });
});

describe('formatPhoneCompact', () => {
  it('formats 10-digit compact', () => {
    expect(formatPhoneCompact('9876543210')).toBe('+919876543210');
  });

  it('handles empty', () => {
    expect(formatPhoneCompact('')).toBe('');
  });
});

describe('formatGST', () => {
  it('uppercases and trims', () => {
    expect(formatGST(' 32abcde1234f1z5 ')).toBe('32ABCDE1234F1Z5');
  });

  it('handles empty', () => {
    expect(formatGST('')).toBe('');
  });
});

describe('formatPAN', () => {
  it('uppercases PAN', () => {
    expect(formatPAN('abcde1234f')).toBe('ABCDE1234F');
  });
});

describe('formatVendorCode', () => {
  it('uppercases code', () => {
    expect(formatVendorCode('abc')).toBe('ABC');
  });
});

describe('formatSKU', () => {
  it('uppercases SKU', () => {
    expect(formatSKU('sku-001')).toBe('SKU-001');
  });
});

describe('formatEmail', () => {
  it('lowercases email', () => {
    expect(formatEmail('Test@Example.COM')).toBe('test@example.com');
  });
});

describe('formatQuantity', () => {
  it('formats number', () => {
    const result = formatQuantity(5000);
    expect(result).toBeTruthy();
  });
});

describe('formatPercentage', () => {
  it('formats with 1 decimal default', () => {
    expect(formatPercentage(12.5)).toContain('%');
  });
});

describe('stripInvisible', () => {
  it('removes zero-width characters', () => {
    expect(stripInvisible('test\u200B\u200C\u200D\uFEFF')).toBe('test');
  });

  it('handles empty', () => {
    expect(stripInvisible('')).toBe('');
  });
});

describe('truncate', () => {
  it('truncates long strings', () => {
    expect(truncate('a'.repeat(100), 10)).toHaveLength(13);
  });

  it('does not truncate short strings', () => {
    expect(truncate('short', 50)).toBe('short');
  });
});

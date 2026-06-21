const {
  normalizeMobile, normalizeMobileWithCountry,
  getTodayDate, asyncHandler, sortByPositionThenName,
  formatDate, formatPhone
} = require('../../helpers');

describe('normalizeMobile', () => {
  it('returns E.164 for valid Indian mobile', () => {
    expect(normalizeMobile('9876543210')).toBe('9876543210');
  });

  it('returns last 10 digits for longer numbers', () => {
    expect(normalizeMobile('919876543210')).toBe('9876543210');
  });

  it('returns empty string for null', () => {
    expect(normalizeMobile(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeMobile(undefined)).toBe('');
  });
});

describe('normalizeMobileWithCountry', () => {
  it('passes through for valid mobile', () => {
    const result = normalizeMobileWithCountry('9876543210', 'IN');
    expect(result).toBeTruthy();
  });

  it('handles +91 prefix', () => {
    const result = normalizeMobileWithCountry('9876543210', '+91');
    expect(result).toBeTruthy();
  });

  it('handles 91 prefix', () => {
    const result = normalizeMobileWithCountry('9876543210', '91');
    expect(result).toBeTruthy();
  });

  it('falls back for invalid', () => {
    const result = normalizeMobileWithCountry(null, null);
    expect(result).toBe('');
  });
});

describe('getTodayDate', () => {
  it('returns date in YYYY-MM-DD format', () => {
    const date = getTodayDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('asyncHandler', () => {
  it('wraps a function and calls next on rejection', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const wrapped = asyncHandler(fn);

    const req = {};
    const res = {};
    const next = jest.fn();

    await wrapped(req, res, next);

    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('passes through on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const wrapped = asyncHandler(fn);

    const req = {};
    const res = {};
    const next = jest.fn();

    await wrapped(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

describe('sortByPositionThenName', () => {
  it('sorts by position first, then name', () => {
    const items = [
      { name: 'Zulu', position: 2 },
      { name: 'Alpha', position: 1 },
      { name: 'Beta', position: 1 },
    ];
    items.sort(sortByPositionThenName);
    expect(items[0].name).toBe('Alpha');
    expect(items[1].name).toBe('Beta');
    expect(items[2].name).toBe('Zulu');
  });

  it('handles missing position', () => {
    const items = [
      { name: 'Beta', position: null },
      { name: 'Alpha', position: 1 },
    ];
    items.sort(sortByPositionThenName);
    expect(items[0].name).toBe('Alpha');
  });
});

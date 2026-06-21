const { normalizeMobile, normalizeMobileWithCountry, getTodayDate, sortByPositionThenName, sortByUsageThenPosition } = require('../helpers');
const { paginate } = require('../helpers/pagination');
const { AppError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ValidationError, ConflictError, RateLimitError } = require('../utils/AppError');

describe('helpers', () => {
  describe('normalizeMobile', () => {
    it('returns empty string for null/undefined', () => {
      expect(normalizeMobile(null)).toBe('');
      expect(normalizeMobile(undefined)).toBe('');
    });

    it('returns last 10 digits for plain 10-digit number', () => {
      expect(normalizeMobile('9876543210')).toBe('9876543210');
    });

    it('strips non-digit characters', () => {
      expect(normalizeMobile('+91-9876543210')).toBe('9876543210');
    });

    it('returns last 10 digits for longer numbers', () => {
      expect(normalizeMobile('919876543210')).toBe('9876543210');
    });

    it('returns last 10 digits for short numbers', () => {
      expect(normalizeMobile('12345')).toBe('12345');
    });
  });

  describe('normalizeMobileWithCountry', () => {
    it('handles 2-letter country code', () => {
      const result = normalizeMobileWithCountry('9876543210', 'IN');
      expect(result).toBeTruthy();
    });

    it('handles calling code with +', () => {
      const result = normalizeMobileWithCountry('9876543210', '+91');
      expect(result).toBeTruthy();
    });

    it('handles numeric calling code', () => {
      const result = normalizeMobileWithCountry('9876543210', '91');
      expect(result).toBeTruthy();
    });
  });

  describe('getTodayDate', () => {
    it('returns today as YYYY-MM-DD', () => {
      const today = getTodayDate();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('sortByPositionThenName', () => {
    it('sorts by position first, then name', () => {
      const items = [
        { name: 'Z Item', position: 2 },
        { name: 'A Item', position: 1 },
        { name: 'Middle', position: 1 },
      ];
      const sorted = items.sort(sortByPositionThenName);
      expect(sorted[0].name).toBe('A Item');
      expect(sorted[1].name).toBe('Middle');
      expect(sorted[2].name).toBe('Z Item');
    });

    it('handles missing position', () => {
      const items = [{ name: 'B' }, { name: 'A' }];
      const sorted = items.sort(sortByPositionThenName);
      expect(sorted[0].name).toBe('A');
    });
  });

  describe('sortByUsageThenPosition', () => {
    it('sorts by usage first, then position, then name', () => {
      const usageMap = new Map([
        ['product:1', 5],
        ['product:2', 10],
        ['product:3', 5],
      ]);
      const items = [
        { id: 1, name: 'Used Mid', position: 2 },
        { id: 2, name: 'Most Used', position: 1 },
        { id: 3, name: 'Used Low', position: 1 },
      ];
      const sorter = sortByUsageThenPosition(usageMap, 'product');
      const sorted = items.sort(sorter);
      expect(sorted[0].name).toBe('Most Used');
    });
  });

  describe('paginate', () => {
    it('returns default values when no page/limit specified', () => {
      const result = paginate({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('returns correct offset for page 2', () => {
      const result = paginate({}, 2, 10);
      expect(result.page).toBe(2);
      expect(result.offset).toBe(10);
    });

    it('clamps limit to max 100', () => {
      const result = paginate({}, 1, 500);
      expect(result.limit).toBe(100);
    });

    it('clamps page to minimum 1', () => {
      const result = paginate({}, -1, 20);
      expect(result.page).toBe(1);
    });

    it('response has correct structure', () => {
      const result = paginate({}, 1, 10);
      const resp = result.response([1, 2, 3], 30);
      expect(resp).toHaveProperty('data', [1, 2, 3]);
      expect(resp).toHaveProperty('total', 30);
      expect(resp).toHaveProperty('totalPages', 3);
      expect(resp).toHaveProperty('hasNext', true);
      expect(resp).toHaveProperty('hasPrev', false);
    });
  });
});

describe('AppError classes', () => {
  it('AppError has correct structure', () => {
    const err = new AppError('Test error', { status: 400, code: 'TEST', userMessage: 'User msg', suggestion: 'Try X', details: { foo: 'bar' } });
    expect(err.message).toBe('Test error');
    expect(err.status).toBe(400);
    expect(err.code).toBe('TEST');
    expect(err.userMessage).toBe('User msg');
    expect(err.suggestion).toBe('Try X');
    expect(err.details).toEqual({ foo: 'bar' });
  });

  it('BadRequestError defaults correctly', () => {
    const err = new BadRequestError('Bad input');
    expect(err.status).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('UnauthorizedError defaults correctly', () => {
    const err = new UnauthorizedError('No auth');
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenError defaults correctly', () => {
    const err = new ForbiddenError('No permission');
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('NotFoundError defaults correctly', () => {
    const err = new NotFoundError('Missing');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('ValidationError defaults correctly', () => {
    const err = new ValidationError('Invalid', [{ field: 'name', message: 'Required' }]);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toHaveLength(1);
  });

  it('ConflictError defaults correctly', () => {
    const err = new ConflictError('Duplicate');
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('RateLimitError defaults correctly', () => {
    const err = new RateLimitError('Too fast');
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
  });
});

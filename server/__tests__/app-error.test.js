const {
  AppError, BadRequestError, UnauthorizedError, ForbiddenError,
  NotFoundError, ValidationError, ConflictError, RateLimitError,
} = require('../utils/AppError');

describe('AppError', () => {
  it('creates with default values', () => {
    const err = new AppError('test');
    expect(err.message).toBe('test');
    expect(err.status).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.userMessage).toBe('test');
    expect(err.suggestion).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it('accepts custom options', () => {
    const err = new AppError('custom message', {
      status: 418, code: 'TEAPOT', userMessage: 'I am a teapot',
      suggestion: 'Try coffee', details: { key: 'val' },
    });
    expect(err.status).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.userMessage).toBe('I am a teapot');
    expect(err.suggestion).toBe('Try coffee');
    expect(err.details).toEqual({ key: 'val' });
  });
});

describe('BadRequestError', () => {
  it('creates 400 error', () => {
    const err = new BadRequestError('invalid');
    expect(err.status).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.userMessage).toBe('The request was invalid.');
  });
});

describe('UnauthorizedError', () => {
  it('creates 401 error', () => {
    const err = new UnauthorizedError('not allowed');
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.userMessage).toBe('Please log in to continue.');
  });
});

describe('ForbiddenError', () => {
  it('creates 403 error', () => {
    const err = new ForbiddenError('no access');
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.userMessage).toBe('You do not have permission to perform this action.');
  });
});

describe('NotFoundError', () => {
  it('creates 404 error', () => {
    const err = new NotFoundError('missing');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.userMessage).toBe('The requested resource was not found.');
  });
});

describe('ValidationError', () => {
  it('creates 422 error with details', () => {
    const errors = [{ field: 'name', message: 'required' }];
    const err = new ValidationError('validation failed', errors);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(errors);
    expect(err.userMessage).toBe('Some fields have invalid values.');
  });
});

describe('ConflictError', () => {
  it('creates 409 error', () => {
    const err = new ConflictError('duplicate');
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('RateLimitError', () => {
  it('creates 429 error', () => {
    const err = new RateLimitError('slow down');
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
  });
});

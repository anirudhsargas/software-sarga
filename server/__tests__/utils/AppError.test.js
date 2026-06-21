const { AppError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ValidationError, ConflictError, RateLimitError } = require('../../utils/AppError');

describe('AppError', () => {
  it('creates a basic AppError with defaults', () => {
    const err = new AppError('Something broke');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Something broke');
    expect(err.status).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.userMessage).toBe('Something broke');
    expect(err.suggestion).toBeUndefined();
  });

  it('accepts custom options', () => {
    const err = new AppError('Not found', {
      status: 404, code: 'NOT_FOUND', userMessage: 'Missing', suggestion: 'Try again', details: { id: 1 }
    });
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.userMessage).toBe('Missing');
    expect(err.suggestion).toBe('Try again');
    expect(err.details).toEqual({ id: 1 });
  });
});

describe('BadRequestError', () => {
  it('sets status 400', () => {
    const err = new BadRequestError('invalid');
    expect(err.status).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
  });
});

describe('UnauthorizedError', () => {
  it('sets status 401', () => {
    const err = new UnauthorizedError('no auth');
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});

describe('ForbiddenError', () => {
  it('sets status 403', () => {
    const err = new ForbiddenError('no permission');
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('NotFoundError', () => {
  it('sets status 404', () => {
    const err = new NotFoundError('missing');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('ValidationError', () => {
  it('sets status 422 with details', () => {
    const details = [{ field: 'email', message: 'invalid' }];
    const err = new ValidationError('validation failed', details);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(details);
  });
});

describe('ConflictError', () => {
  it('sets status 409', () => {
    const err = new ConflictError('duplicate');
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('RateLimitError', () => {
  it('sets status 429', () => {
    const err = new RateLimitError('too fast');
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
  });
});

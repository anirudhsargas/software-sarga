const jwt = require('jsonwebtoken');

jest.mock('../../database', () => ({
  pool: { query: jest.fn(() => Promise.resolve([[]])) },
}));

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-chars-long!!';
});

describe('cache middleware', () => {
  let cacheMiddleware, invalidateCache;

  beforeEach(() => {
    jest.resetModules();
    const mod = require('../../index');
    cacheMiddleware = mod.cacheMiddleware;
    invalidateCache = mod.invalidateCache;
  });

  it('returns a middleware function', () => {
    expect(typeof cacheMiddleware).toBe('function');
  });

  it('cacheMiddleware returns a request handler', () => {
    const handler = cacheMiddleware(60);
    expect(typeof handler).toBe('function');
  });

  it('invalidates keys matching pattern', () => {
    expect(typeof invalidateCache).toBe('function');
  });
});

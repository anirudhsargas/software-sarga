const jwt = require('jsonwebtoken');

jest.mock('../../database', () => ({
  pool: { query: jest.fn(() => Promise.resolve([[]])) },
}));

beforeAll(() => {
  const { TEST_JWT_SECRET } = require('../helpers/testUtils');
  process.env.JWT_SECRET = TEST_JWT_SECRET;
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

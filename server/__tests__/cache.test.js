const httpMocks = require('node-mocks-http');

jest.mock('node-cache');
const NodeCache = require('node-cache');
const mockNodeCacheInstance = {
  get: jest.fn(),
  set: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
};
NodeCache.mockImplementation(() => mockNodeCacheInstance);

describe('Cache middleware', () => {
  let cacheMiddleware, invalidateCache;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    const cache = require('../index');
    cacheMiddleware = cache.cacheMiddleware;
    invalidateCache = cache.invalidateCache;
  });

  describe('cacheMiddleware', () => {
    it('returns cached response on hit', () => {
      const cachedData = { data: 'cached' };
      mockNodeCacheInstance.get.mockReturnValue(cachedData);

      const req = httpMocks.createRequest({ url: '/api/test' });
      const res = { json: jest.fn() };
      const next = jest.fn();

      cacheMiddleware(300)(req, res, next);
      expect(res.json).toHaveBeenCalledWith(cachedData);
      expect(next).not.toHaveBeenCalled();
    });

    it('overrides res.json to cache on miss', () => {
      mockNodeCacheInstance.get.mockReturnValue(undefined);

      const req = httpMocks.createRequest({ url: '/api/test' });
      const res = httpMocks.createResponse();
      const next = jest.fn();

      cacheMiddleware(300)(req, res, next);
      expect(next).toHaveBeenCalled();

      res.json({ data: 'fresh' });
      expect(mockNodeCacheInstance.set).toHaveBeenCalledWith('/api/test', { data: 'fresh' }, 300);
    });
  });

  describe('invalidateCache', () => {
    it('deletes keys matching pattern', () => {
      mockNodeCacheInstance.keys.mockReturnValue(['/api/jobs/1', '/api/jobs/2', '/api/health']);
      invalidateCache('/api/jobs');
      expect(mockNodeCacheInstance.del).toHaveBeenCalledWith('/api/jobs/1');
      expect(mockNodeCacheInstance.del).toHaveBeenCalledWith('/api/jobs/2');
      expect(mockNodeCacheInstance.del).not.toHaveBeenCalledWith('/api/health');
    });

    it('handles empty keys', () => {
      mockNodeCacheInstance.keys.mockReturnValue([]);
      invalidateCache('/api/test');
      expect(mockNodeCacheInstance.del).not.toHaveBeenCalled();
    });
  });
});

const { CACHE_TTL, CACHE_ENABLED, buildKey, getCache, setCache, routeCache } = require('../services/cacheService');
const { isRedisConnected } = require('../config/redis');
const logger = require('../helpers/logger');

// Re-export the existing in-memory NodeCache middleware for backward compatibility
// New code should use redisCache instead.

/**
 * Redis-backed cache middleware.
 * Falls through to next() if Redis is unavailable.
 */
function redisCache(ttl, keyPrefix) {
    return (req, res, next) => {
        if (!CACHE_ENABLED || !isRedisConnected()) return next();

        const key = buildKey(keyPrefix || 'route', req.originalUrl);

        (async () => {
            try {
                const cached = await getCache(key);
                if (cached) {
                    return res.json(cached);
                }

                const originalJson = res.json.bind(res);
                res.json = (data) => {
                    setCache(key, data, ttl).catch(() => {});
                    return originalJson(data);
                };
                next();
            } catch (err) {
                logger.error(`[RedisCache] Middleware error: ${err.message}`);
                next();
            }
        })();
    };
}

// Pre-configured cache middlewares for common use cases
const dashboardCache = () => redisCache(CACHE_TTL.DASHBOARD, 'dashboard');
const customerCache = () => redisCache(CACHE_TTL.CUSTOMERS, 'customers');
const analyticsCache = () => redisCache(CACHE_TTL.ANALYTICS, 'analytics');
const searchCache = () => redisCache(CACHE_TTL.SEARCH, 'search');

module.exports = {
    redisCache,
    dashboardCache,
    customerCache,
    analyticsCache,
    searchCache,
    routeCache,
};

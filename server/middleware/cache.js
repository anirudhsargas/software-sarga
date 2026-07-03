const { getCache, setCache } = require('../services/cacheService');

/**
 * General cache middleware using the service's in-memory storage.
 */
function redisCache(ttl = 300, keyPrefix = 'general') {
    return async (req, res, next) => {
        try {
            // Build cache key based on route path, query parameters, and user context for security isolation
            const queryPart = Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : '';
            const userPart = req.user ? `${req.user.role}:${req.user.branch_id || ''}:${req.user.id}` : 'public';
            const key = `sarga:${keyPrefix}:${req.baseUrl || ''}${req.path}:${queryPart}:${userPart}`;
            
            const cached = await getCache(key);
            if (cached) {
                return res.json(cached);
            }

            // Monkey-patch res.json to capture response body for caching
            const originalJson = res.json;
            res.json = function (body) {
                res.json = originalJson;
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    setCache(key, body, ttl).catch(err => console.error('[Cache] set error:', err));
                }
                return originalJson.call(this, body);
            };
            next();
        } catch (err) {
            console.error('[Cache] middleware error:', err);
            next();
        }
    };
}

/**
 * Route-specific cache middleware using a custom key function.
 */
function routeCache(ttl, keyFn) {
    return async (req, res, next) => {
        try {
            const key = typeof keyFn === 'function' ? keyFn(req) : keyFn || req.originalUrl;
            const cached = await getCache(key);
            if (cached) {
                return res.json(cached);
            }

            // Monkey-patch res.json to capture response body for caching
            const originalJson = res.json;
            res.json = function (body) {
                res.json = originalJson;
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    setCache(key, body, ttl).catch(err => console.error('[Cache] set error:', err));
                }
                return originalJson.call(this, body);
            };
            next();
        } catch (err) {
            console.error('[Cache] middleware error:', err);
            next();
        }
    };
}

// Pre-configured cache middlewares for common use cases
const dashboardCache = () => redisCache(300, 'dashboard');
const customerCache = () => redisCache(120, 'customers');
const analyticsCache = () => redisCache(600, 'analytics');
const searchCache = () => redisCache(60, 'search');

module.exports = {
    redisCache,
    dashboardCache,
    customerCache,
    analyticsCache,
    searchCache,
    routeCache,
};


/**
 * Redis-backed cache middleware (No-op now that Redis is removed).
 */
function redisCache(ttl, keyPrefix) {
    return (req, res, next) => {
        next();
    };
}

/**
 * Route cache middleware (No-op now that Redis is removed).
 */
function routeCache(ttl, keyFn) {
    return (req, res, next) => {
        next();
    };
}

// Pre-configured cache middlewares for common use cases
const dashboardCache = () => redisCache();
const customerCache = () => redisCache();
const analyticsCache = () => redisCache();
const searchCache = () => redisCache();

module.exports = {
    redisCache,
    dashboardCache,
    customerCache,
    analyticsCache,
    searchCache,
    routeCache,
};

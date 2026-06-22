const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('../helpers/logger');

const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';

const CACHE_TTL = {
    DASHBOARD: 300,
    CUSTOMERS: 120,
    ANALYTICS: 600,
    SEARCH: 60,
    FINANCE: 300,
    REPORTS: 900,
    STAFF: 3600,
};

const stats = {
    hits: 0,
    misses: 0,
    byDomain: {}
};

function getCacheStats() {
    return { ...stats };
}

function buildKey(prefix, identifier) {
    return `sarga:${prefix}:${identifier}`;
}

async function getCache(key, domain = 'general') {
    if (!CACHE_ENABLED || !isRedisConnected()) return null;
    try {
        const client = getRedisClient();
        const data = await client.get(key);
        
        stats.byDomain[domain] = stats.byDomain[domain] || { hits: 0, misses: 0 };
        
        if (data) {
            stats.hits++;
            stats.byDomain[domain].hits++;
            logger.debug(`[Redis] Cache Hit: ${key}`);
            return JSON.parse(data);
        }
        stats.misses++;
        stats.byDomain[domain].misses++;
        logger.debug(`[Redis] Cache Miss: ${key}`);
        return null;
    } catch (err) {
        logger.error(`[Redis] Get error for ${key}: ${err.message}`);
        return null;
    }
}

async function setCache(key, data, ttl) {
    if (!CACHE_ENABLED || !isRedisConnected()) return;
    try {
        const client = getRedisClient();
        await client.set(key, JSON.stringify(data), { EX: ttl });
    } catch (err) {
        logger.error(`[Redis] Set error for ${key}: ${err.message}`);
    }
}

async function deleteCache(key) {
    if (!CACHE_ENABLED || !isRedisConnected()) return;
    try {
        const client = getRedisClient();
        await client.del(key);
    } catch (err) {
        logger.error(`[Redis] Delete error for ${key}: ${err.message}`);
    }
}

async function invalidatePattern(pattern) {
    if (!CACHE_ENABLED || !isRedisConnected()) return 0;
    try {
        const client = getRedisClient();
        const keys = [];
        for await (const key of client.scanIterator({ MATCH: `sarga:${pattern}*`, COUNT: 100 })) {
            keys.push(key);
        }
        if (keys.length > 0) {
            await client.del(keys);
            logger.info(`[Redis] Invalidated ${keys.length} keys matching pattern: ${pattern}`);
        }
        return keys.length;
    } catch (err) {
        logger.error(`[Redis] Invalidate pattern error: ${err.message}`);
        return 0;
    }
}

// Domain-specific invalidation helpers
async function invalidateCustomerCache() {
    return invalidatePattern('customers');
}

async function invalidateDashboardCache() {
    return invalidatePattern('dashboard');
}

async function invalidateAnalyticsCache() {
    return invalidatePattern('analytics');
}

async function invalidateSearchCache() {
    return invalidatePattern('search');
}

async function invalidateFinanceCache() {
    return invalidatePattern('finance');
}

async function invalidateReportsCache() {
    return invalidatePattern('reports');
}

async function invalidateStaffCache() {
    return invalidatePattern('staff');
}

// Generic route-based cache middleware
function routeCache(ttl, keyFn) {
    return async (req, res, next) => {
        if (!CACHE_ENABLED || !isRedisConnected()) return next();

        const key = keyFn ? keyFn(req) : buildKey('route', req.originalUrl);
        try {
            const client = getRedisClient();
            const cached = await client.get(key);
            if (cached) {
                logger.debug(`[Redis] Cache Hit: ${key}`);
                return res.json(JSON.parse(cached));
            }
        } catch (err) {
            logger.error(`[Redis] Route cache error: ${err.message}`);
            return next();
        }

        const originalJson = res.json.bind(res);
        res.json = (data) => {
            setCache(key, data, ttl).catch(() => {});
            return originalJson(data);
        };
        next();
    };
}

module.exports = {
    CACHE_TTL,
    CACHE_ENABLED,
    getCacheStats,
    buildKey,
    getCache,
    setCache,
    deleteCache,
    invalidatePattern,
    invalidateCustomerCache,
    invalidateDashboardCache,
    invalidateAnalyticsCache,
    invalidateSearchCache,
    invalidateFinanceCache,
    invalidateReportsCache,
    invalidateStaffCache,
    routeCache,
};

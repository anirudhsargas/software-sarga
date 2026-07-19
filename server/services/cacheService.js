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

// Simple in-memory cache as fallback (Redis expected in production)
const memoryCache = new Map();

function getCacheStats() {
    if (!CACHE_ENABLED) return { hits: 0, misses: 0, byDomain: {} };
    return { hits: 0, misses: 0, byDomain: {}, size: memoryCache.size };
}

function buildKey(prefix, identifier) {
    return `sarga:${prefix}:${identifier}`;
}

async function getCache(key, domain = 'general') {
    if (!CACHE_ENABLED) return null;
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        memoryCache.delete(key);
        return null;
    }
    return entry.data;
}

async function setCache(key, data, ttl) {
    if (!CACHE_ENABLED) return;
    memoryCache.set(key, { data, expiry: Date.now() + (ttl || 300) * 1000 });
}

async function deleteCache(key) {
    memoryCache.delete(key);
}

async function invalidatePattern(pattern) {
    if (!CACHE_ENABLED) return 0;
    let count = 0;
    for (const key of memoryCache.keys()) {
        if (key.includes(pattern)) {
            memoryCache.delete(key);
            count++;
        }
    }
    return count;
}

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
};

const CACHE_ENABLED = false;

const CACHE_TTL = {
    DASHBOARD: 300,
    CUSTOMERS: 120,
    ANALYTICS: 600,
    SEARCH: 60,
    FINANCE: 300,
    REPORTS: 900,
    STAFF: 3600,
};

function getCacheStats() {
    return { hits: 0, misses: 0, byDomain: {} };
}

function buildKey(prefix, identifier) {
    return `sarga:${prefix}:${identifier}`;
}

async function getCache(key, domain = 'general') {
    return null;
}

async function setCache(key, data, ttl) {
    // No-op
}

async function deleteCache(key) {
    // No-op
}

async function invalidatePattern(pattern) {
    return 0;
}

async function invalidateCustomerCache() {
    return 0;
}

async function invalidateDashboardCache() {
    return 0;
}

async function invalidateAnalyticsCache() {
    return 0;
}

async function invalidateSearchCache() {
    return 0;
}

async function invalidateFinanceCache() {
    return 0;
}

async function invalidateReportsCache() {
    return 0;
}

async function invalidateStaffCache() {
    return 0;
}

function routeCache(ttl, keyFn) {
    return (req, res, next) => {
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

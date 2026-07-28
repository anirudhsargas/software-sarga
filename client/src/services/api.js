import axios from 'axios';
import { syncManager } from './syncWorkerManager';
import auth from './auth';

const normalizeApiUrl = (url) => {
    const raw = String(url || '').trim();
    if (!raw) return '';

    if (raw.startsWith('/')) {
        return `${window.location.origin}${raw}`;
    }

    const trimmed = raw.endsWith('/') ? raw.slice(0, -1) : raw;
    if (trimmed.endsWith('/api')) return `${trimmed}/`;
    if (trimmed.endsWith('/api/')) return trimmed;
    return `${trimmed}/api/`;
};

const normalizeRequestUrl = (url) => {
    if (!url) return url;
    let normalized = String(url).trim();
    if (normalized.startsWith('/')) normalized = normalized.replace(/^\/+/, '');
    if (normalized.startsWith('api/')) normalized = normalized.replace(/^api\//, '');
    return normalized;
};

// Centralized API URL for mobile/network access
const getApiUrl = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;

    if (isLocal) {
        if (envUrl && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
            return normalizeApiUrl(envUrl);
        }
        return 'http://localhost:3000/api/';
    }

    if (envUrl) {
        return normalizeApiUrl(envUrl);
    }

    // Fallback: If not local and no env var, we're likely on Vercel.
    // We should try to use the known Render backend URL or warn.
    console.warn('[API] VITE_API_URL is missing. Falling back to default Render backend.');
    return 'https://software-sarga-2.onrender.com/api/';
};

export const API_URL = getApiUrl();

export const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

/** Build a full image URL with auth token + ngrok bypass when needed */
export const imgUrl = (path) => {
    if (!path) return '';
    
    // If path is already a full URL (starts with http:// or https://), return it with token appended
    if (path.startsWith('http://') || path.startsWith('https://')) {
        const url = new URL(path);
        const token = localStorage.getItem('token');
        if (token) {
            url.searchParams.set('token', token);
        }
        if (FILE_BASE.includes('ngrok')) {
            url.searchParams.set('ngrok-skip-browser-warning', 'true');
        }
        return url.toString();
    }
    
    // Otherwise, prepend FILE_BASE
    const url = `${FILE_BASE}${path}`;
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (FILE_BASE.includes('ngrok')) params.set('ngrok-skip-browser-warning', 'true');
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
};

const api = axios.create({
    baseURL: API_URL,
    timeout: 20000,
    withCredentials: true
});
// --- Request Deduplication & Response Caching ---
const pendingRequests = new Map();
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Keep original axios GET reference so we can override api.get safely
const origGet = api.get.bind(api);

const getRequestKey = (url, config) => {
    let path = typeof url === 'string' ? url : (url && url.url) || '';
    if (path.startsWith('/')) {
        path = path.slice(1);
    }
    let params = '';
    try {
        if (config && config.params) params = JSON.stringify(config.params);
    } catch {
        params = String(config.params || '');
    }
    return `${path}|${params}`;
};

/** Deduplicated GET: If same request fires twice, only make one API call */
export const deduplicatedGet = async (url, config) => {
    const key = getRequestKey(url, config);
    if (pendingRequests.has(key)) return pendingRequests.get(key);
    const promise = origGet(url, config).finally(() => pendingRequests.delete(key));
    pendingRequests.set(key, promise);
    return promise;
};

/** Cached GET: For stable data (products, branches, customers) */
export const cachedGet = async (url, config) => {
    const key = getRequestKey(url, config);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data;
    }
    // Deduplicate in-flight requests so multiple callers get one network call
    if (pendingRequests.has(key)) return pendingRequests.get(key);
    const p = origGet(url, config).then((response) => {
        cache.set(key, { data: response, time: Date.now() });
        pendingRequests.delete(key);
        return response;
    }).catch((err) => {
        pendingRequests.delete(key);
        throw err;
    });
    pendingRequests.set(key, p);
    return p;
};

// Override api.get to provide automatic caching + dedup by default.
// Callers can opt-out by passing `{ _noCache: true }` in the config.
api.get = function (url, config) {
    if (config && config._noCache) return origGet(url, config);
    const key = getRequestKey(url, config);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return Promise.resolve(cached.data);
    }
    if (pendingRequests.has(key)) return pendingRequests.get(key);
    const p = origGet(url, config)
        .then((res) => {
            cache.set(key, { data: res, time: Date.now() });
            pendingRequests.delete(key);
            return res;
        })
        .catch((err) => {
            pendingRequests.delete(key);
            throw err;
        });
    pendingRequests.set(key, p);
    return p;
};

const createIdempotencyKey = (prefix = 'req') => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const requiresPaymentIdempotency = (url = '') => {
    const path = String(url || '').replace(/^\/+/, '');
    return [
        /^payments$/i,
        /^customer-payments$/i,
        /^customer-payments\/refund$/i
    ].some((rx) => rx.test(path));
};

// Automatically attach auth token to every request and fix absolute routes
api.interceptors.request.use((config) => {
    // Ensure URL is relative to baseURL and avoid duplicate /api segments.
    if (config.url) {
        config.url = normalizeRequestUrl(config.url);
    }

    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // Skip ngrok browser interstitial for API requests
    config.headers['ngrok-skip-browser-warning'] = 'true';

    // Enforce idempotency for high-risk payment creates to prevent duplicate writes on retries.
    if (String(config.method || '').toLowerCase() === 'post' && requiresPaymentIdempotency(config.url)) {
        if (!config.headers['Idempotency-Key']) {
            const key = createIdempotencyKey('pay');
            config.headers['Idempotency-Key'] = key;
        }
    }
    return config;
});

// Automatically handle 401 responses and cache invalidation
api.interceptors.response.use(
    (response) => {
        try { sessionStorage.removeItem('sarga_network_error'); } catch {}
        const method = response.config?.method?.toLowerCase();
        if (['post', 'put', 'delete', 'patch'].includes(method)) {
            // 1. Clear in-memory cache for API requests so next GET is fresh
            cache.clear();
            
            // 2. Tell sync worker to invalidate offline DB
            const url = response.config?.url || '';
            try {
                if (url.includes('product') || url.includes('categor')) {
                    syncManager.invalidateCache('products');
                    syncManager.invalidateCache('inventory');
                } else if (url.includes('inventory')) {
                    syncManager.invalidateCache('inventory');
                    syncManager.invalidateCache('products');
                } else if (url.includes('customer')) syncManager.invalidateCache('customers');
                else if (url.includes('staff')) syncManager.invalidateCache('staff');
                else if (url.includes('job') && !url.includes('bulk')) syncManager.invalidateCache('jobs');
                else if (url.includes('branch')) syncManager.invalidateCache('branches');
                else if (url.includes('machine')) syncManager.invalidateCache('machines');
            } catch (err) { console.error('Error invalidating syncManager cache', err); }
        }
        return response;
    },
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Avoid redirect loop if already on login or session-expired page
            if (window.location.pathname !== '/login' && window.location.pathname !== '/session-expired') {
                window.location.href = '/session-expired';
            }
            return Promise.reject(error);
        }

        if (error.response?.status === 429) {
            return Promise.resolve(error.response);
        }

        if (!error.response) {
            try { sessionStorage.setItem('sarga_network_error', '1'); } catch {}
            
            // Centralized fallback to prevent downstream crashes on .map() (e.g., branches/machines)
            const url = error.config?.url || '';
            let fallbackData = null;
            if (url.includes('branches') || url.includes('machines') || url.includes('customers')) {
                fallbackData = [];
            }

            if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
                return Promise.resolve({ data: fallbackData, offline: true });
            }
            return Promise.resolve({ data: fallbackData, offline: true });
        }

        return Promise.reject(error);
    }
);

// Legacy helper — kept for backward compatibility but no longer needed with interceptor
export const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const normalizeApiRequestUrl = normalizeRequestUrl;
export default api;

/** Preload frequently used static data so it's cached before any page needs it */
export const preloadStaticData = () => {
    // Only preload when the user has a valid (non-expired) token —
    // expired tokens return 401 which triggers the interceptor and wipes
    // localStorage, causing the login → dashboard → login redirect loop.
    if (!auth.isAuthenticated()) return;

    const endpoints = [
        'branches',
        'product-hierarchy',
        'company-settings',
        'machines'
    ];
    endpoints.forEach(endpoint => {
        cachedGet(endpoint).catch(() => {
            // Silently ignore — data will load when the relevant page opens
        });
    });
};

/** Preload static data with retry for cold-start resilience */
export const preloadStaticDataWithRetry = async (retries = 2) => {
    if (!auth.isAuthenticated()) return;
    const endpoints = ['branches', 'product-hierarchy', 'company-settings', 'machines'];
    for (const endpoint of endpoints) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                await cachedGet(endpoint);
                break;
            } catch {
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        }
    }
};

// When running locally without an auth token, point read-only requests to dev routes
export const devFallback = (path) => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const token = localStorage.getItem('token');
    if (isLocal && !token) {
        const clean = path && String(path).replace(/^\/+/, '');
        return clean.startsWith('dev/') ? `/${clean}` : `/dev/${clean}`;
    }
    return path;
};

/** Retry a fetch-based function with exponential backoff */
export async function fetchRetry(fn, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

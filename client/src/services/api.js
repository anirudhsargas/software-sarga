import axios from 'axios';

// Centralized API URL for mobile/network access
const getApiUrl = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;

    // If we're on localhost, call backend directly to avoid occasional Vite proxy issues
    if (isLocal) {
        return `${window.location.protocol}//localhost:5000/api/`;
    }

    if (envUrl) {
        let url = envUrl.endsWith('/') ? envUrl : envUrl + '/';
        if (!url.endsWith('api/')) {
            url += 'api/';
        }
        return url;
    }

    // Fallback: If not local and no env var, we're likely on Vercel.
    // We should try to use the known Render backend URL or warn.
    if (!isLocal) {
        console.warn('[API] VITE_API_URL is missing. Falling back to default Render backend.');
        return 'https://software-sarga-backend.onrender.com/api/';
    }

    return `${window.location.protocol}//${window.location.hostname}:5000/api/`;
};

export const API_URL = getApiUrl();

export const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

/** Build a full image URL with auth token + ngrok bypass when needed */
export const imgUrl = (path) => {
    if (!path) return '';
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
    timeout: 30000
});
// --- Request Deduplication & Response Caching ---
const pendingRequests = new Map();
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Keep original axios GET reference so we can override api.get safely
const origGet = api.get.bind(api);

const getRequestKey = (url, config) => {
    const path = typeof url === 'string' ? url : (url && url.url) || '';
    let params = '';
    try {
        if (config && config.params) params = JSON.stringify(config.params);
    } catch (e) {
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
        return cached.data; // Return cached axios response
    }
    const response = await origGet(url, config);
    cache.set(key, { data: response, time: Date.now() });
    return response;
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
    // Ensure URL is relative to baseURL by stripping leading slash
    if (config.url && config.url.startsWith('/')) {
        config.url = config.url.substring(1);
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
        const method = response.config?.method?.toLowerCase();
        if (['post', 'put', 'delete', 'patch'].includes(method)) {
            // 1. Clear in-memory cache for API requests so next GET is fresh
            cache.clear();
            
            // 2. Tell sync worker to invalidate offline DB
            const url = response.config?.url || '';
            import('./syncWorkerManager').then(({ syncManager }) => {
                if (url.includes('product') || url.includes('categor')) syncManager.invalidateCache('products');
                else if (url.includes('customer')) syncManager.invalidateCache('customers');
                else if (url.includes('inventory')) syncManager.invalidateCache('inventory');
                else if (url.includes('staff')) syncManager.invalidateCache('staff');
                else if (url.includes('job') && !url.includes('bulk')) syncManager.invalidateCache('jobs');
                else if (url.includes('branch')) syncManager.invalidateCache('branches');
                else if (url.includes('machine')) syncManager.invalidateCache('machines');
            }).catch(err => console.error('Error invalidating syncManager cache', err));
        }
        return response;
    },
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Legacy helper — kept for backward compatibility but no longer needed with interceptor
export const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default api;

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

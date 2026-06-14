import axios from 'axios';
import toast from 'react-hot-toast';

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

// Centralized API URL for mobile/network access
const getApiUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;

    if (envUrl) {
        return normalizeApiUrl(envUrl);
    }

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocal) {
        return 'http://localhost:3000/api/';
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
        if (error.config?.skipGlobalErrorHandling) {
            return Promise.reject(error);
        }

        const data = error.response?.data;
        const serverError = data?.error;
        const userMsg = serverError?.userMessage;
        const suggestion = serverError?.suggestion;

        if (error.request && !error.response) {
            try { toast.error('Network error — failed to reach server'); } catch (e) {}
            if (window.location.pathname !== '/error/network') {
                window.location.href = '/error/network';
            }
            return Promise.reject(error);
        }

        const status = error.response?.status;

        if (status === 429) {
            try { toast.error(userMsg || 'Too many requests. Please slow down.'); } catch (e) {}
            return Promise.reject(error);
        }

        if (status === 403) {
            try { toast.error(userMsg || 'Access denied.'); } catch (e) {}
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = '/login';
            } else if (window.location.pathname !== '/dashboard') {
                window.location.href = '/dashboard';
            }
            return Promise.reject(error);
        }

        if (status >= 500) {
            try { toast.error(userMsg || 'Server error. Redirecting to error page.'); } catch (e) {}
            if (window.location.pathname !== '/error/server') {
                window.location.href = '/error/server';
            }
            return Promise.reject(error);
        }

        if (status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        if (status === 422 && userMsg) {
            try { toast.error(userMsg); } catch (e) {}
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

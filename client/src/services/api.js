import axios from 'axios';

// Centralized API URL for mobile/network access
const getApiUrl = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;

    // If we're on localhost, try to use the local port 5000
    if (isLocal) {
        return `http://localhost:5000/api/`;
    }

    if (envUrl) {
        let url = envUrl.endsWith('/') ? envUrl : envUrl + '/';
        if (!url.endsWith('api/')) {
            url += 'api/';
        }
        return url;
    }

    // Fallback
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

// --- Request Deduplication ---
const pendingRequests = new Map();

/** Deduplicated GET: If same request fires twice, only make one API call */
export const deduplicatedGet = async (url) => {
    if (pendingRequests.has(url)) {
        return pendingRequests.get(url); // Return existing promise
    }
    const promise = api.get(url).finally(() => pendingRequests.delete(url));
    pendingRequests.set(url, promise);
    return promise;
};

// --- Response Caching for Stable Data ---
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Cached GET: For stable data (products, branches, customers) */
export const cachedGet = async (url) => {
    const cached = cache.get(url);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data; // Return from memory cache instantly
    }
    const response = await api.get(url);
    cache.set(url, { data: response, time: Date.now() });
    return response;
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

// Automatically handle 401 responses (expired/invalid token)
api.interceptors.response.use(
    (response) => response,
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

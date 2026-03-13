import axios from 'axios';

// Centralized API URL for mobile/network access
const getApiUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (envUrl) return envUrl;

    // Fallback for local development or missing env
    const fallback = `${window.location.protocol}//${window.location.hostname}:5000/api/`;
    
    // In production, warn if VITE_API_BASE_URL is missing
    if (import.meta.env.PROD) {
        console.warn('⚠️ VITE_API_BASE_URL is not defined in production environment. Falling back to:', fallback);
    }
    
    return fallback;
};

export const API_URL = getApiUrl();

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

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

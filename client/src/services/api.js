import axios from 'axios';

// Centralized API URL for mobile/network access
export const API_URL =
    import.meta.env.VITE_API_BASE_URL ||
    `${window.location.protocol}//${window.location.hostname}:5000/api/`;

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

import { jwtDecode } from 'jwt-decode';
import axios from 'axios';

// ⚠️ Do NOT import from './api' here — api.js imports auth.js,
// creating a circular dependency that causes a TDZ ReferenceError at runtime.
// Instead, we use a plain axios call for login/logout to break the cycle.
const _getApiBase = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
    if (envUrl) {
        const t = String(envUrl).trim().replace(/\/?$/, '/');
        return t.endsWith('/api/') ? t : t.replace(/\/?$/, '/api/');
    }
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) return 'http://localhost:3000/api/';
    return 'https://software-sarga-2.onrender.com/api/';
};

const _authHttp = axios.create({ withCredentials: true });

const AUTH_KEYS = ['token', 'user', 'refreshToken', 'refreshExpiresAt'];

// Whichever storage holds the current session ("remember me" → localStorage, else sessionStorage).
const _activeStore = () => (sessionStorage.getItem('token') || sessionStorage.getItem('refreshToken'))
    && !localStorage.getItem('token') ? sessionStorage : localStorage;

const _clearAuthStorage = () => {
    AUTH_KEYS.forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
};

// Seconds left on a JWT (negative when expired, -Infinity when unreadable).
const _secondsLeft = (token) => {
    if (!token) return -Infinity;
    try { return jwtDecode(token).exp - Date.now() / 1000; } catch { return -Infinity; }
};

let _refreshInFlight = null;

const auth = {
    login: async (userId, password, rememberMe = true) => {
        const response = await _authHttp.post(`${_getApiBase()}auth/login`, { user_id: userId, password, remember_me: !!rememberMe });
        if (response.data.token) auth.storeSession(response.data, rememberMe);
        return response.data;
    },

    /** Save a login response ({ token, refreshToken, refreshExpiresAt, user }) as the current session. */
    storeSession: (data, rememberMe = true) => {
        _clearAuthStorage();
        const store = rememberMe ? localStorage : sessionStorage;
        store.setItem('token', data.token);
        if (data.user) store.setItem('user', JSON.stringify(data.user));
        if (data.refreshToken) {
            store.setItem('refreshToken', data.refreshToken);
            store.setItem('refreshExpiresAt', data.refreshExpiresAt || '');
        }
    },

    logout: async () => {
        const token = auth.getToken();
        const refreshToken = auth.getRefreshToken();
        localStorage.clear();
        sessionStorage.clear();

        if (token) {
            _authHttp.post(`${_getApiBase()}auth/logout`, { refreshToken }, {
                headers: { Authorization: `Bearer ${token}` }
            }).catch(() => {});
        }

        window.location.href = '/login';
    },

    getToken: () => localStorage.getItem('token') || sessionStorage.getItem('token'),

    getRefreshToken: () => localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken'),

    /** True while a refresh token exists and has not passed its expiry. */
    hasUsableRefreshToken: () => {
        const rt = auth.getRefreshToken();
        if (!rt) return false;
        const exp = localStorage.getItem('refreshExpiresAt') || sessionStorage.getItem('refreshExpiresAt');
        if (!exp) return true;
        const ts = Date.parse(exp);
        return Number.isNaN(ts) ? true : ts > Date.now();
    },

    /** Replace the access token (e.g. after a branch switch) in the active storage. */
    setAccessToken: (token, user) => {
        const store = _activeStore();
        store.setItem('token', token);
        if (user) store.setItem('user', JSON.stringify(user));
        try { window.dispatchEvent(new CustomEvent('sarga:token-refreshed', { detail: { token } })); } catch { /* noop */ }
    },

    /**
     * Exchange the refresh token for a new access token. Concurrent callers share one request.
     * Resolves to the new access token, or null when the session can't be renewed.
     */
    refresh: () => {
        if (_refreshInFlight) return _refreshInFlight;
        const refreshToken = auth.getRefreshToken();
        if (!refreshToken) return Promise.resolve(null);
        const store = _activeStore();
        _refreshInFlight = _authHttp.post(`${_getApiBase()}auth/refresh`, { refreshToken })
            .then((res) => {
                const data = res.data || {};
                if (!data.token) return null;
                store.setItem('token', data.token);
                if (data.refreshToken) {
                    store.setItem('refreshToken', data.refreshToken);
                    store.setItem('refreshExpiresAt', data.refreshExpiresAt || '');
                }
                if (data.user) {
                    // Keep any client-side fields, take the server's role/branch/settings.
                    const prev = auth.getUser() || {};
                    store.setItem('user', JSON.stringify({ ...prev, ...data.user }));
                }
                try { window.dispatchEvent(new CustomEvent('sarga:token-refreshed', { detail: { token: data.token } })); } catch { /* noop */ }
                return data.token;
            })
            .catch((err) => {
                // Only a definitive rejection ends the session; network errors keep it for a retry.
                if (err?.response?.status === 401) _clearAuthStorage();
                return null;
            })
            .finally(() => { _refreshInFlight = null; });
        return _refreshInFlight;
    },

    /** Access token that is valid for at least `minSeconds`, refreshing first if needed. */
    getValidToken: async (minSeconds = 60) => {
        const token = auth.getToken();
        if (_secondsLeft(token) > minSeconds) return token;
        if (!auth.getRefreshToken()) return token;
        return (await auth.refresh()) || auth.getToken();
    },

    getUser: () => {
        const user = localStorage.getItem('user') || sessionStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    setUser: (user) => {
        if (localStorage.getItem('token')) {
            localStorage.setItem('user', JSON.stringify(user));
        } else if (sessionStorage.getItem('token')) {
            sessionStorage.setItem('user', JSON.stringify(user));
        } else {
            localStorage.setItem('user', JSON.stringify(user));
        }
    },

    isAuthenticated: () => {
        const token = auth.getToken();
        if (_secondsLeft(token) > 0) return true;
        // Access token expired, but the session can still be renewed silently.
        return !!token && auth.hasUsableRefreshToken();
    },
    normalizeRole: (role) => {
        if (!role) return '';
        const map = { 'admin': 'Admin', 'front office': 'Front Office', 'designer': 'Designer', 'printer': 'Printer', 'accountant': 'Accountant', 'other staff': 'Other Staff' };
        return map[role.toLowerCase().trim()] || role;
    },

    getRole: () => {
        const user = auth.getUser();
        return user && user.role ? user.role : '';
    },

    isRole: (...roles) => {
        const role = auth.normalizeRole(auth.getRole());
        return roles.some(r => auth.normalizeRole(r) === role);
    },

    can: (permission) => {
        const role = auth.getRole();
        const permissions = {
            admin: ['view_dashboard', 'manage_orders', 'manage_inventory', 'manage_expenses', 'manage_vendors', 'manage_staff', 'view_reports', 'manage_settings'],
            accountant: ['view_dashboard', 'manage_orders', 'manage_inventory', 'manage_expenses', 'manage_vendors', 'view_reports'],
            'front office': ['view_dashboard', 'manage_orders'],
            designer: ['view_dashboard'],
            printer: ['view_dashboard'],
            'other staff': ['view_dashboard'],
        };
        return permissions[role?.toLowerCase()]?.includes(permission) || false;
    },

    getAuthHeader: () => {
        const token = auth.getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }
};

export default auth;

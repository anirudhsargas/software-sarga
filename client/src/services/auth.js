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

const auth = {
    login: async (userId, password, rememberMe = true) => {
        const response = await _authHttp.post(`${_getApiBase()}auth/login`, { user_id: userId, password });
        if (response.data.token) {
            if (rememberMe) {
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('user', JSON.stringify(response.data.user));
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
            } else {
                sessionStorage.setItem('token', response.data.token);
                sessionStorage.setItem('user', JSON.stringify(response.data.user));
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        }
        return response.data;
    },

    logout: async () => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        localStorage.clear();
        sessionStorage.clear();

        if (token) {
            _authHttp.post(`${_getApiBase()}auth/logout`, null, {
                headers: { Authorization: `Bearer ${token}` }
            }).catch(() => {});
        }

        window.location.href = '/login';
    },

    getToken: () => localStorage.getItem('token') || sessionStorage.getItem('token'),

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
        if (!token) return false;
        try {
            const decoded = jwtDecode(token);
            return decoded.exp * 1000 > Date.now();
        } catch {
            return false;
        }
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

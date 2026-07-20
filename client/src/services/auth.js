import { jwtDecode } from 'jwt-decode';
import api from './api';

const auth = {
    login: async (userId, password) => {
        const response = await api.post('/auth/login', { user_id: userId, password });
        if (response.data.token) {
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    logout: async () => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        localStorage.clear();
        sessionStorage.clear();

        if (token) {
            api.post('/auth/logout', null, {
                headers: { Authorization: `Bearer ${token}` }
            }).catch(() => {});
        }

        window.location.href = '/login';
    },

    getToken: () => localStorage.getItem('token'),

    getUser: () => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    setUser: (user) => {
        localStorage.setItem('user', JSON.stringify(user));
    },

    isAuthenticated: () => {
        const token = localStorage.getItem('token');
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
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }
};

export default auth;

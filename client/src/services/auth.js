import { jwtDecode } from 'jwt-decode';
import api from './api';

const auth = {
    login: async (userId, password, rememberMe = true) => {
        const response = await api.post('/auth/login', { user_id: userId, password });
        if (response.data.token) {
            const storage = rememberMe ? localStorage : sessionStorage;
            storage.setItem('token', response.data.token);
            storage.setItem('user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/login';
    },

    getToken: () => localStorage.getItem('token') || sessionStorage.getItem('token'),

    getUser: () => {
        const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    },

    setUser: (user) => {
        const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
        storage.setItem('user', JSON.stringify(user));
    },

    isAuthenticated: () => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) return false;
        try {
            const decoded = jwtDecode(token);
            return decoded.exp * 1000 > Date.now();
        } catch {
            return false;
        }
    },
    getRole: () => {
        const user = auth.getUser();
        return user && user.role ? user.role : '';
    },

    getAuthHeader: () => {
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }
};

export default auth;

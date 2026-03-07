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

    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
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
        } catch (e) {
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

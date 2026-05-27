import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Public API calls (no auth needed for website)
export const getProducts = () => api.get('/website/products');
export const getServices = () => api.get('/website/services');
export const getBranches = () => api.get('/website/branches');
export const trackJob = (jobCode) => api.get(`/website/track/${jobCode}`);
export const submitInquiry = (data) => api.post('/website/inquiry', data);
export const getCategories = () => api.get('/website/categories');
export const getStats = () => api.get('/website/stats');

export default api;

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach X-Sarga-UUID header to all requests
api.interceptors.request.use((config) => {
  try {
    let uuid = localStorage.getItem('sarga_uuid');
    if (!uuid) {
      uuid = crypto.randomUUID ? crypto.randomUUID() : ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);}));
      localStorage.setItem('sarga_uuid', uuid);
    }
    config.headers['X-Sarga-UUID'] = uuid;
  } catch (e) {
    // ignore
  }
  return config;
});

// Public API calls (no auth needed for website)
export const getProducts = () => api.get('/website/products');
export const getServices = () => api.get('/website/services');
export const getBranches = () => api.get('/website/branches');
export const trackJob = (jobCode) => api.get(`/website/track/${jobCode}`);
export const submitInquiry = (data) => api.post('/website/inquiry', data);
export const getCategories = () => api.get('/website/categories');
export const getStats = () => api.get('/website/stats');
export const getChatHistory = (uuid, limit = 50) => {
  const q = [];
  if (uuid) q.push(`uuid=${encodeURIComponent(uuid)}`);
  if (limit) q.push(`limit=${Number(limit)}`);
  const qs = q.length ? `?${q.join('&')}` : '';
  return api.get(`/website/chat/history${qs}`);
};

export default api;

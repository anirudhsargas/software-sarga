import axios from 'axios';
import toast from 'react-hot-toast';

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
  // Attach customer token if present
  try {
    const token = localStorage.getItem('sarga_customer_token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
  } catch (e) {}
  return config;
});

// Public API calls (no auth needed for website)
export const getProducts = (params = {}) => api.get('/website/products', { params });
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

// Customer auth + dashboard
export const customerLogin = (phone) => api.post('/website/customer/login', { phone });
export const getCustomerDashboard = (customerId) => api.get(`/customers/${customerId}/dashboard`);
export const getWebsiteJob = (jobId) => api.get(`/website/job/${jobId}`);
export const reviewProofCustomer = (jobId, proofId, payload) => api.post(`/website/jobs/${jobId}/proofs/${proofId}/review-customer`, payload);
export const downloadInvoiceUrl = (invoiceId) => `${API_BASE}/api/website/invoices/${invoiceId}/download`;
export const customerSendOtp = (email) => api.post('/website/customer/send-otp', { email });
export const customerVerifyOtp = (email, otp) => api.post('/website/customer/verify-otp', { email, otp });

export default api;

// Response interceptor to surface server errors to users via toast
api.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      // Network offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.error('No internet connection.');
      } else if (error.response) {
        const status = error.response.status;
        if (status === 429) {
          toast.error('Too many requests. Please wait.');
        } else if (status === 403) {
          toast.error('Session error. Refreshing...');
        } else if (status >= 500) {
          toast.error('Server error. Please try again.');
        } else if (status === 401) {
          toast.error('Authentication required. Please sign in.');
        } else {
          const msg = (error.response.data && (error.response.data.error || error.response.data.message)) || `Request failed (${status})`;
          toast.error(msg);
        }
      } else {
        // Fallback network/CORS error
        toast.error('Network error. Check your connection.');
      }
    } catch (e) {
      // ignore toast errors
      // eslint-disable-next-line no-console
      console.warn('api interceptor error', e);
    }
    return Promise.reject(error);
  }
);

import axios from 'axios';

// In dev, Vite proxies nothing by default, so we call the backend directly.
// Set VITE_API_URL in a .env file if your backend runs somewhere other than localhost:4000.
export const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:4000`;

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true,
});

let csrfToken = null;

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const res = await axios.get(`${API_BASE}/api/csrf-token`, { withCredentials: true });
  csrfToken = res.data.csrfToken;
  return csrfToken;
}

api.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase();
  if (['post', 'put', 'delete', 'patch'].includes(method)) {
    const token = await ensureCsrfToken();
    config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

// If a CSRF token expires/is rejected, clear it so the next request fetches a fresh one.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 403 && /security token/i.test(err.response.data?.error || '')) {
      csrfToken = null;
    }
    return Promise.reject(err);
  }
);

export default api;

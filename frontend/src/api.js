import axios from 'axios';

// In development, VITE_API_URL can be used to point directly to the backend.
// In production Docker, leave VITE_API_URL empty so requests use the same
// origin and Nginx proxies /api requests to the backend container.
export const API_BASE =
  import.meta.env.VITE_API_URL || window.location.origin;

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true,
});

let csrfToken = null;

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;

  const res = await axios.get(
    `${API_BASE}/api/csrf-token`,
    { withCredentials: true },
  );

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

// If a CSRF token expires/is rejected, clear it so the next request
// fetches a fresh one.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response &&
      err.response.status === 403 &&
      /security token/i.test(
        err.response.data?.error || '',
      )
    ) {
      csrfToken = null;
    }

    return Promise.reject(err);
  },
);

export default api;
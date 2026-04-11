import axios from 'axios';

const api = axios.create({
  baseURL: '/api/loader',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 30000,
});

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^\s;]+)/);
  return match ? match[1] : null;
}

let csrfReady = api.get('/auth/csrf/').catch(() => {});

api.interceptors.request.use(async (config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  if (['post', 'put', 'patch', 'delete'].includes(config.method)) {
    if (!getCsrfToken()) await csrfReady;
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      config.headers['X-CSRFToken'] = csrfToken;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config.url.includes('/auth/login') &&
      !err.config.url.includes('/auth/me')
    ) {
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;

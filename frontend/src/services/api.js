import axios from 'axios';

// In same-origin deployments (e.g. the docker-compose/nginx setup, where
// nginx proxies /api/ to api-service on the same domain) VITE_API_BASE_URL
// is unset and the relative path works as-is. In split deployments (e.g.
// frontend on Vercel, api-service on Render, different domains) it MUST be
// set to the api-service's absolute URL, or every request 404s against
// Vercel's own domain instead of reaching the backend.
const configuredBase = import.meta.env.VITE_API_BASE_URL;
const baseURL = configuredBase ? `${configuredBase.replace(/\/$/, '')}/api/v1` : '/api/v1';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;
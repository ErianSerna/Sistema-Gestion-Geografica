// ============================================================
// frontend/src/utils/api.js
// Cliente HTTP centralizado con base URL del backend
// ============================================================

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' }
});

// Interceptor para errores globales
api.interceptors.response.use(
  res => res,
  err => {
    console.error('[API Error]', err.response?.status, err.config?.url);
    return Promise.reject(err);
  }
);

export default api;

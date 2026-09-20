import { API } from '../config';

export const API_BASE_URL = API;
export const STORAGE_KEY = 'aegis_token';

let onUnauthorizedCallback = null;

export function setUnauthorizedHandler(callback) {
  onUnauthorizedCallback = callback;
}

/**
 * Generic API fetch wrapper.
 * Automatically injects Bearer JWT, handles cookie credentials,
 * manages 401 unauthorization callbacks, and parses errors and JSON.
 */
export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem(STORAGE_KEY);
  const headers = { ...options.headers };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (!url.includes('/auth/login')) {
      onUnauthorizedCallback?.();
    }
  }

  if (!response.ok) {
    let errorMsg = `API Error: ${response.statusText} (${response.status})`;
    try {
      const data = await response.json();
      if (data && data.detail) {
        errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // Non-JSON error body
    }
    const error = new Error(errorMsg);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

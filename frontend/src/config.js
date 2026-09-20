/**
 * Central frontend configuration.
 * Reads backend API URL from Vite environment variable VITE_API_URL,
 * with fallback to http://localhost:8000.
 */
export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

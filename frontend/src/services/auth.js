import { apiFetch } from './core';

export const authService = {
  async login(username, password) {
    return apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async logout() {
    return apiFetch('/auth/logout', {
      method: 'POST',
    });
  },

  async getMe() {
    return apiFetch('/auth/me');
  },
};

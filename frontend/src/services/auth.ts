import { apiFetch } from './core';
import type { AuthResponse, UserResponse } from '../types';

export const authService = {
  async login(username: string, password: string): Promise<AuthResponse> {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async logout(): Promise<void> {
    return apiFetch<void>('/auth/logout', {
      method: 'POST',
    });
  },

  async getMe(): Promise<UserResponse> {
    return apiFetch<UserResponse>('/auth/me');
  },
};

import { apiFetch } from './core';
import type { SystemHealthResponse } from '../types';

export const systemService = {
  async getSystemHealth(): Promise<SystemHealthResponse> {
    return apiFetch<SystemHealthResponse>('/settings/system');
  },
};

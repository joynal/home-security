import { apiFetch, API_BASE_URL } from './core';
import type { CamerasResponse } from '../types';

export const cameraService = {
  async getCameras(): Promise<CamerasResponse> {
    return apiFetch<CamerasResponse>('/cameras');
  },

  getVideoFeedUrl(cameraId?: string): string {
    return cameraId
      ? `${API_BASE_URL}/video_feed/${encodeURIComponent(cameraId)}`
      : `${API_BASE_URL}/video_feed`;
  },
};

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

  /**
   * Single still frame from the latest annotated frame — cheap alternative to
   * the MJPEG stream for grid tiles. `bust` (epoch ms) cache-breaks refreshes.
   */
  getSnapshotUrl(cameraId: string, bust?: number): string {
    const base = `${API_BASE_URL}/cameras/${encodeURIComponent(cameraId)}/snapshot.jpg`;
    return bust ? `${base}?t=${bust}` : base;
  },
};

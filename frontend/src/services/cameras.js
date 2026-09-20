import { apiFetch, API_BASE_URL } from './core';

export const cameraService = {
  async getCameras() {
    return apiFetch('/cameras');
  },

  getVideoFeedUrl(cameraId) {
    return cameraId
      ? `${API_BASE_URL}/video_feed/${encodeURIComponent(cameraId)}`
      : `${API_BASE_URL}/video_feed`;
  },
};

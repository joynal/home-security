import { apiFetch, API_BASE_URL } from './core';

export const recordingService = {
  async getSummary() {
    return apiFetch('/recordings/summary');
  },

  async getTimeline(cameraId, date) {
    return apiFetch(`/recordings/${encodeURIComponent(cameraId)}/timeline?date=${encodeURIComponent(date)}`);
  },

  getRecordingUrl(cameraId, filename) {
    return `${API_BASE_URL}/recordings/${encodeURIComponent(cameraId)}/${encodeURIComponent(filename)}`;
  },
};

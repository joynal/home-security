import { apiFetch, API_BASE_URL } from './core';
import type { RecordingsSummaryResponse, TimelineResponse } from '../types';

export const recordingService = {
  async getSummary(): Promise<RecordingsSummaryResponse> {
    return apiFetch<RecordingsSummaryResponse>('/recordings/summary');
  },

  async getTimeline(cameraId: string, date: string): Promise<TimelineResponse> {
    return apiFetch<TimelineResponse>(
      `/recordings/${encodeURIComponent(cameraId)}/timeline?date=${encodeURIComponent(date)}`,
    );
  },

  getRecordingUrl(cameraId: string, filename: string): string {
    return `${API_BASE_URL}/recordings/${encodeURIComponent(cameraId)}/${encodeURIComponent(filename)}`;
  },

  getClipUrl(cameraId: string, start: number, end: number, padding: number = 5.0): string {
    return `${API_BASE_URL}/recordings/${encodeURIComponent(cameraId)}/clip.mp4?start=${start}&end=${end}&padding=${padding}`;
  },

  getFrameUrl(cameraId: string, ts: number): string {
    return `${API_BASE_URL}/recordings/${encodeURIComponent(cameraId)}/frame.jpg?ts=${ts}`;
  },
};

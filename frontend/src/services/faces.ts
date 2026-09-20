import { apiFetch, API_BASE_URL } from './core';
import type { FacesResponse, FaceImportResponse, AddFaceResponse } from '../types';

export const faceService = {
  async getFaces(): Promise<FacesResponse> {
    return apiFetch<FacesResponse>('/faces');
  },

  async deleteFace(name: string): Promise<void> {
    return apiFetch<void>(`/faces/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  },

  async importFaces(name: string, files: File[]): Promise<FaceImportResponse> {
    const form = new FormData();
    form.append('name', name.trim());
    files.forEach((f) => form.append('files', f, f.name));
    return apiFetch<FaceImportResponse>('/faces/import', {
      method: 'POST',
      body: form,
    });
  },

  async addFaceFromEvent(name: string, eventId: number | string): Promise<AddFaceResponse> {
    return apiFetch<AddFaceResponse>(`/faces/${encodeURIComponent(name.trim())}/add`, {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId }),
    });
  },

  getFaceImageUrl(name: string, filename: string): string {
    return `${API_BASE_URL}/faces/${encodeURIComponent(name)}/img/${encodeURIComponent(filename)}`;
  },
};
